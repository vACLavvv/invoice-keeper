package app

import (
	"context"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/schedule"
)

type recorder struct {
	mu   sync.Mutex
	rows []notify.ReminderRow
}

func (r *recorder) count() int { r.mu.Lock(); defer r.mu.Unlock(); return len(r.rows) }

func (r *recorder) sender(result notify.SendResult) notify.Sender {
	return func(row notify.ReminderRow) notify.SendResult {
		r.mu.Lock()
		r.rows = append(r.rows, row)
		r.mu.Unlock()
		return result
	}
}

func enabledSettings(e *harness) *config.Settings {
	s := *e.settings
	s.TelegramEnabled, s.TelegramBotToken, s.TelegramChatID = true, "test-token", "test-chat"
	return &s
}

func makeWorker(e *harness, sender notify.Sender) *notify.ReminderWorker {
	return notify.NewReminderWorker(e.db, enabledSettings(e), sender, e.clock.Today)
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
	sender := sent.sender(notify.SendResult{State: "sent", MessageID: "123"})
	worker := makeWorker(e, sender)
	e.clock.Set(schedule.Civil(2026, 1, 27))
	worker.Tick()
	expect(t, "4 days before", sent.count(), 0)
	e.clock.Set(schedule.Civil(2026, 1, 28))
	worker.Tick()
	worker.Tick()
	expect(t, "3 days before, once", sent.count(), 1)
	expect(t, "due", sent.rows[0].DueDate, "2026-01-31")
	e.clock.Set(schedule.Civil(2026, 1, 30))
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
	worker := makeWorker(e, sent.sender(notify.SendResult{State: "sent", MessageID: "1"}))
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
	broken := func(notify.ReminderRow) notify.SendResult { calls++; panic("network timeout") }
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
	makeWorker(e, sent.sender(notify.SendResult{State: "pending", Error: "Соединение не установлено"})).Tick()
	expect(t, "pending", reminderState(t, e), "pending")
	e.db.Exec("UPDATE reminders SET retry_after=0")
	makeWorker(e, sent.sender(notify.SendResult{State: "sent", MessageID: "5"})).Tick()
	expect(t, "sent", reminderState(t, e), "sent")
	expect(t, "attempts", sent.count(), 2)
}

func TestTwoWorkersClaimOnce(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	sent := &recorder{}
	sender := sent.sender(notify.SendResult{State: "sent", MessageID: "42"})
	a, b := makeWorker(e, sender), makeWorker(e, sender)
	var wg sync.WaitGroup
	for _, w := range []*notify.ReminderWorker{a, b} {
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
	e.server.Worker.Sender = sent.sender(notify.SendResult{State: "sent", MessageID: "1"})
	c.createPayment(map[string]any{"first_due_date": "2026-01-29"})
	expect(t, "sent right after create", sent.count(), 1)
}

func TestWorkerStopsBetweenMessages(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for _, title := range []string{"A", "B", "C", "D", "E"} {
		c.createPayment(map[string]any{"title": title})
	}
	started := make(chan struct{}, 10)
	release := make(chan struct{})
	slow := func(row notify.ReminderRow) notify.SendResult {
		started <- struct{}{}
		<-release
		return notify.SendResult{State: "sent", MessageID: "1"}
	}
	w := makeWorker(e, slow)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		w.Run(ctx)
		close(done)
	}()
	<-started // the first message is being sent
	cancel()
	close(release)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("the worker did not stop")
	}
	var sent, sending, pending int
	e.db.QueryRow("SELECT COUNT(*) FROM reminders WHERE state='sent'").Scan(&sent)
	e.db.QueryRow("SELECT COUNT(*) FROM reminders WHERE state='sending'").Scan(&sending)
	e.db.QueryRow("SELECT COUNT(*) FROM reminders WHERE state='pending'").Scan(&pending)
	expect(t, "the message in progress is finished", sent, 1)
	expect(t, "nothing left half-sent", sending, 0)
	expect(t, "the rest wait for the next start", pending, 4)

	w.Kick()
	w.Wait()
	e.db.QueryRow("SELECT COUNT(*) FROM reminders WHERE state='sent'").Scan(&sent)
	expect(t, "no passes after shutdown", sent, 1)
}
