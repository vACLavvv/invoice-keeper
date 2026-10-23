package app

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type recorder struct {
	mu   sync.Mutex
	rows []ReminderRow
}

func (r *recorder) count() int { r.mu.Lock(); defer r.mu.Unlock(); return len(r.rows) }

func (r *recorder) sender(result SendResult) Sender {
	return func(row ReminderRow) SendResult {
		r.mu.Lock()
		r.rows = append(r.rows, row)
		r.mu.Unlock()
		return result
	}
}

func enabledSettings(e *harness) *Settings {
	s := *e.settings
	s.TelegramEnabled, s.TelegramBotToken, s.TelegramChatID = true, "test-token", "test-chat"
	return &s
}

func makeWorker(e *harness, sender Sender) *ReminderWorker {
	return NewReminderWorker(e.db, enabledSettings(e), sender, e.clock.Today)
}

func reminderState(t *testing.T, e *harness) string {
	t.Helper()
	var state string
	if err := e.db.QueryRow("SELECT state FROM reminders").Scan(&state); err != nil {
		t.Fatal(err)
	}
	return state
}

func TestDueMinusThreeImmediateLateEntryNoDuplicates(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil) // due 2026-01-31
	sent := &recorder{}
	sender := sent.sender(SendResult{State: "sent", MessageID: "123"})
	worker := makeWorker(e, sender)
	e.clock.Set(civil(2026, 1, 27))
	worker.Tick()
	expect(t, "4 days before", sent.count(), 0)
	e.clock.Set(civil(2026, 1, 28))
	worker.Tick()
	worker.Tick()
	expect(t, "3 days before, once", sent.count(), 1)
	expect(t, "due", sent.rows[0].DueDate, "2026-01-31")
	e.clock.Set(civil(2026, 1, 30))
	c.createPayment(map[string]any{"title": "Позднее добавление", "first_due_date": "2026-01-31"})
	worker.Tick()
	expect(t, "late entry", sent.count(), 2)
	// Restart with the same outbox.
	makeWorker(e, sender).Tick()
	expect(t, "after restart", sent.count(), 2)
}

func TestPaidArchivedAndDisabledDoNotSend(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	second := c.createPayment(map[string]any{"title": "Удалённый"})
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	c.patch("/api/v1/payment-occurrences/"+id(item), map[string]any{"paid": true})
	c.delete("/api/v1/recurring-payments/" + id(second))
	sent := &recorder{}
	worker := makeWorker(e, sent.sender(SendResult{State: "sent", MessageID: "1"}))
	worker.Tick()
	expect(t, "paid and archived", sent.count(), 0)
	c.patch("/api/v1/payment-occurrences/"+id(item), map[string]any{"paid": false})
	e.server.Worker.Tick() // Telegram is disabled in the application settings.
	expect(t, "disabled", sent.count(), 0)
	worker.Tick()
	worker.Tick()
	expect(t, "unpaid again", sent.count(), 1)
}

func TestAmbiguousDeliveryAndCrashAreNotRetried(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	calls := 0
	broken := func(ReminderRow) SendResult { calls++; panic("network timeout") }
	worker := makeWorker(e, broken)
	worker.Tick()
	worker.Tick()
	expect(t, "one attempt", calls, 1)
	expect(t, "state", reminderState(t, e), "uncertain")
	if _, err := e.db.Exec("UPDATE reminders SET state='sending',attempted_at=?", time.Now().Unix()-600); err != nil {
		t.Fatal(err)
	}
	makeWorker(e, broken).Tick()
	expect(t, "stale claim not retried", calls, 1)
	expect(t, "state", reminderState(t, e), "uncertain")
}

func TestSafeFailureIsRetried(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	sent := &recorder{}
	makeWorker(e, sent.sender(SendResult{State: "pending", Error: "Соединение не установлено"})).Tick()
	expect(t, "pending", reminderState(t, e), "pending")
	e.db.Exec("UPDATE reminders SET retry_after=0")
	makeWorker(e, sent.sender(SendResult{State: "sent", MessageID: "5"})).Tick()
	expect(t, "sent", reminderState(t, e), "sent")
	expect(t, "attempts", sent.count(), 2)
}

func TestTwoWorkersClaimOnce(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	sent := &recorder{}
	sender := sent.sender(SendResult{State: "sent", MessageID: "42"})
	a, b := makeWorker(e, sender), makeWorker(e, sender)
	var wg sync.WaitGroup
	for _, w := range []*ReminderWorker{a, b} {
		wg.Add(1)
		go func() { defer wg.Done(); w.Tick() }()
	}
	wg.Wait()
	expect(t, "one message", sent.count(), 1)
}

func TestImmediateReminderAfterCreate(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	sent := &recorder{}
	e.server.Worker.Settings = enabledSettings(e)
	e.server.Worker.Sender = sent.sender(SendResult{State: "sent", MessageID: "1"})
	c.createPayment(map[string]any{"first_due_date": "2026-01-29"})
	expect(t, "sent right after create", sent.count(), 1)
}

func TestTelegramPayloadAndSafeRetry(t *testing.T) {
	var mu sync.Mutex
	var captured []map[string]any
	reply := func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true,"result":{"message_id":9}}`))
	}
	telegram := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/botSECRET-TOKEN/sendMessage") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		captured = append(captured, body)
		handler := reply
		mu.Unlock()
		handler(w, r)
	}))
	defer telegram.Close()
	settings := &Settings{TelegramBotToken: "SECRET-TOKEN", TelegramChatID: "123"}
	sender := TelegramSender(settings, telegram.URL)
	row := ReminderRow{Title: "Аренда <офис>", AmountCents: 4500000, Currency: "RUB", DueDate: "2026-01-31"}

	result := sender(row)
	expect(t, "sent", result.State, "sent")
	expect(t, "message id", result.MessageID, "9")
	text := captured[0]["text"].(string)
	for _, part := range []string{"Аренда <офис>", "45000.00", "RUB", "2026-01-31"} {
		if !strings.Contains(text, part) {
			t.Fatalf("text lacks %q: %s", part, text)
		}
	}
	if _, ok := captured[0]["parse_mode"]; ok {
		t.Fatal("parse_mode must not be set")
	}

	mu.Lock()
	reply = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(429)
		w.Write([]byte(`{"ok":false,"parameters":{"retry_after":12}}`))
	}
	mu.Unlock()
	result = sender(row)
	expect(t, "rate limited", result.State, "pending")
	expect(t, "retry", result.RetryDelay, 12)

	mu.Lock()
	reply = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`{"ok":false,"description":"Unauthorized SECRET-TOKEN"}`))
	}
	mu.Unlock()
	result = sender(row)
	expect(t, "rejected", result.State, "uncertain")
	if strings.Contains(result.Error, "SECRET-TOKEN") {
		t.Fatal("token leaked into the error")
	}

	// Nothing listens on this port: the request certainly did not reach Telegram.
	listener, _ := net.Listen("tcp", "127.0.0.1:0")
	closed := "http://" + listener.Addr().String()
	listener.Close()
	result = TelegramSender(settings, closed)(row)
	expect(t, "connect error", result.State, "pending")
	if strings.Contains(result.Error, "SECRET-TOKEN") {
		t.Fatal("token leaked into the error")
	}
}

func TestConnectErrorClassification(t *testing.T) {
	timeout := &net.OpError{Op: "read", Err: errors.New("i/o timeout")}
	expect(t, "read failure is ambiguous", isConnectError(timeout), false)
	expect(t, "dns", isConnectError(&net.DNSError{Err: "no such host"}), true)
}
