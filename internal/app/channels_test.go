package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/schedule"
)

func TestPaymentLinkAndDetails(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	payment := admin.createPayment(map[string]any{"payment_url": "https://my.aeza.ru/billing", "payment_details": "ИНН 7700000000"})
	expect(t, "link stored", payment["payment_url"], any("https://my.aeza.ru/billing"))
	occurrence := admin.get("/api/v1/payment-occurrences").list(t)[0]
	expect(t, "link on the period", occurrence["payment_url"], any("https://my.aeza.ru/billing"))
	expect(t, "details on the period", occurrence["payment_details"], any("ИНН 7700000000"))

	for _, bad := range []string{"javascript:alert(1)", "ftp://x.ru", "https://"} {
		r := admin.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31", "payment_url": bad})
		expect(t, "rejected "+bad, r.status, 422)
	}
	cleared := admin.patch("/api/v1/recurring-payments/"+id(payment), map[string]any{"payment_url": nil, "payment_details": ""})
	expect(t, "clear", cleared.status, 200)
	expect(t, "link cleared", cleared.object(t)["payment_url"], nil)
	expect(t, "details cleared", cleared.object(t)["payment_details"], nil)
}

// channelWorker is a worker with recorded Telegram and extra channels.
func channelWorker(e *harness, telegram *recorder, channels map[string]notify.Sender) *notify.ReminderWorker {
	settings := enabledSettings(e)
	settings.OverdueReminders = true
	w := notify.NewReminderWorker(e.db, settings, telegram.sender(notify.SendResult{State: "sent", MessageID: "1"}), e.clock.Today)
	w.Channels = channels
	return w
}

func kinds(r *recorder) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []string
	for _, row := range r.rows {
		kind := row.Kind
		if kind == "" {
			kind = "due"
		}
		out = append(out, kind+":"+row.DueDate)
	}
	return strings.Join(out, ",")
}

func TestOverdueReminderOnceTheNextDay(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil) // due 31 Jan, today 28 Jan
	telegram := &recorder{}
	w := channelWorker(e, telegram, map[string]notify.Sender{})
	w.Tick()
	expect(t, "due reminder", kinds(telegram), "due:2026-01-31")
	e.clock.Set(schedule.Civil(2026, 1, 31))
	w.Tick()
	expect(t, "nothing on the due day", telegram.count(), 1)
	e.clock.Set(schedule.Civil(2026, 2, 1))
	w.Tick()
	w.Tick()
	expect(t, "overdue once", kinds(telegram), "due:2026-01-31,overdue:2026-01-31")

	// Paid before the next day: no overdue message.
	e.clock.Set(schedule.Civil(2026, 2, 26))
	w.Tick()
	feb := admin.get("/api/v1/payment-occurrences?from_date=2026-02-28&to_date=2026-02-28").list(t)[0]
	admin.patch("/api/v1/payment-occurrences/"+id(feb), map[string]any{"paid": true, "paid_at": "2026-02-26"})
	e.clock.Set(schedule.Civil(2026, 3, 1))
	w.Tick()
	expect(t, "paid stays quiet", kinds(telegram), "due:2026-01-31,overdue:2026-01-31,due:2026-02-28")

	// Turned off: no overdue messages at all.
	w.Settings.OverdueReminders = false
	e.clock.Set(schedule.Civil(2026, 4, 1))
	w.Tick()
	if strings.Contains(kinds(telegram), "overdue:2026-03-31") {
		t.Fatalf("overdue sent while disabled: %s", kinds(telegram))
	}
}

func TestOverdueWindowSkipsOldDebts(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(map[string]any{"first_due_date": "2025-10-31"}) // months of old debts
	telegram := &recorder{}
	channelWorker(e, telegram, map[string]notify.Sender{}).Tick()
	if strings.Contains(kinds(telegram), "overdue:2025-") {
		t.Fatalf("old debts flooded the chat: %s", kinds(telegram))
	}
}

func TestExtraChannelsDeliverOnceAndRetrySafely(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	email, webhook, flaky, broken := &recorder{}, &recorder{}, &recorder{}, &recorder{}
	w := channelWorker(e, &recorder{}, map[string]notify.Sender{
		"email":   email.sender(notify.SendResult{State: "sent"}),
		"webhook": webhook.sender(notify.SendResult{State: "sent"}),
		"max":     flaky.sender(notify.SendResult{State: "pending", Error: "нет связи"}),
	})
	w.Tick()
	w.Tick()
	expect(t, "email due once", kinds(email), "due:2026-01-31")
	expect(t, "webhook due once", kinds(webhook), "due:2026-01-31")
	expect(t, "retry waits for retry_after", flaky.count(), 1)

	// A safe failure is retried, but not forever.
	for range 10 {
		e.db.Exec("UPDATE deliveries SET retry_after=0")
		w.Tick()
	}
	expect(t, "stops after 5 attempts", flaky.count(), notify.MaxDeliveryAttempts)
	var state string
	e.db.QueryRow("SELECT state FROM deliveries WHERE channel='max'").Scan(&state)
	expect(t, "failed", state, "failed")

	// An unknown result is never retried.
	w.Channels["max"] = broken.sender(notify.SendResult{State: "uncertain", Error: "таймаут"})
	e.clock.Set(schedule.Civil(2026, 2, 1))
	w.Tick()
	e.db.Exec("UPDATE deliveries SET retry_after=0")
	w.Tick()
	expect(t, "uncertain once", kinds(broken), "overdue:2026-01-31")
	expect(t, "email overdue", kinds(email), "due:2026-01-31,overdue:2026-01-31")

	journal := admin.get("/api/v1/deliveries")
	expect(t, "journal", journal.status, 200)
	channels := map[string]bool{}
	for _, d := range journal.list(t) {
		channels[d["channel"].(string)] = true
	}
	for _, name := range []string{"telegram", "email", "webhook", "max"} {
		expect(t, "journal has "+name, channels[name], true)
	}
	user := e.client()
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user.signIn("alex", "User-password123!")
	expect(t, "journal is admin-only", user.get("/api/v1/deliveries").status, 403)
}

