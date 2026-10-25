package app

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/security"
)

// keyClient sends requests with an API key and no cookies, the way the extension popup does.
func (e *harness) keyClient(token string) *client {
	c := e.client()
	c.http.Jar = nil
	c.token = token
	return c
}

func (c *client) createKey(name string) string {
	c.e.t.Helper()
	r := c.post("/api/v1/api-keys", map[string]any{"name": name})
	if r.status != 201 {
		c.e.t.Fatalf("create key: %d %s", r.status, r.body)
	}
	return r.object(c.e.t)["token"].(string)
}

func suggestionBody(values map[string]any) map[string]any {
	body := map[string]any{"source_key": "aeza.net:single-red", "source_url": "https://my.aeza.net/services",
		"title": "aeza · single-red", "amount": "9.89", "currency": "EUR", "next_due_date": "2026-02-25"}
	for k, v := range values {
		body[k] = v
	}
	return body
}

func TestAPIKeysAreOwnedAndShownOnce(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")

	token := user.createKey("Chrome")
	if !strings.HasPrefix(token, "ik_") {
		t.Fatalf("token format: %s", token)
	}
	keys := user.get("/api/v1/api-keys").list(t)
	expect(t, "own keys", len(keys), 1)
	if _, leaked := keys[0]["token"]; leaked {
		t.Fatal("token listed after creation")
	}
	expect(t, "admin does not see user's keys", len(admin.get("/api/v1/api-keys").list(t)), 0)
	expect(t, "admin cannot delete user's key", admin.delete("/api/v1/api-keys/"+id(keys[0])).status, 404)
	var stored string
	e.db.QueryRow("SELECT token_hash FROM api_keys").Scan(&stored)
	expect(t, "only the hash is stored", stored, security.Digest(token))

	user.csrf = ""
	expect(t, "csrf required", user.post("/api/v1/api-keys", map[string]any{"name": "x"}).status, 403)
	expect(t, "anonymous", e.client().get("/api/v1/api-keys").status, 401)
}

func TestAPIKeyGrantsOnlyExtensionEndpoints(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	ext := e.keyClient(admin.createKey("Edge"))

	me := ext.get("/api/v1/extension/whoami")
	expect(t, "whoami", me.status, 200)
	expect(t, "owner", me.object(t)["role"], any("admin"))
	// The same key must not open anything else, even for the admin: it is recognized, but not allowed.
	for _, path := range []string{"/api/v1/auth/me", "/api/v1/payment-occurrences", "/api/v1/users", "/api/v1/payment-suggestions", "/api/v1/api-keys"} {
		expect(t, path, ext.get(path).status, 403)
	}
	expect(t, "create payment", ext.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}).status, 403)
	expect(t, "bad key", e.keyClient("ik_nope").get("/api/v1/extension/whoami").status, 401)
	expect(t, "cookie is not a key", admin.get("/api/v1/extension/whoami").status, 401)

	keys := admin.get("/api/v1/api-keys").list(t)
	expect(t, "last use recorded", keys[0]["last_used_at"] != nil, true)
	expect(t, "revoke", admin.delete("/api/v1/api-keys/"+id(keys[0])).status, 204)
	expect(t, "revoked key", ext.get("/api/v1/extension/whoami").status, 401)
}

func TestKeysDieWithTheirOwner(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	created := admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"}).object(t)
	user := e.client()
	user.signIn("alex", "User-password123!")
	userKey := e.keyClient(user.createKey("Chrome"))
	adminKey := e.keyClient(admin.createKey("Edge"))

	admin.delete("/api/v1/users/" + id(created))
	expect(t, "deleted user's key", userKey.get("/api/v1/extension/whoami").status, 401)
	e.settings.AdminPassword = "Another-Owner-Pass1!"
	expect(t, "admin key after password change", adminKey.get("/api/v1/extension/whoami").status, 401)
}

