package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	invoicekeeper "invoice-keeper"
	"invoice-keeper/internal/app/store"
)

func TestIdempotencyConcurrentAcrossServersAndReplay(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	db2, err := store.OpenDB(e.settings.DatabasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()
	s2, err := NewServer(e.settings, db2, invoicekeeper.Assets, Options{Today: e.server.Today})
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Worker.Wait()
	other := httptest.NewServer(s2)
	defer other.Close()
	body := []byte(`{"title":"Exactly one","amount":"12.34","currency":"RUB","first_due_date":"2026-01-28","frequency":"once"}`)
	type answer struct {
		status int
		body   []byte
		err    error
	}
	responses := make(chan answer, 12)
	var wg sync.WaitGroup
	for i := range 12 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			base := e.http.URL
			if i%2 == 1 {
				base = other.URL
			}
			req, _ := http.NewRequest("POST", base+"/api/v1/recurring-payments", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Origin", base)
			req.Header.Set("X-CSRF-Token", c.csrf)
			req.Header.Set("X-Idempotency-Key", "same-operation-01")
			resp, err := c.http.Do(req)
			if err != nil {
				responses <- answer{err: err}
				return
			}
			defer resp.Body.Close()
			data, err := io.ReadAll(resp.Body)
			responses <- answer{resp.StatusCode, data, err}
		}(i)
	}
	wg.Wait()
	close(responses)
	var original []byte
	for res := range responses {
		if res.err != nil || res.status != 201 {
			t.Fatalf("status=%d err=%v body=%s", res.status, res.err, res.body)
		}
		if original == nil {
			original = res.body
		}
		if !bytes.Equal(original, res.body) {
			t.Fatal("replay differs")
		}
	}
	var count int
	e.db.QueryRow("SELECT count(*) FROM recurring_payments").Scan(&count)
	expect(t, "one payment", count, 1)
	e.db.QueryRow("SELECT count(*) FROM audit_log WHERE action='recurring.create'").Scan(&count)
	expect(t, "one signed action", count, 1)
	e.db.QueryRow("SELECT count(*) FROM idempotency_keys").Scan(&count)
	expect(t, "one durable response", count, 1)
	var input map[string]any
	json.Unmarshal(body, &input)
	repeated := c.do("POST", "/api/v1/recurring-payments", input, "X-Idempotency-Key", "same-operation-01")
	expect(t, "replay after second server open", repeated.status, 201)
	expect(t, "replay header", repeated.header.Get("X-Idempotency-Replayed"), "true")
	input["amount"] = "15.00"
	expect(t, "same key changed body", c.do("POST", "/api/v1/recurring-payments", input, "X-Idempotency-Key", "same-operation-01").status, 409)
	expect(t, "no auth cache access", e.client().do("POST", "/api/v1/recurring-payments", input, "X-Idempotency-Key", "same-operation-01").status, 401)
}

func TestIdempotencyMutationAndResponseRollbackTogether(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	_, err := e.db.Exec("CREATE TRIGGER reject_idempotency BEFORE INSERT ON idempotency_keys BEGIN SELECT RAISE(ABORT,'test response persistence failed'); END")
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"title": "Rollback", "amount": "1.00", "currency": "USD", "first_due_date": "2026-01-28"}
	expect(t, "cache failure", c.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "rollback-key-01").status, 500)
	var count int
	e.db.QueryRow("SELECT count(*) FROM recurring_payments").Scan(&count)
	expect(t, "no business commit without replay record", count, 0)
	e.db.QueryRow("SELECT count(*) FROM audit_log WHERE action='recurring.create'").Scan(&count)
	expect(t, "no orphan audit", count, 0)
	e.db.Exec("DROP TRIGGER reject_idempotency")
	expect(t, "safe retry after rollback", c.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "rollback-key-01").status, 201)
	expect(t, "invalid key", c.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "bad key!").status, 422)
}

