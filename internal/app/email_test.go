package app

import (
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/security"
)

type welcomeRecorder struct {
	mu     sync.Mutex
	links  map[string]string
	calls  int
	result notify.SendResult
}

func emailHarness(t *testing.T) (*harness, *client, *welcomeRecorder, *recorder) {
	e := setup(t)
	e.settings.SMTPHost = "fake.example.com"
	e.settings.PublicBaseURL = e.http.URL
	welcome := &welcomeRecorder{links: map[string]string{}, result: notify.SendResult{State: "sent"}}
	e.server.Worker.VerificationSender = func(to, name, link string) notify.SendResult {
		welcome.mu.Lock()
		defer welcome.mu.Unlock()
		welcome.links[to] = link
		welcome.calls++
		return welcome.result
	}
	reminders := &recorder{}
	e.server.Worker.Channels = map[string]notify.Sender{"email": reminders.sender(notify.SendResult{State: "sent"})}
	c := e.client()
	c.signIn()
	return e, c, welcome, reminders
}

func createEmailUser(t *testing.T, c *client, login string) map[string]any {
	t.Helper()
	r := c.post("/api/v1/users", map[string]any{"username": login, "display_name": login, "password": "Colleague-Safe-123!", "email": login + "@example.com"})
	expect(t, "create user", r.status, 201)
	return r.object(t)
}

func welcomeCode(t *testing.T, w *welcomeRecorder, email string) string {
	t.Helper()
	w.mu.Lock()
	defer w.mu.Unlock()
	u, err := url.Parse(w.links[email])
	if err != nil {
		t.Fatal(err)
	}
	fragment, err := url.ParseQuery(u.Fragment)
	if err != nil {
		t.Fatal(err)
	}
	code := fragment.Get("token")
	if code == "" {
		t.Fatalf("no welcome link for %s", email)
	}
	return code
}

func TestEmailWelcomeConfirmationAndPersonalReminders(t *testing.T) {
	e, c, welcome, reminders := emailHarness(t)
	alex := createEmailUser(t, c, "alex")
	expect(t, "starts unverified", alex["email_verified_at"], nil)
	c.createPayment(map[string]any{"assignee_id": alex["id"]})
	expect(t, "no financial mail before confirmation", reminders.count(), 0)
	code := welcomeCode(t, welcome, "alex@example.com")
	var stored, secret string
	e.db.QueryRow("SELECT token_hash,token_secret FROM email_contacts WHERE user_id=?", alex["id"]).Scan(&stored, &secret)
	expect(t, "only digest retained", stored, security.Digest(code))
	expect(t, "sending secret erased", secret, "")
	anonymous := e.client()
	expect(t, "confirm without a panel session", anonymous.post("/api/v1/email/confirm", map[string]any{"token": code}).status, 204)
	expect(t, "personal mail after confirmation", reminders.count(), 1)
	expect(t, "correct recipient", reminders.rows[0].EmailTo, "alex@example.com")
	expect(t, "token single use", anonymous.post("/api/v1/email/confirm", map[string]any{"token": code}).status, 410)
	e.server.Worker.Tick()
	e.server.Worker.Tick()
	expect(t, "no duplicates", reminders.count(), 1)
	other := createEmailUser(t, c, "maria")
	c.createPayment(map[string]any{"assignee_id": other["id"], "title": "Other person's payment"})
	expect(t, "unverified other user not notified", reminders.count(), 1)
	expect(t, "Maria confirms", anonymous.post("/api/v1/email/confirm", map[string]any{"token": welcomeCode(t, welcome, "maria@example.com")}).status, 204)
	expect(t, "only Maria receives her reminder", reminders.count(), 2)
	expect(t, "Maria recipient", reminders.rows[1].EmailTo, "maria@example.com")
	list := c.get("/api/v1/deliveries")
	expect(t, "delivery journal", list.status, 200)
}

