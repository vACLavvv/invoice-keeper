package app

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

func personalTelegramSettings(e *harness) *config.Settings {
	s := enabledSettings(e)
	s.TelegramChatID = ""
	s.OverdueReminders = true
	return s
}

func linkReminderAdmin(t *testing.T, e *harness) {
	t.Helper()
	if _, err := e.db.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,linked_at) VALUES(NULL,1,9001,9001,'x')"); err != nil {
		t.Fatal(err)
	}
}

func personalDeliveryState(t *testing.T, e *harness, kind, chat string) string {
	t.Helper()
	var state string
	if err := e.db.QueryRow("SELECT state FROM deliveries WHERE kind=? AND channel=?", kind, "telegram:"+chat).Scan(&state); err != nil {
		t.Fatal(err)
	}
	return state
}

func retryPersonalTelegram(t *testing.T, e *harness) {
	t.Helper()
	if _, err := e.db.Exec("UPDATE deliveries SET retry_after=0 WHERE channel LIKE 'telegram:%'"); err != nil {
		t.Fatal(err)
	}
}

func TestPersonalTelegramRetryAfterSurvivesRestartAndLimit(t *testing.T) {
	for _, kind := range []string{"due", "overdue"} {
		t.Run(kind, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			linkReminderAdmin(t, e)
			if kind == "overdue" {
				e.clock.Set(schedule.Civil(2026, 2, 1))
			}
			var calls atomic.Int32
			telegram := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.WriteHeader(http.StatusTooManyRequests)
				fmt.Fprint(w, `{"ok":false,"parameters":{"retry_after":600}}`)
			}))
			defer telegram.Close()
			s := personalTelegramSettings(e)
			sender := notify.TelegramSender(s, telegram.URL)
			run := func() { notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick() }
			before := time.Now().Unix()
			run()
			var attempts int
			var retryAfter int64
			if err := e.db.QueryRow("SELECT attempts,retry_after FROM deliveries WHERE kind=? AND channel='telegram:9001'", kind).Scan(&attempts, &retryAfter); err != nil {
				t.Fatal(err)
			}
			expect(t, "one saved attempt", attempts, 1)
			if retryAfter < before+600 {
				t.Fatalf("Telegram retry_after was shortened: %d < %d", retryAfter, before+600)
			}
			run()
			expect(t, "restart respects Telegram retry_after", calls.Load(), int32(1))
			for range notify.MaxDeliveryAttempts + 1 {
				retryPersonalTelegram(t, e)
				run()
			}
			expect(t, "retry limit survives restarts", calls.Load(), int32(notify.MaxDeliveryAttempts))
			expect(t, "exhausted queue", personalDeliveryState(t, e, kind, "9001"), "failed")
		})
	}
}

func TestPersonalTelegramUnlinkCancelsDueAndOverdue(t *testing.T) {
	for _, kind := range []string{"due", "overdue"} {
		t.Run(kind, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			linkReminderAdmin(t, e)
			if kind == "overdue" {
				e.clock.Set(schedule.Civil(2026, 2, 1))
			}
			s := personalTelegramSettings(e)
			first := &recorder{}
			notify.NewReminderWorker(e.db, s, first.sender(notify.SendResult{State: "pending", RetryDelay: 600}), e.clock.Today).Tick()
			expect(t, "first attempt", first.count(), 1)
			expect(t, "waiting to retry", personalDeliveryState(t, e, kind, "9001"), "pending")
			expect(t, "unlink", admin.delete("/api/v1/me/telegram").status, 204)
			expect(t, "unlink cancels immediately", personalDeliveryState(t, e, kind, "9001"), "cancelled")
			retryPersonalTelegram(t, e)
			sent := &recorder{}
			notify.NewReminderWorker(e.db, s, sent.sender(notify.SendResult{State: "sent"}), e.clock.Today).Tick()
			expect(t, "no delivery after unlink", sent.count(), 0)
		})
	}
}

func TestPersonalTelegramConcurrentWorkersAndReplay(t *testing.T) {
	for _, kind := range []string{"due", "overdue"} {
		t.Run(kind, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			linkReminderAdmin(t, e)
			if kind == "overdue" {
				e.clock.Set(schedule.Civil(2026, 2, 1))
			}
			other, err := store.OpenDB(e.db.Path)
			if err != nil {
				t.Fatal(err)
			}
			defer other.Close()
			s := personalTelegramSettings(e)
			sent := &recorder{}
			sender := sent.sender(notify.SendResult{State: "sent", MessageID: "1"})
			var wg sync.WaitGroup
			for _, db := range []*store.DB{e.db, other} {
				wg.Add(1)
				go func() {
					defer wg.Done()
					notify.NewReminderWorker(db, s, sender, e.clock.Today).Tick()
				}()
			}
			wg.Wait()
			notify.NewReminderWorker(other, s, sender, e.clock.Today).Tick()
			expect(t, "one message across independent connections and restart", sent.count(), 1)
			expect(t, "saved delivery", personalDeliveryState(t, e, kind, "9001"), "sent")
		})
	}
}

