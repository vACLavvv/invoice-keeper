package app

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/notify"
)

func TestTeamRetryBudgetSurvivesRestartAndBackoff(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	sent := &recorder{}
	sender := sent.sender(notify.SendResult{State: "pending", RetryDelay: 0, Error: "Connection not established"})
	for attempt := 1; attempt <= notify.MaxDeliveryAttempts; attempt++ {
		makeWorker(e, sender).Tick()
		var state string
		var attempts int
		var deadline int64
		if err := e.db.QueryRow("SELECT state,attempts,retry_after FROM reminders").Scan(&state, &attempts, &deadline); err != nil {
			t.Fatal(err)
		}
		expect(t, "attempt persisted", attempts, attempt)
		if attempt < notify.MaxDeliveryAttempts {
			expect(t, "queued for retry", state, "pending")
			minimum := int64(60 << (attempt - 1))
			if deadline-time.Now().Unix() < minimum-1 {
				t.Fatal("exponential delay missing", deadline)
			}
			makeWorker(e, sender).Tick()
			expect(t, "restart waits", sent.count(), attempt)
			e.db.Exec("UPDATE reminders SET retry_after=0")
			expireTransportBackoff(t, e)
		} else {
			expect(t, "dead letter", state, "failed")
		}
	}
	for range 3 {
		makeWorker(e, sender).Tick()
	}
	expect(t, "failed task not lost or silently retried", sent.count(), notify.MaxDeliveryAttempts)
}

func TestDeliveryFailuresPaginationAccessAndManualRetry(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "User", "email": "user@example.com", "password": "User-password123!"})
	e.settings.TelegramEnabled = true
	e.settings.TelegramChatID = "test-chat"
	sent := &recorder{}
	e.server.Worker.Sender = sent.sender(notify.SendResult{State: "pending", Error: "offline"})
	err := e.db.Write(func(tx *sql.Tx) error {
		for i := 1; i <= 8; i++ {
			if _, err := tx.Exec("INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,frequency,next_index,created_at) VALUES(?, ?,100,'RUB','2026-01-31',31,'once',1,'x')", i, fmt.Sprintf("Payment %d", i)); err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,'2026-01-31',100,'RUB')", i, i); err != nil {
				return err
			}
			state := "failed"
			if i == 8 {
				state = "uncertain"
			}
			if _, err := tx.Exec("INSERT INTO reminders(occurrence_id,state,attempts,attempted_at,error,claim_token) VALUES(?,?,5,123,'safe error',?)", i, state, fmt.Sprintf("claim-%d", i)); err != nil {
				return err
			}
		}
		_, err := tx.Exec("UPDATE payment_occurrences SET paid_at='2026-01-28' WHERE id=2; UPDATE email_contacts SET welcome_state='failed',error='Email refused',attempts=5")
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/delivery-failures"
	expect(t, "anonymous denied", e.client().get(path).status, 401)
	user := e.client()
	user.signIn("alex", "User-password123!")
	expect(t, "non-admin denied", user.get(path).status, 403)
	first := admin.get(path + "?page_size=3").object(t)
	expect(t, "all queues counted", first["total"], any(9.0))
	expect(t, "bounded response", len(first["items"].([]any)), 3)
	expect(t, "all pages", first["pages"], any(3.0))
	expect(t, "failed filter", admin.get(path + "?state=failed").object(t)["total"], any(8.0))
	var all struct{ Items []deliveryFailure }
	admin.get(path).json(t, &all)
	for _, item := range all.Items {
		if item.State == "uncertain" || item.Queue == "email_verification" || item.OccurrenceID == 2 {
			if item.CanRetry {
				t.Fatal("unsafe retry offered")
			}
		}
	}
	body := map[string]any{"queue": "reminders", "occurrence_id": 1, "failure_token": "claim-1"}
	expect(t, "ordinary user cannot retry", user.post(path+"/retry", body).status, 403)
	requestWithoutCSRF := *admin
	requestWithoutCSRF.csrf = ""
	expect(t, "CSRF required", requestWithoutCSRF.post(path+"/retry", body).status, 403)
	expect(t, "retry queued", admin.post(path+"/retry", body).status, 204)
	expect(t, "one attempt after manual action", sent.count(), 1)
	expect(t, "stale click rejected", admin.post(path+"/retry", body).status, 409)
	expect(t, "unknown delivery not retried", admin.post(path+"/retry", map[string]any{"queue": "reminders", "occurrence_id": 8, "failure_token": "claim-8"}).status, 409)
	expect(t, "paid cannot retry", admin.post(path+"/retry", map[string]any{"queue": "reminders", "occurrence_id": 2, "failure_token": "claim-2"}).status, 409)
	var auditCount int
	e.db.QueryRow("SELECT COUNT(*) FROM audit_log WHERE action='delivery.retry'").Scan(&auditCount)
	expect(t, "one audited retry", auditCount, 1)
	expect(t, "journal authentic", admin.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

func TestManualRetryFencesConcurrentAndChangedRecipients(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	var id int64
	e.db.QueryRow("SELECT id FROM payment_occurrences LIMIT 1").Scan(&id)
	w := makeWorker(e, func(notify.ReminderRow) notify.SendResult { return notify.SendResult{State: "sent"} })
	e.db.Exec("INSERT INTO reminders(occurrence_id,state,attempts,claim_token) VALUES(?,'failed',5,'original')", id)
	var mu sync.Mutex
	success := 0
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := e.db.Write(func(tx *sql.Tx) error { return w.RetryFailed(tx, "reminders", id, "due", "telegram", "original") })
			if err == nil {
				mu.Lock()
				success++
				mu.Unlock()
			} else if err != notify.ErrNotRetryable {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	expect(t, "one generation requeued", success, 1)
	e.db.Exec("UPDATE reminders SET state='failed',claim_token='next-attempt'")
	err := e.db.Write(func(tx *sql.Tx) error { return w.RetryFailed(tx, "reminders", id, "due", "telegram", "original") })
	expect(t, "late request cannot retry next failure", err, notify.ErrNotRetryable)
	e.db.Exec("INSERT INTO deliveries(occurrence_id,kind,channel,state,attempts,claim_token) VALUES(?,'due','telegram:123','failed',5,'private')", id)
	err = e.db.Write(func(tx *sql.Tx) error { return w.RetryFailed(tx, "deliveries", id, "due", "telegram:123", "private") })
	expect(t, "unlinked recipient blocked", err, notify.ErrRecipientUnavailable)
}

func TestOrdinaryUserCannotAlterAuditTrail(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "User", "email": "user@example.com", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	var before int
	e.db.QueryRow("SELECT COUNT(*) FROM audit_log").Scan(&before)
	for _, path := range []string{"/api/v1/audit-log", "/api/v1/audit-log/1"} {
		for _, response := range []response{user.delete(path), user.patch(path, map[string]any{"actor": "fake"})} {
			if response.status < 400 {
				t.Fatal("audit modification allowed", response.status)
			}
		}
	}
	var after int
	e.db.QueryRow("SELECT COUNT(*) FROM audit_log").Scan(&after)
	expect(t, "original trail kept", after, before)
	expect(t, "journal still authentic", admin.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}