func TestEmailResendExpiryChangeAndPermissions(t *testing.T) {
	e, c, welcome, reminders := emailHarness(t)
	alex := createEmailUser(t, c, "alex")
	code := welcomeCode(t, welcome, "alex@example.com")
	expect(t, "resend rate limited", c.post("/api/v1/users/"+id(alex)+"/email/resend", nil).status, 429)
	anonymous := e.client()
	expect(t, "anonymous cannot read addresses", anonymous.get("/api/v1/me/email").status, 401)
	user := e.client()
	user.signIn("alex", "Colleague-Safe-123!")
	expect(t, "user cannot manage someone else", user.post("/api/v1/users/"+id(alex)+"/email/resend", nil).status, 403)
	e.db.Exec("UPDATE email_contacts SET expires_at=?,requested_at=0 WHERE user_id=?", time.Now().Unix()-1, alex["id"])
	expect(t, "expired code", anonymous.post("/api/v1/email/confirm", map[string]any{"token": code}).status, 410)
	expect(t, "resend", user.post("/api/v1/me/email/resend", nil).status, 204)
	newCode := welcomeCode(t, welcome, "alex@example.com")
	if newCode == code {
		t.Fatal("resend reused token")
	}
	expect(t, "old code invalid", anonymous.post("/api/v1/email/confirm", map[string]any{"token": code}).status, 410)
	e.db.Exec("UPDATE email_contacts SET requested_at=0 WHERE user_id=?", alex["id"])
	expect(t, "change address", c.patch("/api/v1/users/"+id(alex), map[string]any{"email": "alex.new@example.com"}).status, 200)
	expect(t, "old address code invalidated", anonymous.post("/api/v1/email/confirm", map[string]any{"token": newCode}).status, 410)
	payment := c.createPayment(map[string]any{"assignee_id": alex["id"]})
	expect(t, "no premature reminder", reminders.count(), 0)
	expect(t, "delete before confirmation", c.delete("/api/v1/recurring-payments/"+id(payment)+"?mode=delete").status, 204)
	expect(t, "new address confirmed", anonymous.post("/api/v1/email/confirm", map[string]any{"token": welcomeCode(t, welcome, "alex.new@example.com")}).status, 204)
	expect(t, "removed payment stays silent", reminders.count(), 0)
	expect(t, "restoring allows one reminder", c.post("/api/v1/recurring-payments/"+id(payment)+"/restore", nil).status, 204)
	expect(t, "new address gets reminder", reminders.rows[0].EmailTo, "alex.new@example.com")
	expect(t, "disable email", user.patch("/api/v1/me/email", map[string]any{"enabled": false}).status, 200)
	c.createPayment(map[string]any{"assignee_id": alex["id"]})
	expect(t, "opt-out respected", reminders.count(), 1)
}

func TestEmailWelcomeRetryAndAdminFallback(t *testing.T) {
	e, c, welcome, reminders := emailHarness(t)
	welcome.result = notify.SendResult{State: "pending", RetryDelay: 300, Error: "SMTP temporarily unavailable"}
	expect(t, "save admin email", c.patch("/api/v1/me/email", map[string]any{"email": "owner@example.com"}).status, 200)
	expect(t, "first welcome attempt", welcome.calls, 1)
	e.server.Worker.Tick()
	expect(t, "no immediate retry", welcome.calls, 1)
	welcome.result = notify.SendResult{State: "sent"}
	e.db.Exec("UPDATE email_contacts SET retry_after=0")
	expireTransportBackoff(t, e)
	e.server.Worker.Tick()
	expect(t, "welcome retry", welcome.calls, 2)
	c.createPayment(nil)
	expect(t, "admin not confirmed yet", reminders.count(), 0)
	expect(t, "admin confirms", e.client().post("/api/v1/email/confirm", map[string]any{"token": welcomeCode(t, welcome, "owner@example.com")}).status, 204)
	expect(t, "unassigned reminder", reminders.count(), 1)
	expect(t, "admin recipient", reminders.rows[0].EmailTo, "owner@example.com")
	alex := createEmailUser(t, c, "alex")
	c.createPayment(map[string]any{"assignee_id": alex["id"]})
	expect(t, "assigned payment not broadcast to admin", reminders.count(), 1)
}

