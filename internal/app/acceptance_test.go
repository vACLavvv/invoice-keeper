package app

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"

	invoicekeeper "invoice-keeper"
)

func TestDataRequiresAuthorization(t *testing.T) {
	e := setup(t)
	c := e.client()
	for _, path := range []string{"/api/v1/auth/me", "/api/v1/recurring-payments", "/api/v1/payment-occurrences", "/api/v1/payments/summary",
		"/api/v1/users", "/api/v1/docs", "/api/v1/openapi.json", "/api/v1/reminders", "/api/v1/audit-log", "/api/v1/payment-occurrences/1"} {
		expect(t, path, c.get(path).status, 401)
	}
	for _, page := range []string{"/", "/recurring", "/calendar", "/team", "/activity"} {
		r := c.get(page)
		expect(t, page+" redirect", r.status, 303)
		expect(t, page+" location", r.header.Get("Location"), "/login")
	}
	login := c.get("/login")
	expect(t, "login page", login.status, 200)
	if !strings.Contains(login.header.Get("Content-Security-Policy"), "'sha256-") || strings.Contains(login.header.Get("Content-Security-Policy"), "script-src 'self' 'unsafe-inline'") {
		t.Fatalf("inline scripts must be allowed by hash only: %s", login.header.Get("Content-Security-Policy"))
	}
	for _, path := range []string{"/index.html", "/team.html", "/_next/", "/_next/static/", "/missing"} {
		if r := c.get(path); r.status != 404 {
			t.Fatalf("%s: got %d, want 404", path, r.status)
		}
	}
	expect(t, "api 404 is json", c.get("/api/v1/missing").header.Get("Content-Type"), "application/json")
	expect(t, "favicon", c.get("/favicon.svg").status, 200)
	expect(t, "health", c.get("/healthz").status, 200)
}

func TestCookieCSRFAndLogout(t *testing.T) {
	e := setup(t)
	c := e.client()
	expect(t, "wrong password", c.post("/api/v1/auth/login", map[string]any{"username": "admin", "password": "wrong"}).status, 401)
	c.signIn()
	second := c.post("/api/v1/auth/login", map[string]any{"username": "admin", "password": testPassword})
	cookie := second.header.Get("Set-Cookie")
	if !strings.Contains(cookie, "HttpOnly") || !strings.Contains(cookie, "SameSite=Strict") {
		t.Fatalf("cookie flags: %s", cookie)
	}
	// The second session has its own CSRF value.
	csrf := c.get("/api/v1/auth/me").object(t)["csrf_token"].(string)
	c.csrf = ""
	expect(t, "no csrf", c.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}).status, 403)
	c.csrf = csrf
	expect(t, "foreign origin", c.do("POST", "/api/v1/auth/logout", nil, "Origin", "https://evil.example").status, 403)
	expect(t, "cross-site", c.do("POST", "/api/v1/auth/logout", nil, "Sec-Fetch-Site", "cross-site").status, 403)
	expect(t, "logout", c.post("/api/v1/auth/logout", nil).status, 204)
	expect(t, "after logout", c.get("/api/v1/auth/me").status, 401)
	rows, err := e.db.Query("SELECT token_hash FROM sessions")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var hash string
		rows.Scan(&hash)
		expect(t, "token stored as sha256", len(hash), 64)
	}
}

