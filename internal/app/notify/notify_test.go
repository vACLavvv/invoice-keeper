package notify

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
)

func TestReminderCarriesPaidButton(t *testing.T) {
	var body map[string]any
	telegram := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		w.Write([]byte(`{"ok":true,"result":{"message_id":5}}`))
	}))
	defer telegram.Close()
	sender := TelegramSender(&config.Settings{TelegramBotToken: "t", TelegramChatID: "1"}, telegram.URL)
	sender(ReminderRow{OccurrenceID: 12, Title: "Аренда", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31"})
	raw, _ := json.Marshal(body["reply_markup"])
	if !strings.Contains(string(raw), `"callback_data":"paid:12"`) || !strings.Contains(string(raw), "Оплачено") {
		t.Fatalf("keyboard: %s", raw)
	}
}

func TestSanctionsReminderBlocksPayButton(t *testing.T) {
	row := ReminderRow{OccurrenceID: 5, Title: "Подрядчик", AmountCents: 100, Currency: "USD", DueDate: "2026-01-31",
		PaymentURL: "https://pay.me", WalletNetwork: "TRON", WalletAddress: "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz", SanctionsMatch: "SAMPLE EXCHANGE LLC"}
	text := ReminderText(row)
	if !strings.Contains(text, "⛔ Кошелёк получателя в санкционном списке OFAC (SAMPLE EXCHANGE LLC)") || !strings.Contains(text, "Кошелёк (TRON)") {
		t.Fatalf("text: %s", text)
	}
	for name, keyboard := range map[string]any{"telegram": PaidKeyboard(row), "max": MaxKeyboard(row)} {
		if strings.Contains(must(jsonString(keyboard)), "pay.me") {
			t.Fatalf("%s keeps the pay button for a sanctioned wallet", name)
		}
	}
	if strings.Contains(string(EmailMessage(&config.Settings{SMTPFrom: "a@b.c", SMTPTo: []string{"d@e.f"}}, row, nowForTest())), "pay.me") {
		t.Fatal("email keeps the pay link")
	}
}

func TestReminderHasPayButtonAndDetails(t *testing.T) {
	row := ReminderRow{OccurrenceID: 12, Title: "Аренда", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31",
		PaymentURL: "https://bank.ru/pay", PaymentDetails: "счёт 40702"}
	raw, _ := json.Marshal(PaidKeyboard(row))
	if !strings.Contains(string(raw), `"url":"https://bank.ru/pay"`) || !strings.Contains(string(raw), "Оплатить") {
		t.Fatalf("keyboard: %s", raw)
	}
	if !strings.Contains(ReminderText(row), "Реквизиты: счёт 40702") {
		t.Fatalf("text: %s", ReminderText(row))
	}
	row.Kind = "overdue"
	if !strings.HasPrefix(ReminderText(row), "⚠️ Платёж просрочен") {
		t.Fatalf("overdue text: %s", ReminderText(row))
	}
	raw, _ = json.Marshal(MaxKeyboard(row))
	if !strings.Contains(string(raw), `"type":"link"`) || !strings.Contains(string(raw), `"payload":"paid:12"`) {
		t.Fatalf("max keyboard: %s", raw)
	}
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
	settings := &config.Settings{WebhookURL: receiver.URL, WebhookSecret: "s3cret", WebhookAllowPrivate: true}
	send := WebhookSender(settings, nil)
	row := ReminderRow{Kind: "overdue", OccurrenceID: 7, Title: "Сервер", AmountCents: 2400, Currency: "USD", DueDate: "2026-01-31", PaymentURL: "https://pay.me"}
	expect(t, "sent", send(row).State, "sent")
	expect(t, "signature", got.Header.Get("X-Invoice-Keeper-Signature"), WebhookSignature("s3cret", body))
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
	// A stale keep-alive may fail after writing, which is correctly ambiguous. A fresh
	// transport makes this specifically a refused connection, safe to retry on every OS.
	expect(t, "unreachable retried", WebhookSender(settings, nil)(row).State, "pending")
}

func TestEmailReminder(t *testing.T) {
	port, data := fakeSMTP(t)
	settings := &config.Settings{SMTPHost: "127.0.0.1", SMTPPort: port, SMTPSecurity: "none", SMTPFrom: "Invoice Keeper <bot@team.ru>", SMTPTo: []string{"a@team.ru", "b@team.ru"}}
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

func jsonString(v any) (string, error) {
	raw, err := json.Marshal(v)
	return string(raw), err
}

func nowForTest() time.Time { return time.Date(2026, 1, 28, 9, 0, 0, 0, time.UTC) }

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
	settings := &config.Settings{TelegramBotToken: "SECRET-TOKEN", TelegramChatID: "123"}
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
	expect(t, "rejected", result.State, "failed")
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
	expect(t, "read failure is ambiguous", IsConnectError(timeout), false)
	expect(t, "dns", IsConnectError(&net.DNSError{Err: "no such host"}), true)
}

func expect[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

func TestWebhookRefusesInternalAddresses(t *testing.T) {
	hits := 0
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer receiver.Close()
	row := ReminderRow{Kind: "due", OccurrenceID: 1, Title: "Сервер", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31"}
	for _, link := range []string{receiver.URL, "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/hook", "http://[::1]:9/hook"} {
		result := WebhookSender(&config.Settings{WebhookURL: link}, nil)(row)
		expect(t, link+" refused", result.State, "failed")
	}
	expect(t, "nothing reached the receiver", hits, 0)
	for ip, private := range map[string]bool{"8.8.8.8:443": false, "100.100.1.1:80": true, "192.168.1.5:80": true, "[fd00::1]:80": true, "[2a00:1450::1]:443": false} {
		expect(t, ip, publicOnly("tcp", ip, nil) != nil, private)
	}
}
