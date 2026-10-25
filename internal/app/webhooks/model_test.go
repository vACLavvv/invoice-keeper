package webhooks

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

func testDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "test.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestImportLegacyPreservesEveryDeliveryStateAndNeverReimports(t *testing.T) {
	db := testDB(t)
	states := []string{"pending", "sending", "sent", "uncertain", "failed", "cancelled"}
	for i, state := range states {
		id := i + 1
		if _, err := db.Exec("INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(?,'Test',100,'RUB','2026-01-31',31,'now')", id); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,'2026-01-31',100,'RUB')", id, id); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO deliveries(occurrence_id,kind,channel,state,attempts,attempted_at,retry_after,sent_at,error,claim_token,dispatch_started_at)
			VALUES(?,'due','webhook',?,3,123,999,'sent time','existing error','claim-token',124)`, id, state); err != nil {
			t.Fatal(err)
		}
	}
	db.Exec("INSERT INTO app_state(key,value) VALUES('notify_backoff:webhook','98765')")
	s := &config.Settings{WebhookURL: "https://example.com/receiver?token=secret", WebhookSecret: "signing-secret", WebhookAllowPrivate: true, OverdueReminders: true}
	if err := ImportLegacy(db, s); err != nil {
		t.Fatal(err)
	}
	endpoints, err := List(db)
	if err != nil || len(endpoints) != 1 {
		t.Fatal(endpoints, err)
	}
	e := endpoints[0]
	if e.URL != s.WebhookURL || e.Secret != s.WebhookSecret || !e.Enabled || !e.NotifyDue || !e.NotifyOverdue || !e.AllowPrivate || !e.LegacySource {
		t.Fatal("legacy endpoint was not preserved", e)
	}
	for i, state := range states {
		var gotState, channel, sent, reason, claim string
		var attempts, attempted, retry, dispatched int
		err := db.QueryRow(`SELECT channel,state,attempts,attempted_at,retry_after,sent_at,error,claim_token,dispatch_started_at FROM deliveries WHERE occurrence_id=?`, i+1).
			Scan(&channel, &gotState, &attempts, &attempted, &retry, &sent, &reason, &claim, &dispatched)
		if err != nil {
			t.Fatal(err)
		}
		if channel != Channel(e.ID) || state != gotState || attempts != 3 || attempted != 123 || retry != 999 || sent != "sent time" || reason != "existing error" || claim != "claim-token" || dispatched != 124 {
			t.Fatal("delivery changed during migration", i, state, gotState)
		}
	}
	var backoff string
	if err := db.QueryRow("SELECT value FROM app_state WHERE key=?", "notify_backoff:"+Channel(e.ID)).Scan(&backoff); err != nil || backoff != "98765" {
		t.Fatal("backoff missing", backoff, err)
	}
	db.Exec("UPDATE webhook_endpoints SET enabled=0,deleted_at='removed' WHERE id=?", e.ID)
	s.WebhookURL = "https://changed.example/stale-env"
	if err := ImportLegacy(db, s); err != nil {
		t.Fatal(err)
	}
	var count int
	db.QueryRow("SELECT COUNT(*) FROM webhook_endpoints").Scan(&count)
	if count != 1 {
		t.Fatal("stale env re-imported", count)
	}
	removed, err := Get(db, e.ID)
	if err != nil || removed.Enabled || removed.DeletedAt == nil {
		t.Fatal("removed endpoint resurrected", err)
	}
}

func TestImportEmptyEnvironmentStillLocksBootstrap(t *testing.T) {
	db := testDB(t)
	if err := ImportLegacy(db, &config.Settings{}); err != nil {
		t.Fatal(err)
	}
	if err := ImportLegacy(db, &config.Settings{WebhookURL: "https://example.com/late"}); err != nil {
		t.Fatal(err)
	}
	items, err := List(db)
	if err != nil || len(items) != 0 {
		t.Fatal("later env unexpectedly subscribed", items, err)
	}
}

func TestLegacyURLAndSecretAreEncryptedWithFieldBinding(t *testing.T) {
	db := testDB(t)
	key, err := security.ParseEncryptionKey(security.NewEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}
	if err := security.ConfigureKey(db, key); err != nil {
		t.Fatal(err)
	}
	defer func() {
		clean := testDB(t)
		if err := security.ConfigureKey(clean, nil); err != nil {
			t.Fatal(err)
		}
	}()
	s := &config.Settings{WebhookURL: "https://example.com/?token=private-query", WebhookSecret: "private-signing-key"}
	if err := ImportLegacy(db, s); err != nil {
		t.Fatal(err)
	}
	var rawURL, rawSecret string
	if err := db.QueryRow("SELECT url,secret FROM webhook_endpoints").Scan(&rawURL, &rawSecret); err != nil {
		t.Fatal(err)
	}
	if !security.IsSealedText(rawURL) || !security.IsSealedText(rawSecret) || strings.Contains(rawURL, "private-query") || strings.Contains(rawSecret, s.WebhookSecret) {
		t.Fatal("credentials are not sealed")
	}
	items, err := List(db)
	if err != nil || len(items) != 1 || items[0].URL != s.WebhookURL || items[0].Secret != s.WebhookSecret {
		t.Fatal("decryption failed", err)
	}
	if _, err := security.DecryptText("webhook_endpoints.secret", rawURL); err == nil {
		t.Fatal("ciphertext can be moved to another field")
	}
}

func TestEndpointURLIdentityAndPartialUniqueness(t *testing.T) {
	one, err := URLKey("HTTPS://Example.com:443#fragment")
	if err != nil {
		t.Fatal(err)
	}
	two, _ := URLKey("https://example.com/")
	if one != two {
		t.Fatal("equivalent URL identity differs")
	}
	a, _ := URLKey("https://example.com/?a=1&b=2")
	b, _ := URLKey("https://example.com/?b=2&a=1")
	if a == b {
		t.Fatal("query ordering changed")
	}
	db := testDB(t)
	insert := func() error {
		_, err := db.Exec("INSERT INTO webhook_endpoints(name,url,url_key,created_at,updated_at) VALUES('Test','https://example.com/',?,'now','now')", one)
		return err
	}
	if err := insert(); err != nil {
		t.Fatal(err)
	}
	if err := insert(); !store.IsUniqueViolation(err) {
		t.Fatal("duplicate live URL accepted", err)
	}
	db.Exec("UPDATE webhook_endpoints SET deleted_at='removed'")
	if err := insert(); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow("SELECT COUNT(DISTINCT id) FROM webhook_endpoints").Scan(&count); err != nil || count != 2 {
		t.Fatal("endpoint ID reused", err)
	}
	if _, err := Get(db, 999); err != sql.ErrNoRows {
		t.Fatal(err)
	}
}