func TestPersonalTelegramAmbiguousAndInterruptedNeverReplay(t *testing.T) {
	for _, state := range []string{"uncertain", "sending"} {
		t.Run(state, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			linkReminderAdmin(t, e)
			s := personalTelegramSettings(e)
			calls := 0
			broken := func(notify.ReminderRow) notify.SendResult { calls++; panic("ambiguous") }
			notify.NewReminderWorker(e.db, s, broken, e.clock.Today).Tick()
			if state == "sending" {
				if _, err := e.db.Exec("UPDATE deliveries SET state='sending',attempted_at=?", time.Now().Unix()-600); err != nil {
					t.Fatal(err)
				}
			}
			notify.NewReminderWorker(e.db, s, broken, e.clock.Today).Tick()
			expect(t, "ambiguous delivery never repeated", calls, 1)
			expect(t, "uncertain", personalDeliveryState(t, e, "due", "9001"), "uncertain")
		})
	}
}

func TestPersonalTelegramLegacyRecordsPreventUpgradeDuplicates(t *testing.T) {
	for _, state := range []string{"sent", "sending", "failed"} {
		t.Run(state, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			linkReminderAdmin(t, e)
			if _, err := e.db.Exec("INSERT INTO personal_reminders(occurrence_id,chat_id,state) SELECT id,9001,? FROM payment_occurrences", state); err != nil {
				t.Fatal(err)
			}
			s := personalTelegramSettings(e)
			sent := &recorder{}
			sender := sent.sender(notify.SendResult{State: "sent"})
			notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
			notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
			expect(t, "historical personal due suppressed", sent.count(), 0)
			e.clock.Set(schedule.Civil(2026, 2, 1))
			notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
			expect(t, "overdue remains a distinct reminder", sent.count(), 1)
			expect(t, "overdue", sent.rows[0].Kind, "overdue")
		})
	}
}

func TestPersonalTelegramSharedDestinationDeduplicates(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	user := admin.post("/api/v1/users", map[string]any{"email": "case@example.com", "username": "caseuser", "display_name": "Case", "password": "User-password123!"}).object(t)
	admin.createPayment(map[string]any{"assignee_id": user["id"]})
	linkReminderAdmin(t, e)
	s := personalTelegramSettings(e)
	s.TelegramChatID = "9001"
	sent := &recorder{}
	sender := sent.sender(notify.SendResult{State: "sent", MessageID: "1"})
	notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
	notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
	expect(t, "shared and personal due go to the same destination once", sent.count(), 1)
	e.clock.Set(schedule.Civil(2026, 2, 1))
	notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
	notify.NewReminderWorker(e.db, s, sender, e.clock.Today).Tick()
	expect(t, "shared and personal overdue go to the same destination once", kinds(sent), "due:2026-01-31,overdue:2026-01-31")
}

func TestPersonalTelegramAssigneeChangeCancelsPreviousRecipient(t *testing.T) {
	for _, kind := range []string{"due", "overdue"} {
		t.Run(kind, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			old := admin.post("/api/v1/users", map[string]any{"email": "old@example.com", "username": "olduser", "display_name": "Old", "password": "User-password123!"}).object(t)
			next := admin.post("/api/v1/users", map[string]any{"email": "next@example.com", "username": "nextuser", "display_name": "Next", "password": "User-password123!"}).object(t)
			payment := admin.createPayment(map[string]any{"assignee_id": old["id"]})
			for chat, user := range map[int]any{9001: old["id"], 9002: next["id"]} {
				if _, err := e.db.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,linked_at) VALUES(?,0,?,?,'x')", user, chat, chat); err != nil {
					t.Fatal(err)
				}
			}
			if kind == "overdue" {
				e.clock.Set(schedule.Civil(2026, 2, 1))
			}
			s := personalTelegramSettings(e)
			first := &recorder{}
			notify.NewReminderWorker(e.db, s, first.sender(notify.SendResult{State: "pending", RetryDelay: 600}), e.clock.Today).Tick()
			expect(t, "initial attempt", first.count(), 1)
			expect(t, "reassign", admin.patch("/api/v1/recurring-payments/"+id(payment), map[string]any{"assignee_id": next["id"]}).status, 200)
			retryPersonalTelegram(t, e)
			sent := &recorder{}
			notify.NewReminderWorker(e.db, s, sent.sender(notify.SendResult{State: "sent"}), e.clock.Today).Tick()
			expect(t, "new assignee receives one message", sent.count(), 1)
			expect(t, "new destination", sent.rows[0].ChatID, "9002")
			expect(t, "old recipient cancelled", personalDeliveryState(t, e, kind, "9001"), "cancelled")
		})
	}
}

