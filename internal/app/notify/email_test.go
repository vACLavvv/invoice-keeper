package notify

import (
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"testing"

	"invoice-keeper/internal/app/config"
)

func TestWelcomeEmailHasSafeHTMLButtonAndPlainAlternative(t *testing.T) {
	port, data := fakeSMTP(t)
	s := &config.Settings{SMTPHost: "127.0.0.1", SMTPPort: port, SMTPSecurity: "none", SMTPFrom: "Invoice Keeper <bot@example.com>", SMTPTo: []string{"unrelated@example.com"}}
	link := "https://keeper.example.com/confirm-email#token=long-secret-code"
	expect(t, "SMTP accepted welcome", VerificationSender(s)("alex@example.com", "<script>alert(1)</script>", link).State, "sent")
	message, err := mail.ReadMessage(strings.NewReader(<-data))
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "only intended recipient", message.Header.Get("To"), "alex@example.com")
	_, params, err := mime.ParseMediaType(message.Header.Get("Content-Type"))
	if err != nil {
		t.Fatal(err)
	}
	reader := multipart.NewReader(message.Body, params["boundary"])
	parts := 0
	for {
		part, err := reader.NextRawPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(quotedprintable.NewReader(part))
		if err != nil {
			t.Fatal(err)
		}
		text := string(body)
		if !strings.Contains(text, link) {
			t.Fatal("missing verification link")
		}
		if strings.Contains(part.Header.Get("Content-Type"), "text/html") {
			if !strings.Contains(text, ">Подтвердить почту</a>") || strings.Contains(text, "<script>") {
				t.Fatal("unsafe or missing button")
			}
		}
		parts++
	}
	expect(t, "text and HTML", parts, 2)
}

func TestPersonalEmailDoesNotUseBroadcastRecipients(t *testing.T) {
	port, data := fakeSMTP(t)
	s := &config.Settings{SMTPHost: "127.0.0.1", SMTPPort: port, SMTPSecurity: "none", SMTPFrom: "bot@example.com", SMTPTo: []string{"shared@example.com"}}
	row := ReminderRow{EmailTo: "alex@example.com", Title: "Personal payment", Currency: "RUB", AmountCents: 100, DueDate: "2026-10-25"}
	expect(t, "sent", EmailSender(s)(row).State, "sent")
	message := <-data
	if strings.Contains(message, "shared@example.com") || !strings.Contains(message, "To: alex@example.com") {
		t.Fatal("personal mail leaked to shared recipient")
	}
}
