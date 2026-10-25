package store

import (
	"path/filepath"
	"testing"
)

func TestMigrationTenAddsEndpointsWithoutRewritingLegacyDeliveries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "webhooks.sqlite3")
	db, err := OpenDB(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(1,'existing',100,'RUB','2026-01-31',31,'x');
INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(1,1,'2026-01-31',100,'RUB');
INSERT INTO deliveries(occurrence_id,kind,channel,state,attempts,claim_token,dispatch_started_at) VALUES(1,'due','webhook','uncertain',4,'existing-claim',123);
DROP TABLE webhook_endpoints;
DROP INDEX deliveries_channel_pending;
DROP INDEX deliveries_channel_history;
PRAGMA user_version=9;`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = OpenDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var state, channel, token string
	var attempts, started int
	if err := db.QueryRow("SELECT channel,state,claim_token,attempts,dispatch_started_at FROM deliveries").Scan(&channel, &state, &token, &attempts, &started); err != nil {
		t.Fatal(err)
	}
	if channel != "webhook" || state != "uncertain" || token != "existing-claim" || attempts != 4 || started != 123 {
		t.Fatal("schema migration rewrote a delivery before encrypted bootstrap")
	}
	for _, object := range []string{"webhook_endpoints", "webhook_endpoints_live_url", "webhook_endpoints_active", "deliveries_channel_pending", "deliveries_channel_history"} {
		var count int
		if err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE name=?", object).Scan(&count); err != nil || count != 1 {
			t.Fatal("schema object missing", object, err)
		}
	}
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil || version != 10 {
		t.Fatal("schema version", version, err)
	}
	var integrity string
	if err := db.QueryRow("PRAGMA quick_check").Scan(&integrity); err != nil || integrity != "ok" {
		t.Fatal("integrity", integrity, err)
	}
}