func TestRegularUserPermissionsAndUserLifecycle(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	payment := admin.createPayment(nil)
	created := admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	expect(t, "create user", created.status, 201)
	user := created.object(t)
	if _, leaked := user["password_hash"]; leaked {
		t.Fatal("password hash returned")
	}
	ordinary := e.client()
	ordinary.signIn("ALEX", "User-password123!")
	forbidden := []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/v1/users", nil},
		{"GET", "/api/v1/reminders", nil},
		{"GET", "/api/v1/audit-log", nil},
		{"POST", "/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}},
		{"DELETE", "/api/v1/recurring-payments/" + id(payment), nil},
		{"POST", "/api/v1/users", map[string]any{"username": "other", "display_name": "X", "password": "User-password123!"}},
		{"PATCH", "/api/v1/users/" + id(user), map[string]any{"display_name": "test"}},
		{"DELETE", "/api/v1/users/" + id(user), nil},
	}
	for _, f := range forbidden {
		expect(t, f.method+" "+f.path, ordinary.do(f.method, f.path, f.body).status, 403)
	}
	items := ordinary.get("/api/v1/payment-occurrences").list(t)
	paid := ordinary.patch("/api/v1/payment-occurrences/"+id(items[0]), map[string]any{"paid": true})
	expect(t, "user marks paid", paid.status, 200)
	expect(t, "paid today", paid.object(t)["paid_at"], any("2026-01-28"))
	expect(t, "user reads docs", ordinary.get("/api/v1/docs").status, 200)
	expect(t, "rename", admin.patch("/api/v1/users/"+id(user), map[string]any{"display_name": "Алексей Петров"}).status, 200)
	expect(t, "renamed", ordinary.get("/api/v1/auth/me").object(t)["display_name"], any("Алексей Петров"))
	expect(t, "new password", admin.patch("/api/v1/users/"+id(user), map[string]any{"password": "Replacement-pass123!"}).status, 200)
	expect(t, "sessions revoked", ordinary.get("/api/v1/auth/me").status, 401)
	ordinary.signIn("alex", "Replacement-pass123!")
	expect(t, "delete", admin.delete("/api/v1/users/"+id(user)).status, 204)
	expect(t, "deleted user signed out", ordinary.get("/api/v1/auth/me").status, 401)
	expect(t, "history kept", admin.get("/api/v1/payment-occurrences").list(t)[0]["paid_at"], any("2026-01-28"))
}

func TestAdminAccountCannotBeManagedInPanel(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	expect(t, "delete admin", c.delete("/api/v1/users/0").status, 403)
	expect(t, "patch admin", c.patch("/api/v1/users/0", map[string]any{"display_name": "Hack"}).status, 403)
	expect(t, "admin login taken", c.post("/api/v1/users", map[string]any{"username": "ADMIN", "display_name": "x", "password": "VeryLongPassword!"}).status, 409)
	expect(t, "role field", c.post("/api/v1/users", map[string]any{"username": "other", "display_name": "x", "password": "VeryLongPassword!", "role": "admin"}).status, 422)
	expect(t, "duplicate", c.post("/api/v1/users", map[string]any{"username": "dup", "display_name": "x", "password": "VeryLongPassword!"}).status, 201)
	expect(t, "duplicate", c.post("/api/v1/users", map[string]any{"username": "DUP", "display_name": "x", "password": "VeryLongPassword!"}).status, 409)
}

func dueDates(items []map[string]any) string {
	var dates []string
	for _, item := range items {
		dates = append(dates, item["due_date"].(string))
	}
	return strings.Join(dates, ",")
}

func TestMonthEndAnchorAndUnpaidIndependentPeriods(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	e.clock.Set(civil(2026, 3, 31))
	items := c.get("/api/v1/payment-occurrences").list(t)
	expect(t, "dates", dueDates(items), "2026-01-31,2026-02-28,2026-03-31,2026-04-30")
	var statuses []string
	for _, item := range items {
		statuses = append(statuses, item["status"].(string))
	}
	expect(t, "statuses", strings.Join(statuses, ","), "overdue,overdue,unpaid,unpaid")
	expect(t, "pay first", c.patch("/api/v1/payment-occurrences/"+id(items[0]), map[string]any{"paid_at": "2026-01-31"}).status, 200)
	items = c.get("/api/v1/payment-occurrences").list(t)
	expect(t, "first paid", items[0]["status"], any("paid"))
	expect(t, "second still overdue", items[1]["status"], any("overdue"))
	expect(t, "leap year", formatDate(monthlyDate(civil(2028, 1, 31), 1, 0)), "2028-02-29")
	expect(t, "year wrap", formatDate(monthlyDate(civil(2026, 12, 31), 1, 0)), "2027-01-31")
}

