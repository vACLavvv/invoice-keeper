package app

import (
	"bufio"
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
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

func TestReminderHasPayButtonAndDetails(t *testing.T) {
	row := ReminderRow{OccurrenceID: 12, Title: "Аренда", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31",
		PaymentURL: "https://bank.ru/pay", PaymentDetails: "счёт 40702"}
	raw, _ := json.Marshal(paidKeyboard(row))
	if !strings.Contains(string(raw), `"url":"https://bank.ru/pay"`) || !strings.Contains(string(raw), "Оплатить") {
		t.Fatalf("keyboard: %s", raw)
	}
	if !strings.Contains(reminderText(row), "Реквизиты: счёт 40702") {
		t.Fatalf("text: %s", reminderText(row))
	}
	row.Kind = "overdue"
	if !strings.HasPrefix(reminderText(row), "⚠️ Платёж просрочен") {
		t.Fatalf("overdue text: %s", reminderText(row))
	}
	raw, _ = json.Marshal(maxKeyboard(row))
	if !strings.Contains(string(raw), `"type":"link"`) || !strings.Contains(string(raw), `"payload":"paid:12"`) {
		t.Fatalf("max keyboard: %s", raw)
	}
}

// channelWorker is a worker with recorded Telegram and extra channels.
func channelWorker(e *harness, telegram *recorder, channels map[string]Sender) *ReminderWorker {
	settings := enabledSettings(e)
	settings.OverdueReminders = true
	w := NewReminderWorker(e.db, settings, telegram.sender(SendResult{State: "sent", MessageID: "1"}), e.clock.Today)
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
	w := channelWorker(e, telegram, map[string]Sender{})
	w.Tick()
	expect(t, "due reminder", kinds(telegram), "due:2026-01-31")
	e.clock.Set(civil(2026, 1, 31))
	w.Tick()
	expect(t, "nothing on the due day", telegram.count(), 1)
	e.clock.Set(civil(2026, 2, 1))
	w.Tick()
	w.Tick()
	expect(t, "overdue once", kinds(telegram), "due:2026-01-31,overdue:2026-01-31")

	// Paid before the next day: no overdue message.
	e.clock.Set(civil(2026, 2, 26))
	w.Tick()
	feb := admin.get("/api/v1/payment-occurrences?from_date=2026-02-28&to_date=2026-02-28").list(t)[0]
	admin.patch("/api/v1/payment-occurrences/"+id(feb), map[string]any{"paid": true, "paid_at": "2026-02-26"})
	e.clock.Set(civil(2026, 3, 1))
	w.Tick()
	expect(t, "paid stays quiet", kinds(telegram), "due:2026-01-31,overdue:2026-01-31,due:2026-02-28")

	// Turned off: no overdue messages at all.
	w.Settings.OverdueReminders = false
	e.clock.Set(civil(2026, 4, 1))
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
	channelWorker(e, telegram, map[string]Sender{}).Tick()
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
	w := channelWorker(e, &recorder{}, map[string]Sender{
		"email":   email.sender(SendResult{State: "sent"}),
		"webhook": webhook.sender(SendResult{State: "sent"}),
		"max":     flaky.sender(SendResult{State: "pending", Error: "нет связи"}),
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
	expect(t, "stops after 5 attempts", flaky.count(), maxDeliveryAttempts)
	var state string
	e.db.QueryRow("SELECT state FROM deliveries WHERE channel='max'").Scan(&state)
	expect(t, "failed", state, "failed")

	// An unknown result is never retried.
	w.Channels["max"] = broken.sender(SendResult{State: "uncertain", Error: "таймаут"})
	e.clock.Set(civil(2026, 2, 1))
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
	w := channelWorker(e, telegram, map[string]Sender{})
	e.clock.Set(civil(2026, 2, 1))
	w.Tick()
	var personal []string
	for _, row := range telegram.rows {
		if row.Kind == "overdue" {
			personal = append(personal, row.ChatID)
		}
	}
	expect(t, "team chat and the assignee", strings.Join(personal, ","), ",501")
}

func TestWebhookPayloadSignatureAndOutcomes(t *testing.T) {
	var mu sync.Mutex
	var got *http.Request
	var body []byte
	status := 204
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		got, body = r, must(io.ReadAll(r.Body))
		w.WriteHeader(status)
	}))
	defer receiver.Close()
	settings := &Settings{WebhookURL: receiver.URL, WebhookSecret: "s3cret"}
	send := WebhookSender(settings, nil)
	row := ReminderRow{Kind: "overdue", OccurrenceID: 7, Title: "Сервер", AmountCents: 2400, Currency: "USD", DueDate: "2026-01-31", PaymentURL: "https://pay.me"}
	expect(t, "sent", send(row).State, "sent")
	expect(t, "signature", got.Header.Get("X-Invoice-Keeper-Signature"), webhookSignature("s3cret", body))
	expect(t, "event header", got.Header.Get("X-Invoice-Keeper-Event"), "reminder.overdue")
	expect(t, "delivery id", got.Header.Get("X-Invoice-Keeper-Delivery"), "7-reminder.overdue")
	var payload map[string]any
	json.Unmarshal(body, &payload)
	occurrence := payload["occurrence"].(map[string]any)
	expect(t, "amount", occurrence["amount"], any("24.00"))
	expect(t, "slack text", strings.Contains(payload["text"].(string), "Оплатить: https://pay.me"), true)

	status = 503
	expect(t, "server error retried", send(row).State, "pending")
	status = 400
	expect(t, "rejected not retried", send(row).State, "uncertain")
	receiver.Close()
	expect(t, "unreachable retried", send(row).State, "pending")
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

// fakeSMTP accepts one plain SMTP session and returns the DATA it received.
func fakeSMTP(t *testing.T) (port int, data chan string) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	data = make(chan string, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		reader := bufio.NewReader(conn)
		reply := func(line string) { conn.Write([]byte(line + "\r\n")) }
		reply("220 fake")
		var message strings.Builder
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			switch command := strings.ToUpper(strings.TrimSpace(line)); {
			case strings.HasPrefix(command, "EHLO"), strings.HasPrefix(command, "HELO"):
				reply("250 fake")
			case strings.HasPrefix(command, "MAIL"), strings.HasPrefix(command, "RCPT"):
				reply("250 ok")
			case command == "DATA":
				reply("354 go")
				for {
					line, err := reader.ReadString('\n')
					if err != nil || line == ".\r\n" {
						break
					}
					message.WriteString(line)
				}
				data <- message.String()
				reply("250 queued")
			case command == "QUIT":
				reply("221 bye")
				return
			default:
				reply("250 ok")
			}
		}
	}()
	return listener.Addr().(*net.TCPAddr).Port, data
}