func TestSuggestionsDeduplicateAndRespectDecisions(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	ext := e.keyClient(user.createKey("Chrome"))

	first := ext.post("/api/v1/payment-suggestions", suggestionBody(nil))
	expect(t, "created", first.status, 201)
	expect(t, "result", first.object(t)["result"], any("created"))
	again := ext.post("/api/v1/payment-suggestions", suggestionBody(map[string]any{"amount": "10.49", "next_due_date": "2026-03-25"}))
	expect(t, "same source updates", again.status, 200)
	var answer struct {
		Result     string
		Suggestion map[string]any
	}
	again.json(t, &answer)
	expect(t, "updated", answer.Result, "updated")
	expect(t, "new price", answer.Suggestion["amount"], any("10.49"))

	pending := admin.get("/api/v1/payment-suggestions?status=pending").list(t)
	expect(t, "one suggestion", len(pending), 1)
	expect(t, "submitted by", pending[0]["submitted_by"], any("alex"))
	expect(t, "user cannot list", user.get("/api/v1/payment-suggestions").status, 403)
	expect(t, "user cannot accept", user.post("/api/v1/payment-suggestions/"+id(pending[0])+"/accept", nil).status, 403)

	expect(t, "reject", admin.post("/api/v1/payment-suggestions/"+id(pending[0])+"/reject", nil).status, 200)
	resent := ext.post("/api/v1/payment-suggestions", suggestionBody(nil))
	resent.json(t, &answer)
	expect(t, "rejected stays rejected", answer.Result+"/"+answer.Suggestion["status"].(string), "unchanged/rejected")
	expect(t, "decided twice", admin.post("/api/v1/payment-suggestions/"+id(pending[0])+"/accept", nil).status, 409)
	expect(t, "no payment created", len(admin.get("/api/v1/recurring-payments").list(t)), 0)
}

func TestAcceptedSuggestionBecomesPaymentAndReminds(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	ext := e.keyClient(admin.createKey("Edge"))
	sent := &recorder{}
	e.server.Worker.Settings = enabledSettings(e)
	e.server.Worker.Sender = sent.sender(notify.SendResult{State: "sent", MessageID: "1"})

	created := ext.post("/api/v1/payment-suggestions", suggestionBody(map[string]any{"next_due_date": "2026-01-30"})).object(t)
	sg := created["suggestion"].(map[string]any)
	accepted := admin.post("/api/v1/payment-suggestions/"+id(sg)+"/accept", map[string]any{"title": "Сервер single-red"})
	expect(t, "accept", accepted.status, 200)
	result := accepted.object(t)
	expect(t, "status", result["status"], any("accepted"))
	if result["recurring_payment_id"] == nil {
		t.Fatal("no payment linked")
	}
	payments := admin.get("/api/v1/recurring-payments").list(t)
	expect(t, "payment", len(payments), 1)
	expect(t, "corrected title", payments[0]["title"], any("Сервер single-red"))
	expect(t, "amount from suggestion", payments[0]["amount"], any("9.89"))
	expect(t, "due in 2 days → reminded at once", sent.count(), 1)

	resent := ext.post("/api/v1/payment-suggestions", suggestionBody(nil)).object(t)
	expect(t, "accepted is not recreated", resent["result"], any("unchanged"))
	expect(t, "still one payment", len(admin.get("/api/v1/recurring-payments").list(t)), 1)
}

func TestSuggestionValidationAndCORS(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	ext := e.keyClient(admin.createKey("Edge"))
	for _, change := range []map[string]any{
		{"amount": "0"}, {"currency": "BTC"}, {"next_due_date": "2026-02-30"}, {"title": " "}, {"source_key": ""},
		{"source_url": "javascript:alert(1)"}, {"role": "admin"},
	} {
		expect(t, "invalid", ext.post("/api/v1/payment-suggestions", suggestionBody(change)).status, 422)
	}
	preflight := ext.do("OPTIONS", "/api/v1/payment-suggestions", nil, "Origin", "chrome-extension://abc", "Access-Control-Request-Method", "POST")
	expect(t, "preflight", preflight.status, 204)
	expect(t, "allow origin", preflight.header.Get("Access-Control-Allow-Origin"), "*")
	if !strings.Contains(preflight.header.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatal("Authorization header not allowed")
	}
	expect(t, "no credentials", preflight.header.Get("Access-Control-Allow-Credentials"), "")
	expect(t, "cookie API has no CORS", admin.get("/api/v1/auth/me").header.Get("Access-Control-Allow-Origin"), "")
}