func TestPaymentDateCorrectionUndoAndDueDay(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"first_due_date": "2026-01-28"})
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	expect(t, "due today is not overdue", item["status"], any("unpaid"))
	expect(t, "days", item["days_overdue"], any(0.0))
	e.clock.Set(civil(2026, 2, 2))
	path := "/api/v1/payment-occurrences/" + id(item)
	late := c.patch(path, map[string]any{"paid": true, "paid_at": "2026-01-30"}).object(t)
	expect(t, "late", late["is_late"], any(true))
	expect(t, "late days", late["days_overdue"], any(2.0))
	corrected := c.patch(path, map[string]any{"paid_at": "2026-01-28"}).object(t)
	expect(t, "corrected", corrected["status"], any("paid"))
	expect(t, "on due day is on time", corrected["is_late"], any(false))
	expect(t, "due unchanged", corrected["due_date"], any("2026-01-28"))
	undone := c.patch(path, map[string]any{"paid": false}).object(t)
	expect(t, "undo clears date", undone["paid_at"], nil)
	expect(t, "undo overdue", undone["status"], any("overdue"))
	expect(t, "undo days", undone["days_overdue"], any(5.0))
	for _, body := range []map[string]any{
		{"paid_at": "2026-02-03"}, {"paid": false, "paid_at": "2026-01-28"}, {"paid": true, "paid_at": nil},
		{}, {"paid": nil}, {"amount": "0.01"}, {"paid": "yes"}, {"paid_at": "2026-02-30"},
	} {
		expect(t, fmt.Sprint(body), c.patch(path, body).status, 422)
	}
	expect(t, "null paid_at undoes", c.patch(path, map[string]any{"paid_at": nil}).object(t)["paid_at"], nil)
	expect(t, "missing", c.patch("/api/v1/payment-occurrences/9999", map[string]any{"paid": true}).status, 404)
	expect(t, "bad id", c.patch("/api/v1/payment-occurrences/abc", map[string]any{"paid": true}).status, 422)
}

func TestNextMonthIsCompleteEvenWhenDueAfterToday(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	e.clock.Set(civil(2026, 10, 23))
	c.createPayment(map[string]any{"first_due_date": "2026-10-26"})
	items := c.get("/api/v1/payment-occurrences").list(t)
	expect(t, "dates", dueDates(items), "2026-10-26,2026-11-26")
	c.patch("/api/v1/payment-occurrences/"+id(items[0]), map[string]any{"paid": true})
	next := c.get("/api/v1/payment-occurrences?from_date=2026-11-01&to_date=2026-11-30").list(t)
	expect(t, "next unpaid", next[0]["status"], any("unpaid"))
	expect(t, "next no date", next[0]["paid_at"], nil)
}

func TestCurrencySummaryExactAndDateFilters(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for _, p := range [][2]string{{"RUB", "0.10"}, {"RUB", "0.20"}, {"USD", "29.99"}, {"EUR", "12.49"}} {
		c.createPayment(map[string]any{"currency": p[0], "amount": p[1]})
	}
	c.createPayment(map[string]any{"currency": "EUR", "amount": 5.5, "title": "Число"})
	params := "from_date=2026-01-01&to_date=2026-01-31"
	type totals map[string]map[string]any
	summary := func() totals {
		var body struct{ Currencies totals }
		c.get("/api/v1/payments/summary?"+params).json(t, &body)
		return body.Currencies
	}
	s := summary()
	expect(t, "RUB total", s["RUB"]["total"], any("0.30"))
	expect(t, "USD unpaid", s["USD"]["unpaid"], any("29.99"))
	expect(t, "EUR unpaid", s["EUR"]["unpaid"], any("17.99"))
	expect(t, "RUB overdue", s["RUB"]["overdue"], any("0.00"))
	expect(t, "RUB count", s["RUB"]["count"], any(2.0))
	e.clock.Set(civil(2026, 2, 1))
	expect(t, "RUB overdue later", summary()["RUB"]["overdue"], any("0.30"))
	usd := c.get("/api/v1/payment-occurrences?" + params + "&currency=USD").list(t)
	expect(t, "usd filter", len(usd), 1)
	c.patch("/api/v1/payment-occurrences/"+id(usd[0]), map[string]any{"paid_at": "2026-01-31"})
	s = summary()
	expect(t, "USD paid", s["USD"]["paid"], any("29.99"))
	expect(t, "USD overdue", s["USD"]["overdue"], any("0.00"))
	expect(t, "reversed range", c.get("/api/v1/payments/summary?from_date=2026-02-01&to_date=2026-01-01").status, 422)
	expect(t, "bad status", c.get("/api/v1/payment-occurrences?status=lost").status, 422)
	expect(t, "status filter", len(c.get("/api/v1/payment-occurrences?status=paid").list(t)), 1)
	if len(c.get("/api/v1/payment-occurrences?search="+url.QueryEscape("АРЕНДА")).list(t)) == 0 {
		t.Fatal("case-insensitive search found nothing")
	}
}