func TestEmailReminder(t *testing.T) {
	port, data := fakeSMTP(t)
	settings := &Settings{SMTPHost: "127.0.0.1", SMTPPort: port, SMTPSecurity: "none", SMTPFrom: "Invoice Keeper <bot@team.ru>", SMTPTo: []string{"a@team.ru", "b@team.ru"}}
	row := ReminderRow{OccurrenceID: 3, Title: "Аренда\r\nBcc: evil@x.ru", AmountCents: 150000, Currency: "RUB", DueDate: "2026-01-31", PaymentURL: "https://bank.ru/pay"}
	expect(t, "sent", EmailSender(settings)(row).State, "sent")
	message := <-data
	headers, _, _ := strings.Cut(message, "\r\n\r\n")
	if strings.Contains(headers, "\r\nBcc:") {
		t.Fatalf("header injection: %s", headers)
	}
	var subject string
	for _, line := range strings.Split(headers, "\r\n") {
		if value, ok := strings.CutPrefix(line, "Subject: "); ok {
			subject, _ = new(mime.WordDecoder).DecodeHeader(value)
		}
	}
	expect(t, "subject", subject, "Напоминание об оплате: Аренда  Bcc: evil@x.ru — 1500.00 RUB до 31.01.2026")
	if !strings.Contains(message, "To: a@team.ru, b@team.ru") || !strings.Contains(message, "https://bank.ru/pay") {
		t.Fatalf("message: %s", message)
	}

	listener, _ := net.Listen("tcp", "127.0.0.1:0")
	closed := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	settings.SMTPPort = closed
	expect(t, "server down is retried", EmailSender(settings)(row).State, "pending")
}

// fakeMax serves the MAX Bot API: it records sent messages and answers, and returns queued updates.
type fakeMax struct {
	mu       sync.Mutex
	messages []map[string]any
	answers  []map[string]any
	updates  []maxUpdate
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

func maxPress(chat int64, payload string) maxUpdate {
	u := maxUpdate{UpdateType: "message_callback", Message: &maxMessage{}}
	u.Message.Recipient.ChatID = chat
	u.Message.Body.Text = "🔔 Пора запланировать оплату"
	u.Callback = &struct {
		CallbackID string  `json:"callback_id"`
		Payload    string  `json:"payload"`
		User       maxUser `json:"user"`
	}{CallbackID: "cb-1", Payload: payload, User: maxUser{UserID: 5, Name: "Алексей"}}
	return u
}

func TestMaxRemindersAndPaidButton(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(map[string]any{"payment_url": "https://pay.me"})
	max := newFakeMax(t)
	e.settings.MaxBotToken, e.settings.MaxChatID, e.settings.MaxAPIURL = "max-token", "-7001", max.server.URL

	send := MaxSender(e.settings, nil)
	occurrence := admin.get("/api/v1/payment-occurrences").list(t)[0]
	result := send(ReminderRow{OccurrenceID: int64(occurrence["id"].(float64)), Title: "Аренда", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31", PaymentURL: "https://pay.me"})
	expect(t, "sent", result.State, "sent")
	expect(t, "token in header", max.auth, "max-token")
	expect(t, "chat", max.messages[0]["chat_id"], any("-7001"))

	bot := NewMaxBot(e.server, nil)
	max.updates = []maxUpdate{maxPress(-9999, "paid:"+id(occurrence))}
	if err := bot.pollOnce(0); err != nil {
		t.Fatal(err)
	}
	expect(t, "foreign chat refused", max.answers[0]["notification"], any("Нет доступа"))
	expect(t, "still unpaid", admin.get("/api/v1/payment-occurrences/" + id(occurrence)).object(t)["paid_at"], nil)

	max.updates = []maxUpdate{maxPress(-7001, "paid:"+id(occurrence))}
	if err := bot.pollOnce(0); err != nil {
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

	todo := maxUpdate{UpdateType: "message_created", Message: &maxMessage{}}
	todo.Message.Recipient.ChatID = -7001
	todo.Message.Body.Text = "/chatid"
	max.updates = []maxUpdate{todo}
	bot.pollOnce(0)
	expect(t, "chatid answered", strings.Contains(max.messages[len(max.messages)-1]["text"].(string), "-7001"), true)
}