func TestIdempotencyStatusReplayCannotUndoLaterEdit(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	items := c.get("/api/v1/payment-occurrences").list(t)
	id := int64(items[0]["id"].(float64))
	path := fmt.Sprintf("/api/v1/payment-occurrences/%d", id)
	body := map[string]any{"paid": true}
	original := c.do("PATCH", path, body, "X-Idempotency-Key", "mark-paid-key-01")
	expect(t, "paid", original.status, 200)
	expect(t, "later cancellation", c.patch(path, map[string]any{"paid": false}).status, 200)
	replay := c.do("PATCH", path, body, "X-Idempotency-Key", "mark-paid-key-01")
	expect(t, "original replay", string(replay.body), string(original.body))
	expect(t, "state remains cancelled", c.get(path).object(t)["paid_at"], nil)
	var count int
	e.db.QueryRow("SELECT COUNT(*) FROM audit_log WHERE action='occurrence.paid'").Scan(&count)
	expect(t, "no duplicate audit", count, 1)
	// No endpoint promises protection when no key is supplied; legacy clients remain compatible.
	expect(t, "mismatching status", c.do("PATCH", path, map[string]any{"paid": false}, "X-Idempotency-Key", "mark-paid-key-01").status, 409)
	if strings.Contains(string(replay.body), "idempotency_keys") {
		t.Fatal("internal cache leaked")
	}
}

func TestIdempotencyPauseResumeAndNoContentOperations(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	created := c.createPayment(nil)
	id := int64(created["id"].(float64))
	base := fmt.Sprintf("/api/v1/recurring-payments/%d", id)
	for _, action := range []struct {
		method, path, key string
		body              any
		status            int
	}{
		{"POST", base + "/pause", "pause-key-0001", map[string]any{}, 200},
		{"POST", base + "/resume", "resume-key-0001", nil, 200},
		{"DELETE", base + "?mode=delete", "delete-key-0001", nil, 204},
		{"POST", base + "/restore", "restore-key-0001", nil, 204},
	} {
		first := c.do(action.method, action.path, action.body, "X-Idempotency-Key", action.key)
		expect(t, "first", first.status, action.status)
		repeat := c.do(action.method, action.path, action.body, "X-Idempotency-Key", action.key)
		expect(t, "replay", repeat.status, action.status)
		expect(t, "same response", string(repeat.body), string(first.body))
		expect(t, "replayed", repeat.header.Get("X-Idempotency-Replayed"), "true")
	}
}

func TestIdempotencyFuturePeriodReplaysAndEncryptedCache(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	created := c.createPayment(nil)
	id := int64(created["id"].(float64))
	path := fmt.Sprintf("/api/v1/recurring-payments/%d/periods", id)
	body := map[string]any{"due_date": "2026-05-31", "paid_at": "2026-01-28"}
	first := c.do("POST", path, body, "X-Idempotency-Key", "future-period-01")
	expect(t, "future", first.status, 201)
	repeat := c.do("POST", path, body, "X-Idempotency-Key", "future-period-01")
	expect(t, "replay", repeat.status, 201)
	expect(t, "original", string(repeat.body), string(first.body))
	// Turning encryption on later must also seal cached responses containing requisites.
	key := bytes.Repeat([]byte{31}, 32)
	if err := ConfigureEncryption(e.db, key); err != nil {
		t.Fatal(err)
	}
	var stored string
	e.db.QueryRow("SELECT response FROM idempotency_keys").Scan(&stored)
	if !strings.HasPrefix(stored, "enc:v1:") {
		t.Fatal("cached response left plaintext after enabling encryption")
	}
	repeat = c.do("POST", path, body, "X-Idempotency-Key", "future-period-01")
	expect(t, "encrypted replay", repeat.status, 201)
	expect(t, "encrypted original", string(repeat.body), string(first.body))
}

func TestIdempotencyReplayStillRequiresWriteRightsAndExpires(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	body := map[string]any{"title": "Scoped intent", "amount": "1.00", "currency": "RUB", "first_due_date": "2026-01-28", "frequency": "once"}
	first := c.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "scoped-intent-01")
	expect(t, "create", first.status, 201)
	csrf := c.csrf
	c.csrf = ""
	expect(t, "CSRF required on replay", c.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "scoped-intent-01").status, 403)
	c.csrf = csrf
	reader := e.keyClient(c.createToken("read", nil))
	expect(t, "read token cannot replay", reader.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "scoped-intent-01").status, 403)
	writer := e.keyClient(c.createToken("write", nil))
	repeat := writer.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "scoped-intent-01")
	expect(t, "same account across auth methods", repeat.status, 201)
	expect(t, "same original", string(repeat.body), string(first.body))
	now := e.server.Now()
	e.server.Now = func() time.Time { return now.Add(idempotencyLifetime + time.Second) }
	expect(t, "expired keys are new intent", c.do("POST", "/api/v1/recurring-payments", body, "X-Idempotency-Key", "scoped-intent-01").status, 201)
	var count int
	e.db.QueryRow("SELECT count(*) FROM recurring_payments").Scan(&count)
	expect(t, "new intent after documented retention", count, 2)
}
