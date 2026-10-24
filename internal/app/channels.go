package app

// Transports for the extra reminder channels. Each returns the same three outcomes as Telegram:
// sent; pending — certainly not delivered, safe to retry; uncertain — the result is unknown.
// Errors are stored in the journal, so they never include tokens, passwords or response bodies.

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"
)

// --- MAX ---

// maxClient trusts the system roots plus MAX_CA_FILE: the MAX API may use a certificate
// of the Russian national CA, which is missing from many systems.
func maxClient(s *Settings, timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if s.MaxCAFile != "" {
		pool, err := x509.SystemCertPool()
		if err != nil || pool == nil {
			pool = x509.NewCertPool()
		}
		if pem, err := os.ReadFile(s.MaxCAFile); err != nil || !pool.AppendCertsFromPEM(pem) {
			log.Printf("MAX: не удалось прочитать сертификат MAX_CA_FILE")
		}
		transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	}
	return &http.Client{Timeout: timeout, Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// maxCall invokes a MAX Bot API method; the token goes in the Authorization header, never in the URL.
func maxCall(client *http.Client, s *Settings, method, path string, payload any) (*http.Response, error) {
	var body *bytes.Reader
	if payload != nil {
		raw, _ := json.Marshal(payload)
		body = bytes.NewReader(raw)
	} else {
		body = bytes.NewReader(nil)
	}
	request, err := http.NewRequest(method, s.MaxAPIURL+path, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", s.MaxBotToken)
	request.Header.Set("Content-Type", "application/json")
	return client.Do(request)
}

// maxKeyboard mirrors the Telegram buttons: «Оплачено» (callback) and «Оплатить» (link).
func maxKeyboard(row ReminderRow) []map[string]any {
	buttons := [][]map[string]string{{{"type": "callback", "text": "✅ Оплачено", "payload": "paid:" + itoa(row.OccurrenceID)}}}
	if row.PaymentURL != "" {
		buttons = append(buttons, []map[string]string{{"type": "link", "text": "💳 Оплатить", "url": row.PaymentURL}})
	}
	return []map[string]any{{"type": "inline_keyboard", "payload": map[string]any{"buttons": buttons}}}
}

// MaxSender posts reminders to MAX_CHAT_ID; baseClient replaces the HTTP client in tests.
func MaxSender(s *Settings, baseClient *http.Client) Sender {
	client := baseClient
	if client == nil {
		client = maxClient(s, 10*time.Second)
	}
	return func(row ReminderRow) SendResult {
		chat := s.MaxChatID
		if row.ChatID != "" {
			chat = row.ChatID
		}
		response, err := maxCall(client, s, "POST", "/messages?chat_id="+chat,
			map[string]any{"text": reminderText(row), "attachments": maxKeyboard(row)})
		if err != nil {
			if isConnectError(err) {
				return SendResult{State: "pending", Error: "Соединение с MAX не установлено", RetryDelay: 60}
			}
			return SendResult{State: "uncertain", Error: "Неизвестен результат отправки в MAX; автоматический повтор остановлен"}
		}
		defer response.Body.Close()
		var result struct {
			Message struct {
				Body struct {
					Mid string `json:"mid"`
				} `json:"body"`
			} `json:"message"`
		}
		decoded := json.NewDecoder(response.Body).Decode(&result) == nil
		switch {
		case response.StatusCode == 200 && decoded:
			return SendResult{State: "sent", MessageID: result.Message.Body.Mid}
		case response.StatusCode == 429:
			return SendResult{State: "pending", Error: "MAX ограничил частоту запросов", RetryDelay: 60}
		case response.StatusCode == 401 || response.StatusCode == 403 || response.StatusCode == 404:
			return SendResult{State: "pending", Error: fmt.Sprintf("MAX отклонил запрос (HTTP %d); проверьте MAX_BOT_TOKEN и MAX_CHAT_ID", response.StatusCode), RetryDelay: 600}
		}
		return SendResult{State: "uncertain", Error: fmt.Sprintf("MAX ответил HTTP %d; автоматический повтор остановлен", response.StatusCode)}
	}
}

// --- email ---

func emailSubject(row ReminderRow) string {
	prefix := "Напоминание об оплате"
	if row.overdue() {
		prefix = "Просрочен платёж"
	}
	subject := fmt.Sprintf("%s: %s — %s %s до %s", prefix, row.Title, money(row.AmountCents), row.Currency, shortDateFull(row.DueDate))
	return strings.NewReplacer("\r", " ", "\n", " ").Replace(subject)
}

func emailMessage(s *Settings, row ReminderRow, now time.Time) []byte {
	text := reminderText(row)
	text = strings.Replace(text, "нажмите «Оплачено» или отметьте в панели", "отметьте оплату в панели Invoice Keeper", 1)
	if row.PaymentURL != "" {
		text += "\n\nОплатить: " + row.PaymentURL
	}
	var body bytes.Buffer
	qp := quotedprintable.NewWriter(&body)
	qp.Write([]byte(strings.ReplaceAll(text, "\n", "\r\n")))
	qp.Close()
	headers := []string{
		"From: " + s.SMTPFrom,
		"To: " + strings.Join(s.SMTPTo, ", "),
		"Subject: " + mime.BEncoding.Encode("UTF-8", emailSubject(row)),
		"Date: " + now.Format(time.RFC1123Z),
		"Message-ID: <" + randomHex(12) + "@invoice-keeper>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: quoted-printable",
	}
	return []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + body.String())
}

// errBeforeData marks SMTP failures that happened before the message was handed over:
// the letter was certainly not sent.
var errBeforeData = errors.New("before data")

func sendMail(s *Settings, message []byte) error {
	address := net.JoinHostPort(s.SMTPHost, strconv.Itoa(s.SMTPPort))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	config := &tls.Config{ServerName: s.SMTPHost, MinVersion: tls.VersionTLS12}
	var conn net.Conn
	var err error
	if s.SMTPSecurity == "ssl" {
		conn, err = tls.DialWithDialer(dialer, "tcp", address, config)
	} else {
		conn, err = dialer.Dial("tcp", address)
	}
	if err != nil {
		return fmt.Errorf("%w: %w", errBeforeData, err)
	}
	conn.SetDeadline(time.Now().Add(30 * time.Second))
	client, err := smtp.NewClient(conn, s.SMTPHost)
	if err != nil {
		conn.Close()
		return fmt.Errorf("%w: %w", errBeforeData, err)
	}
	defer client.Close()
	prepare := func() error {
		if s.SMTPSecurity == "starttls" {
			if ok, _ := client.Extension("STARTTLS"); !ok {
				return errors.New("сервер не поддерживает STARTTLS")
			}
			if err := client.StartTLS(config); err != nil {
				return err
			}
		}
		if s.SMTPUsername != "" {
			if err := client.Auth(smtp.PlainAuth("", s.SMTPUsername, s.SMTPPassword, s.SMTPHost)); err != nil {
				return errors.New("неверный логин или пароль SMTP")
			}
		}
		from, err := mail.ParseAddress(s.SMTPFrom)
		if err != nil {
			return errors.New("неверный адрес SMTP_FROM")
		}
		if err := client.Mail(from.Address); err != nil {
			return err
		}
		for _, to := range s.SMTPTo {
			address, err := mail.ParseAddress(to)
			if err != nil {
				return errors.New("неверный адрес в SMTP_TO")
			}
			if err := client.Rcpt(address.Address); err != nil {
				return err
			}
		}
		return nil
	}
	if err := prepare(); err != nil {
		return fmt.Errorf("%w: %w", errBeforeData, err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("%w: %w", errBeforeData, err)
	}
	if _, err := writer.Write(message); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// EmailSender sends one plain-text letter per reminder to all SMTP_TO addresses.
func EmailSender(s *Settings) Sender {
	return func(row ReminderRow) SendResult {
		err := sendMail(s, emailMessage(s, row, time.Now()))
		switch {
		case err == nil:
			return SendResult{State: "sent"}
		case errors.Is(err, errBeforeData):
			reason := "почтовый сервер отклонил письмо; проверьте настройки SMTP"
			if isConnectError(err) {
				reason = "почтовый сервер недоступен"
			}
			return SendResult{State: "pending", Error: "Письмо не отправлено: " + reason, RetryDelay: 300}
		}
		return SendResult{State: "uncertain", Error: "Неизвестно, принял ли сервер письмо; автоматический повтор остановлен"}
	}
}

// --- webhook ---

func webhookPayload(row ReminderRow, now time.Time) map[string]any {
	event := "reminder.due"
	if row.overdue() {
		event = "reminder.overdue"
	}
	text := reminderText(row)
	if row.PaymentURL != "" {
		text += "\nОплатить: " + row.PaymentURL
	}
	return map[string]any{
		"event": event,
		"occurrence": map[string]any{
			"id": row.OccurrenceID, "title": row.Title, "amount": money(row.AmountCents), "currency": row.Currency,
			"due_date": row.DueDate, "payment_url": nullable(row.PaymentURL), "payment_details": nullable(row.PaymentDetails),
		},
		// text and content make the payload readable by Slack, Mattermost and Discord incoming webhooks.
		"text": text, "content": text,
		"sent_at": now.UTC().Format(time.RFC3339),
	}
}

func webhookSignature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// WebhookSender posts reminders as JSON. X-Invoice-Keeper-Delivery is stable per period and kind,
// so a receiver can drop duplicates; X-Invoice-Keeper-Signature proves the sender when a secret is set.
func WebhookSender(s *Settings, baseClient *http.Client) Sender {
	client := baseClient
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	return func(row ReminderRow) SendResult {
		payload := webhookPayload(row, time.Now())
		body, _ := json.Marshal(payload)
		request, err := http.NewRequest("POST", s.WebhookURL, bytes.NewReader(body))
		if err != nil {
			return SendResult{State: "uncertain", Error: "Неверный WEBHOOK_URL"}
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("User-Agent", "InvoiceKeeper-Webhook/1")
		request.Header.Set("X-Invoice-Keeper-Event", payload["event"].(string))
		request.Header.Set("X-Invoice-Keeper-Delivery", itoa(row.OccurrenceID)+"-"+payload["event"].(string))
		if s.WebhookSecret != "" {
			request.Header.Set("X-Invoice-Keeper-Signature", webhookSignature(s.WebhookSecret, body))
		}
		response, err := client.Do(request)
		if err != nil {
			if isConnectError(err) {
				return SendResult{State: "pending", Error: "Адрес webhook недоступен", RetryDelay: 60}
			}
			return SendResult{State: "uncertain", Error: "Неизвестен результат webhook; автоматический повтор остановлен"}
		}
		response.Body.Close()
		switch code := response.StatusCode; {
		case code >= 200 && code < 300:
			return SendResult{State: "sent"}
		case code == 429 || code >= 500:
			// The receiver may have processed it; the delivery header lets it drop the repeat.
			return SendResult{State: "pending", Error: fmt.Sprintf("Webhook ответил HTTP %d; повтор позже", code), RetryDelay: 300}
		default:
			return SendResult{State: "uncertain", Error: fmt.Sprintf("Webhook отклонил запрос (HTTP %d)", code)}
		}
	}
}