func TestInvalidPaymentsRejected(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for _, change := range []map[string]any{
		{"amount": "0"}, {"amount": "-1"}, {"amount": "1.001"}, {"amount": "NaN"}, {"amount": "1e30"}, {"amount": 1e30},
		{"currency": "BTC"}, {"frequency": "weekly"}, {"title": "  "}, {"first_due_date": "2026-02-30"}, {"first_due_date": "1900-01-01"},
		{"title": nil}, {"extra": 1},
	} {
		payload := map[string]any{"title": "Test", "amount": "10.00", "currency": "RUB", "first_due_date": "2026-01-31"}
		for k, v := range change {
			payload[k] = v
		}
		expect(t, fmt.Sprint(change), c.post("/api/v1/recurring-payments", payload).status, 422)
	}
	expect(t, "missing fields", c.post("/api/v1/recurring-payments", map[string]any{"title": "x"}).status, 422)
	expect(t, "not json", c.do("POST", "/api/v1/recurring-payments", "plain").status, 422)
}

func TestArchiveAndRestartPreserveHistory(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	c.patch("/api/v1/payment-occurrences/"+id(item), map[string]any{"paid_at": "2026-01-27"})
	before := c.get("/api/v1/payment-occurrences").list(t)
	expect(t, "archive", c.delete("/api/v1/recurring-payments/"+id(payment)).status, 204)
	expect(t, "archive is idempotent", c.delete("/api/v1/recurring-payments/"+id(payment)).status, 204)
	expect(t, "missing", c.delete("/api/v1/recurring-payments/999").status, 404)
	e.clock.Set(civil(2027, 1, 1))
	e.start()
	restarted := e.client()
	restarted.signIn()
	after := restarted.get("/api/v1/payment-occurrences").list(t)
	expect(t, "no new periods", len(after), len(before))
	expect(t, "paid kept", after[0]["paid_at"], any("2026-01-27"))
	expect(t, "inactive", after[0]["active"], any(false))
	expect(t, "recurring archived", restarted.get("/api/v1/recurring-payments").list(t)[0]["active"], any(false))
	expect(t, "exclude archived", len(restarted.get("/api/v1/payment-occurrences?include_archived=false").list(t)), 0)
}

func TestExistingSessionSurvivesRestart(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	cookies := c.http.Jar.Cookies(mustURL(e.http.URL))
	e.start()
	restarted := e.client()
	restarted.http.Jar.SetCookies(mustURL(e.http.URL), cookies)
	expect(t, "session", restarted.get("/api/v1/auth/me").status, 200)
}

func TestAdminSessionRevokedWhenPasswordChanges(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	e.settings.AdminPassword = "Another-Admin-Pass1!"
	expect(t, "fingerprint", c.get("/api/v1/auth/me").status, 401)
}

func mustURL(raw string) *url.URL {
	u, _ := url.Parse(raw)
	return u
}

func TestSwaggerIsLocalAndOpenAPIIsServed(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	html := string(c.get("/api/v1/docs").body)
	if !strings.Contains(html, "/swagger-assets/swagger-ui-bundle.js") || strings.Contains(html, "cdn.jsdelivr") {
		t.Fatal("swagger page must use local assets")
	}
	expect(t, "bundle", c.get("/swagger-assets/swagger-ui-bundle.js").status, 200)
	var spec struct{ Paths map[string]any }
	c.get("/api/v1/openapi.json").json(t, &spec)
	for _, path := range []string{"/api/v1/auth/login", "/api/v1/auth/me", "/api/v1/auth/logout", "/api/v1/recurring-payments",
		"/api/v1/payment-occurrences", "/api/v1/payments/summary", "/api/v1/users"} {
		if _, ok := spec.Paths[path]; !ok {
			t.Fatalf("spec lacks %s", path)
		}
	}
}