func TestPersonalOverdueReminder(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	users := admin.get("/api/v1/users").list(t)
	admin.createPayment(map[string]any{"assignee_id": users[0]["id"]})
	e.db.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,linked_at) VALUES(?,0,501,501,'x')", users[0]["id"])
	telegram := &recorder{}
	w := channelWorker(e, telegram, map[string]notify.Sender{})
	e.clock.Set(schedule.Civil(2026, 2, 1))
	w.Tick()
	var personal []string
	for _, row := range telegram.rows {
		if row.Kind == "overdue" {
			personal = append(personal, row.ChatID)
		}
	}
	expect(t, "team chat and the assignee", strings.Join(personal, ","), ",501")
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

// fakeMax serves the MAX Bot API: it records sent messages and answers, and returns queued updates.
type fakeMax struct {
	mu       sync.Mutex
	messages []map[string]any
	answers  []map[string]any
	updates  []bot.MaxUpdate
	auth     string
	server   *httptest.Server
}

func newFakeMax(t *testing.T) *fakeMax {
	f := &fakeMax{}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.auth = r.Header.Get("Authorization")
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		switch r.URL.Path {
		case "/messages":
			body["chat_id"] = r.URL.Query().Get("chat_id")
			f.messages = append(f.messages, body)
			json.NewEncoder(w).Encode(map[string]any{"message": map[string]any{"body": map[string]any{"mid": "mid.1"}}})
		case "/answers":
			body["callback_id"] = r.URL.Query().Get("callback_id")
			f.answers = append(f.answers, body)
			w.Write([]byte(`{"success":true}`))
		case "/updates":
			json.NewEncoder(w).Encode(map[string]any{"updates": f.updates, "marker": 9})
			f.updates = nil
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

func maxPress(chat int64, payload string) bot.MaxUpdate {
	u := bot.MaxUpdate{UpdateType: "message_callback", Message: &bot.MaxMessage{}}
	u.Message.Recipient.ChatID = chat
	u.Message.Body.Text = "🔔 Пора запланировать оплату"
	u.Callback = &struct {
		CallbackID string      `json:"callback_id"`
		Payload    string      `json:"payload"`
		User       bot.MaxUser `json:"user"`
	}{CallbackID: "cb-1", Payload: payload, User: bot.MaxUser{UserID: 5, Name: "Алексей"}}
	return u
}

func TestMaxRemindersAndPaidButton(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(map[string]any{"payment_url": "https://pay.me"})
	max := newFakeMax(t)
	e.settings.MaxBotToken, e.settings.MaxChatID, e.settings.MaxAPIURL = "max-token", "-7001", max.server.URL

	send := notify.MaxSender(e.settings, nil)
	occurrence := admin.get("/api/v1/payment-occurrences").list(t)[0]
	result := send(notify.ReminderRow{OccurrenceID: int64(occurrence["id"].(float64)), Title: "Аренда", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31", PaymentURL: "https://pay.me"})
	expect(t, "sent", result.State, "sent")
	expect(t, "token in header", max.auth, "max-token")
	expect(t, "chat", max.messages[0]["chat_id"], any("-7001"))

	tb := bot.NewMax(e.settings, e.db, e.server.BotBackend(), nil)
	max.updates = []bot.MaxUpdate{maxPress(-9999, "paid:"+id(occurrence))}
	if err := tb.PollOnce(0); err != nil {
		t.Fatal(err)
	}
	expect(t, "foreign chat refused", max.answers[0]["notification"], any("Нет доступа"))
	expect(t, "still unpaid", admin.get("/api/v1/payment-occurrences/" + id(occurrence)).object(t)["paid_at"], nil)

	max.updates = []bot.MaxUpdate{maxPress(-7001, "paid:"+id(occurrence))}
	if err := tb.PollOnce(0); err != nil {
		t.Fatal(err)
	}
	paid := admin.get("/api/v1/payment-occurrences/" + id(occurrence)).object(t)
	expect(t, "paid today", paid["paid_at"], any("2026-01-28"))
	expect(t, "actor", paid["updated_by"], any("max:Алексей"))
	answer := max.answers[1]
	expect(t, "callback", answer["callback_id"], any("cb-1"))
	edited := answer["message"].(map[string]any)
	expect(t, "button removed", len(edited["attachments"].([]any)), 0)
	expect(t, "marker stored", must(e.server.state("max_marker")), "9")

	todo := bot.MaxUpdate{UpdateType: "message_created", Message: &bot.MaxMessage{}}
	todo.Message.Recipient.ChatID = -7001
	todo.Message.Body.Text = "/chatid"
	max.updates = []bot.MaxUpdate{todo}
	tb.PollOnce(0)
	expect(t, "chatid answered", strings.Contains(max.messages[len(max.messages)-1]["text"].(string), "-7001"), true)
}