func TestExtensionZipContainsManifest(t *testing.T) {
	e := setup(t)
	expect(t, "anonymous goes to login", e.client().get("/extension.zip").status, 303)
	c := e.client()
	c.signIn()
	r := c.get("/extension.zip")
	expect(t, "zip", r.status, 200)
	archive, err := zip.NewReader(bytes.NewReader(r.body), int64(len(r.body)))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range archive.File {
		names[f.Name] = true
	}
	for _, want := range []string{"manifest.json", "popup.html", "popup.js", "detect.js", "config.js", "icons/icon-128.png"} {
		if !names["invoice-keeper-extension/"+want] {
			t.Fatalf("zip lacks %s", want)
		}
	}
	for _, f := range archive.File {
		if f.Name != "invoice-keeper-extension/config.js" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		config, _ := io.ReadAll(rc)
		rc.Close()
		// The test server has no PUBLIC_BASE_URL, so the address comes from the request.
		if !strings.Contains(string(config), `self.INVOICE_KEEPER_SERVER = "http://`) {
			t.Fatalf("config.js does not point at the server: %s", config)
		}
	}
}

func TestExtensionConfigUsesPublicBaseURL(t *testing.T) {
	got := string(extensionConfig("https://keeper.example.ru"))
	if !strings.Contains(got, `self.INVOICE_KEEPER_SERVER = "https://keeper.example.ru";`) {
		t.Fatalf("unexpected config.js: %s", got)
	}
}

func TestSuggestionCarriesFrequencyAssigneeLinkAndWallet(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	alex := admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"}).object(t)
	ext := e.keyClient(admin.createKey("Chrome"))

	team := ext.get("/api/v1/extension/whoami").object(t)["team"].([]any)
	expect(t, "team for the popup", len(team), 1)
	expect(t, "team member", team[0].(map[string]any)["username"], any("alex"))

	bad := ext.post("/api/v1/payment-suggestions", suggestionBody(map[string]any{"assignee_id": 999}))
	expect(t, "unknown assignee", bad.status, 422)
	bad = ext.post("/api/v1/payment-suggestions", suggestionBody(map[string]any{"wallet_network": "TRON", "wallet_address": "nope"}))
	expect(t, "bad wallet", bad.status, 422)

	created := ext.post("/api/v1/payment-suggestions", suggestionBody(map[string]any{
		"frequency": "yearly", "assignee_id": alex["id"], "payment_url": "https://my.aeza.net/billing",
		"wallet_network": "TRON", "wallet_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
	})).object(t)["suggestion"].(map[string]any)
	expect(t, "frequency", created["frequency"], any("yearly"))
	expect(t, "assignee", created["assignee"].(map[string]any)["username"], any("alex"))
	expect(t, "wallet", created["wallet"].(map[string]any)["address"], any("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"))

	// The admin keeps the proposed frequency and wallet but unassigns the payment.
	admin.post("/api/v1/payment-suggestions/"+id(created)+"/accept", map[string]any{"assignee_id": nil})
	payment := admin.get("/api/v1/recurring-payments").list(t)[0]
	expect(t, "payment frequency", payment["frequency"], any("yearly"))
	expect(t, "payment link", payment["payment_url"], any("https://my.aeza.net/billing"))
	expect(t, "payment wallet", payment["wallet"].(map[string]any)["network"], any("TRON"))
	expect(t, "assignee cleared", payment["assignee"], nil)
}
