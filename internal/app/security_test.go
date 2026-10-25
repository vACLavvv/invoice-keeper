package app

import (
	"bytes"
	"strings"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

func TestOriginRequiredOnCookieWrites(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	noOrigin := admin.do("POST", "/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}, "Origin", "")
	expect(t, "cookie write without Origin", noOrigin.status, 403)
	expect(t, "reason", noOrigin.object(t)["code"], any("origin_required"))
	foreign := admin.do("POST", "/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}, "Origin", "https://evil.example")
	expect(t, "foreign Origin", foreign.status, 403)
	expect(t, "reads need no Origin", admin.do("GET", "/api/v1/payment-occurrences", nil, "Origin", "").status, 200)

	token := e.keyClient(admin.createToken("write", nil))
	created := token.do("POST", "/api/v1/recurring-payments", map[string]any{"title": "Скрипт", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}, "Origin", "")
	expect(t, "tokens need no Origin", created.status, 201)
}

func TestUnknownQueryParametersRefused(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	expect(t, "known filter", admin.get("/api/v1/payment-occurrences?status=paid&currency=RUB").status, 200)
	typo := admin.get("/api/v1/payment-occurrences?staus=paid")
	expect(t, "misspelled filter", typo.status, 422)
	if !strings.Contains(string(typo.body), "staus") {
		t.Fatalf("error should name the parameter: %s", typo.body)
	}
	expect(t, "route without parameters", admin.get("/api/v1/users?x=1").status, 422)
	expect(t, "budget year", admin.get("/api/v1/budget?year=2026").status, 200)
}

func TestArgon2idAndRehashOfOldHashes(t *testing.T) {
	encoded := security.HashPassword("Fresh-pass-123!")
	if !strings.HasPrefix(encoded, "$argon2id$v=19$") {
		t.Fatalf("format: %s", encoded)
	}
	expect(t, "verifies", security.VerifyPassword("Fresh-pass-123!", encoded), true)
	expect(t, "wrong", security.VerifyPassword("Fresh-pass-124!", encoded), false)
	expect(t, "absurd cost refused", security.VerifyPassword("x", "$argon2id$v=19$m=99999999,t=1,p=1$AAAA$AAAA"), false)

	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	// A user stored by the scrypt release.
	legacy := "scrypt$00112233445566778899aabbccddeeff$deeacfbd6fcad6b2e04266a871985b33ad33f3912581d90869f86daf8ae5c4ddc6af25827122b9bc3e2c08c64f29165400b9a4842b621d86e66f738ae51bc787"
	e.db.Exec("UPDATE users SET password_hash=? WHERE username='alex'", legacy)
	e.client().signIn("alex", "Stored-earlier-1!")
	var stored string
	e.db.QueryRow("SELECT password_hash FROM users WHERE username='alex'").Scan(&stored)
	expect(t, "upgraded on sign-in", strings.HasPrefix(stored, "$argon2id$"), true)
	e.client().signIn("alex", "Stored-earlier-1!")
}

func TestWeakPasswordsRefused(t *testing.T) {
	for password, weak := range map[string]bool{
		"qwertyuiop123":       true, // leaked list
		"password1234567!":    true, // leaked base + symbols
		"alex-is-the-best-1":  true, // contains the login
		"aaaaaaaaaaaaaaaa":    true,
		"1234567890123":       true,
		"asdfghjklzxcvbnm":    true,
		"User-password123!":   false,
		"Vintage-Kettle-91!":  false,
		"щука-плавает-в-реке": false,
	} {
		if got := security.WeakPasswordReason(password, "alex") != ""; got != weak {
			t.Errorf("%q: weak=%v, want %v", password, got, weak)
		}
	}
	e := setup(t)
	admin := e.client()
	admin.signIn()
	weak := admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "olga", "display_name": "Ольга", "password": "qwertyuiop123"})
	expect(t, "weak password refused", weak.status, 422)
	expect(t, "with login refused", admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "olga", "display_name": "Ольга", "password": "olga-Password-91!"}).status, 422)

	settings := &config.Settings{DatabasePath: "x", AdminUsername: "admin", AdminPassword: "admin-password-2026"}
	if err := settings.Validate(); err == nil {
		t.Fatal("a weak ADMIN_PASSWORD must stop the server")
	}
}