func TestPersonalTelegramRechecksRecipientAfterClaim(t *testing.T) {
	for _, change := range []string{"unlink", "reassign"} {
		t.Run(change, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			user := admin.post("/api/v1/users", map[string]any{"email": "case@example.com", "username": "caseuser", "display_name": "Case", "password": "User-password123!"}).object(t)
			admin.createPayment(map[string]any{"assignee_id": user["id"]})
			if _, err := e.db.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,linked_at) VALUES(?,0,9001,9001,'x')", user["id"]); err != nil {
				t.Fatal(err)
			}
			// Change eligibility after the queue selection and claim, before the network
			// transaction. A trigger makes that boundary deterministic without sleeps.
			mutation := "DELETE FROM telegram_links WHERE chat_id=9001"
			if change == "reassign" {
				mutation = "UPDATE recurring_payments SET assignee_id=NULL"
			}
			if _, err := e.db.Exec(`CREATE TRIGGER change_recipient_after_claim AFTER UPDATE OF state ON deliveries
				WHEN new.state='sending' AND new.channel='telegram:9001' BEGIN ` + mutation + `; END`); err != nil {
				t.Fatal(err)
			}
			sent := &recorder{}
			notify.NewReminderWorker(e.db, personalTelegramSettings(e), sent.sender(notify.SendResult{State: "sent"}), e.clock.Today).Tick()
			expect(t, "no stale recipient receives a message", sent.count(), 0)
			expect(t, "claimed delivery cancelled", personalDeliveryState(t, e, "due", "9001"), "cancelled")
		})
	}
}

func TestPersonalTelegramRelinkCancelsPreviousChat(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	linkReminderAdmin(t, e)
	s := personalTelegramSettings(e)
	first := &recorder{}
	notify.NewReminderWorker(e.db, s, first.sender(notify.SendResult{State: "pending", RetryDelay: 600}), e.clock.Today).Tick()
	expect(t, "waiting to retry", personalDeliveryState(t, e, "due", "9001"), "pending")
	e.settings.TelegramBotToken = "test-token"
	e.server.SetBotUsername("invoice_test_bot")
	link := admin.post("/api/v1/me/telegram/link", nil)
	expect(t, "link code", link.status, 201)
	uri, err := url.Parse(link.object(t)["url"].(string))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.server.linkTelegram(uri.Query().Get("start"), bot.User{ID: 9002, Username: "new_chat"}, 9002); err != nil {
		t.Fatal(err)
	}
	expect(t, "old chat immediately cancelled", personalDeliveryState(t, e, "due", "9001"), "cancelled")
	retryPersonalTelegram(t, e)
	sent := &recorder{}
	notify.NewReminderWorker(e.db, s, sent.sender(notify.SendResult{State: "sent"}), e.clock.Today).Tick()
	expect(t, "new chat receives one reminder", sent.count(), 1)
	expect(t, "new destination", sent.rows[0].ChatID, "9002")
}

func TestPauseCleansUpPersonalAndOtherDeliveryQueues(t *testing.T) {
	for _, state := range []string{"pending", "sent"} {
		t.Run(state, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			paused := admin.createPayment(nil)
			admin.createPayment(map[string]any{"title": "Continues"})
			linkReminderAdmin(t, e)
			sent := &recorder{}
			sender := sent.sender(notify.SendResult{State: state, RetryDelay: 600})
			worker := notify.NewReminderWorker(e.db, personalTelegramSettings(e), sender, e.clock.Today)
			worker.Channels = map[string]notify.Sender{"webhook": sender}
			worker.Tick()
			expect(t, "personal and webhook for both payments", sent.count(), 4)
			expect(t, "pause succeeds with deliveries", admin.post("/api/v1/recurring-payments/"+id(paused)+"/pause", nil).status, 200)
			var remaining int
			if err := e.db.QueryRow("SELECT COUNT(*) FROM deliveries").Scan(&remaining); err != nil {
				t.Fatal(err)
			}
			expect(t, "other payment keeps both deliveries", remaining, 2)
			worker.Tick()
			expect(t, "paused payment sends nothing further", sent.count(), 4)
		})
	}
}