func TestLoginThrottleAndPasswordNotEchoed(t *testing.T) {
	e := setup(t)
	c := e.client()
	password := strings.Repeat("x", 130)
	r := c.post("/api/v1/auth/login", map[string]any{"username": "admin", "password": password})
	expect(t, "too long", r.status, 422)
	if strings.Contains(string(r.body), password) {
		t.Fatal("password echoed")
	}
	for range 10 {
		expect(t, "failure", c.post("/api/v1/auth/login", map[string]any{"username": "missing", "password": "wrong"}).status, 401)
	}
	limited := c.post("/api/v1/auth/login", map[string]any{"username": "different", "password": "wrong"})
	expect(t, "ip limited", limited.status, 429)
	if limited.header.Get("Retry-After") == "" {
		t.Fatal("Retry-After missing")
	}
}

func TestConcurrentReadsCreateNoDuplicatePeriods(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	e.clock.Set(civil(2026, 5, 1))
	var wg sync.WaitGroup
	results := make([]response, 12)
	for i := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = c.get("/api/v1/payment-occurrences")
		}()
	}
	wg.Wait()
	for _, r := range results {
		expect(t, "status", r.status, 200)
	}
	rows := results[len(results)-1].list(t)
	seen := map[string]bool{}
	for _, row := range rows {
		seen[fmt.Sprint(row["recurring_payment_id"], row["due_date"])] = true
	}
	expect(t, "unique periods", len(seen), len(rows))
	expect(t, "count", len(rows), 6) // Jan..Jun: through the end of next month
}

func TestPasswordHashFormatIsStable(t *testing.T) {
	// A hash stored by an earlier release must keep verifying after upgrades.
	legacy := "scrypt$00112233445566778899aabbccddeeff$deeacfbd6fcad6b2e04266a871985b33ad33f3912581d90869f86daf8ae5c4ddc6af25827122b9bc3e2c08c64f29165400b9a4842b621d86e66f738ae51bc787"
	expect(t, "legacy hash", verifyPassword("Stored-earlier-1!", legacy), true)
	expect(t, "wrong password", verifyPassword("other", legacy), false)
	expect(t, "round trip", verifyPassword("Fresh-pass-123!", hashPassword("Fresh-pass-123!")), true)
}

func TestPanelPagesAndAssets(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	page := c.get("/calendar")
	expect(t, "calendar", page.status, 200)
	expect(t, "signed-in user skips login", c.get("/login").status, 303)
	scripts := regexp.MustCompile(`src="(/_next/static/[^"]+\.js)"`).FindAllStringSubmatch(string(page.body), -1)
	if len(scripts) == 0 {
		t.Fatal("no Next.js chunks in the page")
	}
	asset := c.get(scripts[0][1])
	expect(t, "chunk", asset.status, 200)
	expect(t, "immutable cache", asset.header.Get("Cache-Control"), "public, max-age=31536000, immutable")
	expect(t, "pages are not cached", page.header.Get("Cache-Control"), "no-store")
}

func TestOpenAPIDocumentsEveryRoute(t *testing.T) {
	e := setup(t)
	raw, err := fs.ReadFile(invoicekeeper.Assets, "docs/openapi.json")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]any `json:"paths"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	documented := map[string]bool{}
	for path, operations := range spec.Paths {
		for method := range operations {
			documented[strings.ToUpper(method)+" "+path] = true
		}
	}
	for _, r := range e.server.apiRoutes() {
		if !documented[r.pattern] {
			t.Errorf("route %s is missing from docs/openapi.json", r.pattern)
		}
		delete(documented, r.pattern)
	}
	for operation := range documented {
		t.Errorf("docs/openapi.json documents %s, but the server has no such route", operation)
	}
}
