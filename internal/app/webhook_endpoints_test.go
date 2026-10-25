package app

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/webhooks"
)

const webhooksPath = "/api/v1/webhooks"

func createWebhook(t *testing.T, c *client, values map[string]any) webhookEndpointItem {
	t.Helper()
	input := map[string]any{"name": "Accounting", "url": "https://billing.example/hooks", "enabled": false}
	for k, v := range values {
		input[k] = v
	}
	result := c.post(webhooksPath, input)
	if result.status != 201 {
		t.Fatalf("create webhook: %d %s", result.status, result.body)
	}
	var item webhookEndpointItem
	result.json(t, &item)
	return item
}

func seedWebhook(t *testing.T, e *harness, address, secret string, legacy bool) int64 {
	t.Helper()
	key, err := webhooks.URLKey(address)
	if err != nil {
		t.Fatal(err)
	}
	result, err := e.db.Exec(`INSERT INTO webhook_endpoints(name,url,secret,url_key,enabled,notify_due,notify_overdue,allow_private,legacy_source,created_at,updated_at)
		VALUES('Legacy',?,?,?,0,1,1,?,?,?,?)`, security.EncryptText("webhook_endpoints.url", address), security.EncryptText("webhook_endpoints.secret", secret), key, legacy, legacy, "2026-01-28T10:00:00+00:00", "2026-01-28T10:00:00+00:00")
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestWebhooksManagerAdminSessionAndCSRF(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	item := createWebhook(t, admin, nil)
	path := webhooksPath + "/" + itoa(item.ID)
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "User", "email": "user@example.com", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	for name, c := range map[string]*client{"anonymous": e.client(), "user": user, "read token": e.keyClient(admin.createToken("read", 30)), "write token": e.keyClient(admin.createToken("write", 30))} {
		want := 403
		if name == "anonymous" {
			want = 401
		}
		for _, response := range []response{c.get(webhooksPath), c.get(path + "/deliveries"), c.post(webhooksPath, map[string]any{}), c.patch(path, map[string]any{}), c.delete(path), c.post(path+"/test", nil)} {
			expect(t, name+" rejected", response.status, want)
		}
	}
	noCSRF := *admin
	noCSRF.csrf = ""
	for _, response := range []response{noCSRF.post(webhooksPath, map[string]any{}), noCSRF.patch(path, map[string]any{}), noCSRF.delete(path), noCSRF.post(path+"/test", nil)} {
		expect(t, "CSRF required", response.status, 403)
	}
	expect(t, "foreign origin rejected", admin.do("PATCH", path, map[string]any{"enabled": true}, "Origin", "https://other.example").status, 403)
	var count int
	e.db.QueryRow("SELECT count(*) FROM webhook_endpoints WHERE deleted_at IS NULL").Scan(&count)
	expect(t, "unauthorized mutations had no effect", count, 1)
}

func TestWebhooksCRUDEncryptedSecretsAndSafeAudit(t *testing.T) {
	e := setup(t)
	key, err := security.ParseEncryptionKey(security.NewEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}
	if err := ConfigureEncryption(e.db, key); err != nil {
		t.Fatal(err)
	}
	admin := e.client()
	admin.signIn()
	const secret = "hook-signing-secret-do-not-return"
	const address = "https://billing.example/hooks?token=operator-query-secret"
	item := createWebhook(t, admin, map[string]any{"url": address, "secret": secret, "notify_overdue": false})
	expect(t, "editable URL round trip", item.URL, address)
	expect(t, "secret presence only", item.HasSecret, true)
	expect(t, "new URL editable", item.URLReadonly, false)
	expect(t, "no private allowance", item.AllowPrivate, false)
	expect(t, "no automatic history", item.LastDelivery == nil, true)
	var storedURL, storedSecret string
	if err := e.db.QueryRow("SELECT url,secret FROM webhook_endpoints WHERE id=?", item.ID).Scan(&storedURL, &storedSecret); err != nil {
		t.Fatal(err)
	}
	if !security.IsSealedText(storedURL) || !security.IsSealedText(storedSecret) || strings.Contains(storedURL, "operator-query-secret") || strings.Contains(storedSecret, secret) {
		t.Fatal("sensitive endpoint data not encrypted")
	}
	path := webhooksPath + "/" + itoa(item.ID)
	updated := admin.patch(path, map[string]any{"name": "Finance"})
	expect(t, "partial edit", updated.status, 200)
	if bytes.Contains(updated.body, []byte(secret)) {
		t.Fatal("secret leaked in response")
	}
	endpoint, err := webhooks.Get(e.db, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "omitted secret preserved", endpoint.Secret, secret)
	expect(t, "omitted URL preserved", endpoint.URL, address)
	expect(t, "clear secret", admin.patch(path, map[string]any{"secret": ""}).status, 200)
	endpoint, err = webhooks.Get(e.db, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "explicit empty secret clears", endpoint.Secret, "")
	listed := admin.get(webhooksPath)
	if bytes.Contains(listed.body, []byte(secret)) {
		t.Fatal("secret leaked in listing")
	}
	var list struct {
		Items []webhookEndpointItem
		Limit int
	}
	listed.json(t, &list)
	expect(t, "list limit", list.Limit, 50)
	expect(t, "list item", len(list.Items), 1)
	expect(t, "soft delete", admin.delete(path).status, 204)
	expect(t, "deleted test rejected", admin.post(path+"/test", nil).status, 404)
	expect(t, "deleted update rejected", admin.patch(path, map[string]any{"enabled": true}).status, 404)
	expect(t, "deleted history retained", admin.get(path+"/deliveries").status, 200)
	admin.get(webhooksPath).json(t, &list)
	expect(t, "hidden after deletion", len(list.Items), 0)
	rows, err := e.db.Query("SELECT action,entity FROM audit_log WHERE action LIKE 'webhook.%'")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var action, entity string
		if err := rows.Scan(&action, &entity); err != nil {
			t.Fatal(err)
		}
		expect(t, "audit stores only endpoint ID", entity, itoa(item.ID))
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
}

func TestWebhooksEncryptionBackfillsExistingPlaintext(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	const address = "https://accounting.example/events?token=original-query-credential"
	const secret = "original-plaintext-signing-secret"
	item := createWebhook(t, admin, map[string]any{"url": address, "secret": secret})
	var storedURL, storedSecret string
	readStored := func() {
		t.Helper()
		if err := e.db.QueryRow("SELECT url,secret FROM webhook_endpoints WHERE id=?", item.ID).Scan(&storedURL, &storedSecret); err != nil {
			t.Fatal(err)
		}
	}
	readStored()
	expect(t, "fixture starts without encryption", storedURL, address)
	expect(t, "fixture plaintext secret", storedSecret, secret)
	key := bytes.Repeat([]byte{53}, 32)
	if err := ConfigureEncryption(e.db, key); err != nil {
		t.Fatal(err)
	}
	readStored()
	if !security.IsSealedText(storedURL) || !security.IsSealedText(storedSecret) || strings.Contains(storedURL, "original-query-credential") || strings.Contains(storedSecret, secret) {
		t.Fatal("enabling encryption must backfill both endpoint columns")
	}
	sealedURL, sealedSecret := storedURL, storedSecret
	if err := ConfigureEncryption(e.db, key); err != nil {
		t.Fatal(err)
	}
	readStored()
	expect(t, "repeated startup does not double-encrypt URL", storedURL, sealedURL)
	expect(t, "repeated startup does not double-encrypt secret", storedSecret, sealedSecret)
	endpoint, err := webhooks.Get(e.db, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "worker reads original URL after backfill", endpoint.URL, address)
	expect(t, "worker reads original signing secret after backfill", endpoint.Secret, secret)
	var listing struct{ Items []webhookEndpointItem }
	result := admin.get(webhooksPath)
	result.json(t, &listing)
	expect(t, "panel still edits URL", listing.Items[0].URL, address)
	expect(t, "panel knows secret exists", listing.Items[0].HasSecret, true)
	if bytes.Contains(result.body, []byte(secret)) {
		t.Fatal("backfilled secret leaked through API")
	}
	expect(t, "existing audit trail remains valid", admin.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

func TestWebhooksValidationUniquenessAndLimit(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	for _, address := range []string{"http://127.0.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://169.254.169.254/", "http://192.168.1.1/", "http://192.0.2.1/", "http://100.64.0.1/", "http://localhost/", "http://service.local/", "https://user:password@billing.example/", "https://billing.example/#x", "ftp://billing.example/"} {
		expect(t, "unsafe URL", admin.post(webhooksPath, map[string]any{"name": "Bad", "url": address, "enabled": false}).status, 422)
	}
	for _, input := range []map[string]any{{"name": "Bad", "url": nil}, {"name": nil, "url": "https://billing.example/"}, {"name": "Bad", "url": "https://billing.example/", "enabled": nil}, {"name": "Bad", "url": "https://billing.example/", "allow_private": true}, {"name": "Bad", "url": "https://billing.example/", "secret": "enc:v1:fake"}} {
		expect(t, "invalid field", admin.post(webhooksPath, input).status, 422)
	}
	first := createWebhook(t, admin, map[string]any{"url": "https://EXAMPLE.com:443"})
	expect(t, "equivalent URL duplicate", admin.post(webhooksPath, map[string]any{"name": "Second", "url": "https://example.com/", "enabled": false}).status, 409)
	for i := 1; i < webhookEndpointLimit; i++ {
		createWebhook(t, admin, map[string]any{"url": fmt.Sprintf("https://receiver-%d.example/", i)})
	}
	expect(t, "limit includes disabled endpoints", admin.post(webhooksPath, map[string]any{"name": "Extra", "url": "https://extra.example/", "enabled": false}).status, 409)
	expect(t, "delete frees slot", admin.delete(webhooksPath+"/"+itoa(first.ID)).status, 204)
	createWebhook(t, admin, map[string]any{"url": "https://new.example/"})
}

func TestWebhooksLegacyEditingAndSignedTest(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	const secret = "legacy-private-signing-secret"
	type seenRequest struct{ Body, Signature, Delivery, Event string }
	seen := make(chan seenRequest, 2)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		seen <- seenRequest{string(raw), r.Header.Get("X-Invoice-Keeper-Signature"), r.Header.Get("X-Invoice-Keeper-Delivery"), r.Header.Get("X-Invoice-Keeper-Event")}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"accepted","echo":%q}`, secret)
	}))
	defer receiver.Close()
	address := receiver.URL + "/events?key=legacy-query-secret"
	id := seedWebhook(t, e, address, secret, true)
	path := webhooksPath + "/" + itoa(id)
	var list struct{ Items []webhookEndpointItem }
	listed := admin.get(webhooksPath)
	listed.json(t, &list)
	expect(t, "legacy safe URL", list.Items[0].URL, receiver.URL+"/events")
	expect(t, "legacy URL read only", list.Items[0].URLReadonly, true)
	if bytes.Contains(listed.body, []byte("legacy-query-secret")) || bytes.Contains(listed.body, []byte(secret)) {
		t.Fatal("legacy secret leaked")
	}
	expect(t, "legacy name edit allowed", admin.patch(path, map[string]any{"name": "Local consumer"}).status, 200)
	endpoint, err := webhooks.Get(e.db, id)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "legacy real URL preserved", endpoint.URL, address)
	for range 2 {
		result := consoleResult(t, admin.post(path+"/test", nil))
		expect(t, "explicit disabled endpoint test", result.Status, 200)
		if strings.Contains(result.Body, secret) {
			t.Fatal("test echo leaked secret")
		}
	}
	first, second := <-seen, <-seen
	expect(t, "fixed synthetic body", first.Body, webhookTestBody)
	expect(t, "signed with endpoint secret", first.Signature, notify.WebhookSignature(secret, []byte(webhookTestBody)))
	expect(t, "test event", first.Event, "webhook.test")
	if !strings.HasPrefix(first.Delivery, "test:") || first.Delivery == second.Delivery {
		t.Fatal("each test needs a fresh test delivery ID")
	}
	var count int
	e.db.QueryRow("SELECT count(*) FROM deliveries WHERE channel=?", webhooks.Channel(id)).Scan(&count)
	expect(t, "manual tests not in automatic history", count, 0)
	expect(t, "cannot replace with another private path", admin.patch(path, map[string]any{"url": receiver.URL + "/different"}).status, 422)
	expect(t, "public replacement allowed", admin.patch(path, map[string]any{"url": "https://new.example/events"}).status, 200)
	endpoint, err = webhooks.Get(e.db, id)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "replacement drops private permission", endpoint.AllowPrivate, false)
	expect(t, "replacement drops legacy flag", endpoint.LegacySource, false)
}

func TestWebhooksDispatchFenceCancellationAndHistory(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	item := createWebhook(t, admin, nil)
	path := webhooksPath + "/" + itoa(item.ID)
	now := time.Now().Unix()
	err := e.db.Write(func(tx *sql.Tx) error {
		for i, state := range []string{"pending", "sending", "sending", "sent", "failed"} {
			id := i + 1
			if _, err := tx.Exec("INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,frequency,next_index,created_at) VALUES(?, 'future',100,'RUB','2099-01-31',31,'once',1,'x')", id); err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,'2099-01-31',100,'RUB')", id, id); err != nil {
				return err
			}
			var started any
			if id == 3 {
				started = now
			}
			if _, err := tx.Exec("INSERT INTO deliveries(occurrence_id,kind,channel,state,attempts,attempted_at,claim_token,dispatch_started_at) VALUES(?,'due',?,?,1,?,?,?)", id, webhooks.Channel(item.ID), state, now, fmt.Sprintf("claim-%d", id), started); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "URL change fenced during dispatch", admin.patch(path, map[string]any{"name": "must rollback", "url": "https://other.example/"}).status, 409)
	expect(t, "secret change fenced during dispatch", admin.patch(path, map[string]any{"secret": "new-secret"}).status, 409)
	endpoint, err := webhooks.Get(e.db, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "failed mutation atomic", endpoint.Name, "Accounting")
	expect(t, "name change safe during dispatch", admin.patch(path, map[string]any{"name": "Renamed"}).status, 200)
	expect(t, "delete can stop undispatched work", admin.delete(path).status, 204)
	rows, err := e.db.Query("SELECT state FROM deliveries WHERE channel=? ORDER BY occurrence_id", webhooks.Channel(item.ID))
	if err != nil {
		t.Fatal(err)
	}
	states := []string{}
	for rows.Next() {
		var state string
		rows.Scan(&state)
		states = append(states, state)
	}
	rows.Close()
	expect(t, "only undispatched deliveries cancelled", strings.Join(states, ","), "cancelled,cancelled,sending,sent,failed")
	var history pageResult[webhookDeliveryItem]
	result := admin.get(path + "/deliveries?page_size=2")
	expect(t, "deleted endpoint history available", result.status, 200)
	result.json(t, &history)
	expect(t, "bounded page", len(history.Items), 2)
	expect(t, "total history", history.Total, 5)
	expect(t, "history page count", history.Pages, 3)
	expect(t, "latest attempt first stable tie", history.Items[0].OccurrenceID, int64(5))
	expect(t, "invalid page size", admin.get(path+"/deliveries?page_size=101").status, 422)
}

func TestWebhooksAuditFailureRollsBackMutation(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	if _, err := e.db.Exec("CREATE TRIGGER reject_webhook_audit BEFORE INSERT ON audit_log WHEN NEW.action='webhook.create' BEGIN SELECT RAISE(ABORT,'test'); END"); err != nil {
		t.Fatal(err)
	}
	result := admin.post(webhooksPath, map[string]any{"name": "Rollback", "url": "https://rollback.example/", "enabled": false})
	expect(t, "audit failure blocks create", result.status, 500)
	var count int
	e.db.QueryRow("SELECT count(*) FROM webhook_endpoints").Scan(&count)
	expect(t, "no unaudited endpoint", count, 0)
}

func TestWebhookManagerResponseOmitsSecretField(t *testing.T) {
	raw, err := json.Marshal(webhookEndpointItem{HasSecret: true})
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte(`"secret":`)) {
		t.Fatal("secret field must never be returned")
	}
}