func TestSecurityHeaders(t *testing.T) {
	e := setup(t)
	r := e.client().get("/api/v1/auth/me")
	for _, header := range []string{"Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "X-Content-Type-Options", "Content-Security-Policy"} {
		if r.header.Get(header) == "" {
			t.Errorf("missing %s", header)
		}
	}
	expect(t, "no HSTS over HTTP", r.header.Get("Strict-Transport-Security"), "")
	e.settings.CookieSecure = true
	expect(t, "HSTS with HTTPS", e.client().get("/api/v1/auth/me").header.Get("Strict-Transport-Security") != "", true)
}

func TestAPIRateLimit(t *testing.T) {
	limiter := newRateLimiter(1, 3)
	now := time.Unix(1000, 0)
	limiter.now = func() time.Time { return now }
	for i := range 3 {
		if ok, _ := limiter.allow("ip"); !ok {
			t.Fatalf("burst request %d refused", i)
		}
	}
	ok, wait := limiter.allow("ip")
	expect(t, "over the burst", ok, false)
	expect(t, "wait about a second", wait > 0 && wait <= time.Second, true)
	expect(t, "other clients unaffected", must(func() (bool, error) { ok, _ := limiter.allow("other"); return ok, nil }()), true)
	now = now.Add(time.Second)
	if ok, _ := limiter.allow("ip"); !ok {
		t.Fatal("refilled after a second")
	}

	e := setup(t)
	e.server.limiter = newRateLimiter(1, 2)
	c := e.client()
	c.get("/api/v1/auth/me")
	c.get("/api/v1/auth/me")
	limited := c.get("/api/v1/auth/me")
	expect(t, "429", limited.status, 429)
	expect(t, "Retry-After", limited.header.Get("Retry-After") != "", true)
	expect(t, "pages are not limited", c.get("/login").status, 200)
}

func TestEncryptionAtRest(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	payment := admin.createPayment(map[string]any{"payment_details": "р/с 40702810000000000001"})
	occurrence := admin.get("/api/v1/payment-occurrences").list(t)[0]
	pdf := append([]byte("%PDF-1.4\n"), bytes.Repeat([]byte("x"), 200)...)
	expect(t, "plain upload", admin.upload("/api/v1/payment-occurrences/"+id(occurrence)+"/receipts", "check.pdf", pdf).status, 201)
	admin.post("/api/v1/payment-occurrences/"+id(occurrence)+"/receipts", map[string]any{"url": "https://bank.example/receipt/77"})
	admin.post("/api/v1/auth/2fa/setup", nil)

	// The key is added to an existing installation: old values are encrypted on start.
	key := must(security.ParseEncryptionKey(security.NewEncryptionKey()))
	e.settings.EncryptionKey = key
	e.start()
	admin = e.client()
	admin.signIn()
	var details, link, pending string
	var data []byte
	e.db.QueryRow("SELECT payment_details FROM recurring_payments WHERE id=?", payment["id"]).Scan(&details)
	e.db.QueryRow("SELECT url FROM receipts WHERE kind='link'").Scan(&link)
	e.db.QueryRow("SELECT data FROM receipts WHERE kind='file'").Scan(&data)
	e.db.QueryRow("SELECT value FROM app_state WHERE key='admin_totp_pending'").Scan(&pending)
	for name, stored := range map[string]string{"details": details, "link": link, "totp": pending} {
		if !strings.HasPrefix(stored, security.TextPrefix) {
			t.Errorf("%s is stored in plain text: %q", name, stored)
		}
	}
	expect(t, "file encrypted", bytes.HasPrefix(data, []byte(security.BlobPrefix)) && !bytes.Contains(data, []byte("%PDF")), true)

	expect(t, "details readable", admin.get("/api/v1/recurring-payments").list(t)[0]["payment_details"], any("р/с 40702810000000000001"))
	receipts := admin.get("/api/v1/payment-occurrences/" + id(occurrence) + "/receipts").list(t)
	expect(t, "link readable", receipts[1]["url"], any("https://bank.example/receipt/77"))
	file := admin.get(receipts[0]["download_url"].(string)[len(""):])
	expect(t, "file readable", bytes.Equal(file.body, pdf), true)

	// New values are written encrypted, too.
	admin.patch("/api/v1/recurring-payments/"+id(payment), map[string]any{"payment_details": "новые реквизиты"})
	e.db.QueryRow("SELECT payment_details FROM recurring_payments WHERE id=?", payment["id"]).Scan(&details)
	expect(t, "update encrypted", strings.HasPrefix(details, security.TextPrefix), true)

	// Without the key, or with another one, the server refuses to start instead of showing garbage.
	for name, other := range map[string][]byte{"no key": nil, "wrong key": must(security.ParseEncryptionKey(security.NewEncryptionKey()))} {
		db, err := store.OpenDB(e.settings.DatabasePath)
		if err != nil {
			t.Fatal(err)
		}
		if err := ConfigureEncryption(db, other); err == nil {
			t.Errorf("%s: an encrypted database must not open", name)
		}
		db.Close()
	}
	security.SetKey(key)
}