func TestEmailAddressValidationAndWelcomeDurability(t *testing.T) {
	e, c, welcome, _ := emailHarness(t)
	for _, email := range []any{nil, "", "not-an-email", "A <a@example.com>", "a@example.com,b@example.com", "a@example.com\r\nBcc: evil@example.com"} {
		expect(t, "invalid email", c.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Alex", "password": "Colleague-Safe-123!", "email": email}).status, 422)
	}
	expect(t, "email required", c.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Alex", "password": "Colleague-Safe-123!"}).status, 422)
	e.settings.SMTPHost = ""
	createEmailUser(t, c, "alex")
	expect(t, "no attempt while SMTP disabled", welcome.calls, 0)
	var secret string
	e.db.QueryRow("SELECT token_secret FROM email_contacts").Scan(&secret)
	if len(secret) < 32 {
		t.Fatal("welcome not persisted")
	}
	e.settings.SMTPHost = "fake.example.com"
	e.server.Worker.Tick()
	expect(t, "queued welcome sent when SMTP returns", welcome.calls, 1)
	welcome.result = notify.SendResult{State: "uncertain", Error: "unknown"}
	createEmailUser(t, c, "maria")
	e.server.Worker.Tick()
	expect(t, "ambiguous send is not repeated", welcome.calls, 2)
	if strings.Contains(string(c.get("/api/v1/users").body), secret) {
		t.Fatal("API disclosed secret")
	}
}

func TestEmailReassignmentCancelsPendingOldRecipient(t *testing.T) {
	e, c, welcome, reminders := emailHarness(t)
	alex := createEmailUser(t, c, "alex")
	maria := createEmailUser(t, c, "maria")
	for _, address := range []string{"alex@example.com", "maria@example.com"} {
		expect(t, "confirm", e.client().post("/api/v1/email/confirm", map[string]any{"token": welcomeCode(t, welcome, address)}).status, 204)
	}
	// A definitely-unsent message for Alex is pending when the assignment changes.
	e.server.Worker.Channels["email"] = func(notify.ReminderRow) notify.SendResult {
		return notify.SendResult{State: "pending", RetryDelay: 300}
	}
	payment := c.createPayment(map[string]any{"assignee_id": alex["id"]})
	e.server.Worker.Channels["email"] = reminders.sender(notify.SendResult{State: "sent"})
	expect(t, "reassign", c.patch("/api/v1/recurring-payments/"+id(payment), map[string]any{"assignee_id": maria["id"]}).status, 200)
	e.db.Exec("UPDATE deliveries SET retry_after=0")
	expireTransportBackoff(t, e)
	e.server.Worker.Tick()
	expect(t, "one actual delivery", reminders.count(), 1)
	expect(t, "new assignee", reminders.rows[0].EmailTo, "maria@example.com")
	var state string
	e.db.QueryRow("SELECT state FROM deliveries WHERE recipient='alex@example.com'").Scan(&state)
	expect(t, "old address cancelled", state, "cancelled")
	// Reopening the database must preserve the receipt and suppress the next pass's duplicate.
	e.settings.SMTPHost = ""
	e.http.Close()
	e.db.Close()
	e.start()
	e.server.Worker.Channels = map[string]notify.Sender{"email": reminders.sender(notify.SendResult{State: "sent"})}
	e.server.Worker.Tick()
	expect(t, "no duplicate after restart", reminders.count(), 1)
}

func TestEmailSharedInboxDoesNotReceivePersonalDuplicate(t *testing.T) {
	e, c, welcome, reminders := emailHarness(t)
	e.settings.SMTPTo = []string{"Owner <owner@EXAMPLE.COM>"}
	expect(t, "admin email", c.patch("/api/v1/me/email", map[string]any{"email": "owner@example.com"}).status, 200)
	expect(t, "confirm", e.client().post("/api/v1/email/confirm", map[string]any{"token": welcomeCode(t, welcome, "owner@example.com")}).status, 204)
	c.createPayment(nil)
	e.server.Worker.Tick()
	expect(t, "one broadcast and no personal duplicate", reminders.count(), 1)
	expect(t, "uses existing shared channel", reminders.rows[0].EmailTo, "")
}