func TestAuditChainDetectsTampering(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	admin.createPayment(map[string]any{"title": "Сервер"})
	check := admin.get("/api/v1/audit-log/verify").object(t)
	expect(t, "intact", check["ok"], any(true))
	expect(t, "all entries", check["checked"].(float64) >= 3, true)

	e.db.Exec("UPDATE audit_log SET actor='someone-else' WHERE id=2")
	check = admin.get("/api/v1/audit-log/verify").object(t)
	expect(t, "edit detected", check["ok"], any(false))
	expect(t, "where", check["broken_id"], any(2.0))
	e.db.Exec("UPDATE audit_log SET actor='admin' WHERE id=2")
	expect(t, "restored", admin.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))

	e.db.Exec("DELETE FROM audit_log WHERE id=(SELECT MAX(id) FROM audit_log)")
	check = admin.get("/api/v1/audit-log/verify").object(t)
	expect(t, "tail deletion detected", check["ok"], any(false))
	if !strings.Contains(check["reason"].(string), "последние") {
		t.Fatalf("reason: %v", check["reason"])
	}

	// Entries from before the chain are sealed on start, so an upgrade starts with a valid journal.
	e.db.Exec("UPDATE audit_log SET hash=NULL,chain=NULL")
	e.db.Exec("DELETE FROM audit_head")
	e.start()
	admin = e.client()
	admin.signIn()
	expect(t, "sealed after upgrade", admin.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

type alertRecorder struct {
	mu   sync.Mutex
	sent []string
}

func (a *alertRecorder) notify(chat int64, text string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.sent = append(a.sent, itoa(chat)+": "+text)
}

func TestSignInAndLockoutAlerts(t *testing.T) {
	e := setup(t)
	alerts := &alertRecorder{}
	e.settings.LoginAlerts = true
	e.server.notifier = alerts.notify
	admin := e.client()
	admin.signIn()
	expect(t, "nobody linked, nothing sent", len(alerts.sent), 0)

	e.db.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,linked_at) VALUES(NULL,1,700,700,'x')")
	stranger := e.client()
	stranger.do("POST", "/api/v1/auth/login", map[string]any{"username": "admin", "password": testPassword}, "User-Agent", "Strange/1.0")
	expect(t, "sign-in alert", len(alerts.sent), 1)
	if !strings.HasPrefix(alerts.sent[0], "700: 🔐 Вход") || !strings.Contains(alerts.sent[0], "Strange/1.0") {
		t.Fatalf("alert: %s", alerts.sent[0])
	}

	guesser := e.client()
	for range 12 {
		guesser.post("/api/v1/auth/login", map[string]any{"username": "admin", "password": "Wrong-password-1!"})
	}
	lockouts := 0
	for _, text := range alerts.sent {
		if strings.Contains(text, "неудачных попыток") {
			lockouts++
		}
	}
	expect(t, "one lockout alert", lockouts, 1)
}

func TestPaidButtonOnlyForLinkedMembers(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	tb, tg := botFor(e)
	e.settings.PaidLinkedOnly = true

	guest := pressPaid(ourChat, id(item))
	guest.CallbackQuery.From.ID = 501
	tb.Handle(guest)
	expect(t, "guest refused", strings.HasPrefix(tg.sent("answerCallbackQuery")[0]["text"].(string), "Привяжите Telegram"), true)
	expect(t, "still unpaid", c.get("/api/v1/payment-occurrences/" + id(item)).object(t)["paid_at"], nil)

	c.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	users := c.get("/api/v1/users").list(t)
	e.db.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,linked_at) VALUES(?,0,501,501,'x')", users[0]["id"])
	tb.Handle(guest)
	e.server.Worker.Wait()
	paid := c.get("/api/v1/payment-occurrences/" + id(item)).object(t)
	expect(t, "linked member pays", paid["paid_at"], any("2026-01-28"))
	expect(t, "recorded under the panel name", paid["updated_by"], any("alex"))
}
