package app

import (
	"testing"
)

func (c *client) createToken(access string, days any) string {
	c.e.t.Helper()
	r := c.post("/api/v1/api-keys", map[string]any{"name": "скрипт", "access": access, "expires_in_days": days})
	if r.status != 201 {
		c.e.t.Fatalf("create token: %d %s", r.status, r.body)
	}
	return r.object(c.e.t)["token"].(string)
}

func TestAPITokensReadAndWrite(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)

	reader := e.keyClient(admin.createToken("read", 30))
	expect(t, "read list", reader.get("/api/v1/payment-occurrences").status, 200)
	expect(t, "read summary", reader.get("/api/v1/payments/summary").status, 200)
	expect(t, "read cannot write", reader.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31"}).status, 403)

	writer := e.keyClient(admin.createToken("write", nil))
	created := writer.post("/api/v1/recurring-payments", map[string]any{"title": "Сервер", "amount": "24", "currency": "USD", "first_due_date": "2026-02-10"})
	expect(t, "write without CSRF", created.status, 201)
	audit := admin.get("/api/v1/audit-log").list(t)
	expect(t, "acts as the owner", audit[0]["actor"], any("admin"))

	// Account settings stay in the panel: a leaked token cannot mint tokens or lock the owner out.
	for _, check := range []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/v1/api-keys", nil},
		{"POST", "/api/v1/api-keys", map[string]any{"name": "ещё"}},
		{"GET", "/api/v1/me/sessions", nil},
		{"DELETE", "/api/v1/me/sessions", nil},
		{"POST", "/api/v1/auth/2fa/setup", nil},
		{"GET", "/api/v1/me/telegram", nil},
		{"POST", "/api/v1/auth/logout", nil},
	} {
		expect(t, check.method+" "+check.path, writer.do(check.method, check.path, check.body).status, 403)
	}

	keys := admin.get("/api/v1/api-keys").list(t)
	expect(t, "access listed", keys[0]["access"], any("write"))
	expect(t, "no expiry", keys[0]["expires_at"], nil)
	expect(t, "expiry listed", keys[1]["expires_at"] != nil, true)

	e.db.Exec("UPDATE api_keys SET expires_at=1 WHERE access='read'")
	expect(t, "expired", reader.get("/api/v1/payment-occurrences").status, 401)

	expect(t, "bad access", admin.post("/api/v1/api-keys", map[string]any{"name": "x", "access": "admin"}).status, 422)
	expect(t, "bad expiry", admin.post("/api/v1/api-keys", map[string]any{"name": "x", "expires_in_days": 7}).status, 422)

	// A regular user's token has a regular user's rights.
	admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	userToken := e.keyClient(user.createToken("write", 90))
	expect(t, "user token reads", userToken.get("/api/v1/payment-occurrences").status, 200)
	expect(t, "user token is not admin", userToken.get("/api/v1/users").status, 403)
	// A write token also works for the extension.
	expect(t, "extension endpoint", userToken.get("/api/v1/extension/whoami").status, 200)
}

func TestSessionsListAndRevoke(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	laptop, phone := e.client(), e.client()
	laptop.signIn("alex", "User-password123!")
	phone.do("POST", "/api/v1/auth/login", map[string]any{"username": "alex", "password": "User-password123!"}, "User-Agent", "Phone/1.0")
	phone.csrf = phone.get("/api/v1/auth/me").object(t)["csrf_token"].(string)

	sessions := laptop.get("/api/v1/me/sessions").list(t)
	expect(t, "own sessions only", len(sessions), 2)
	var current, other map[string]any
	for _, s := range sessions {
		if s["current"].(bool) {
			current = s
		} else {
			other = s
		}
	}
	expect(t, "device", other["user_agent"], any("Phone/1.0"))
	expect(t, "address", other["ip"], any("127.0.0.1"))
	expect(t, "admin sees own", len(admin.get("/api/v1/me/sessions").list(t)), 1)

	expect(t, "cannot end current here", laptop.delete("/api/v1/me/sessions/"+current["id"].(string)).status, 409)
	expect(t, "foreign session", admin.delete("/api/v1/me/sessions/"+other["id"].(string)).status, 404)
	expect(t, "end phone", laptop.delete("/api/v1/me/sessions/"+other["id"].(string)).status, 204)
	expect(t, "phone signed out", phone.get("/api/v1/auth/me").status, 401)

	phone.signIn("alex", "User-password123!")
	closed := laptop.do("DELETE", "/api/v1/me/sessions", nil)
	expect(t, "others closed", closed.object(t)["closed"], any(1.0))
	expect(t, "phone signed out again", phone.get("/api/v1/auth/me").status, 401)
	expect(t, "laptop stays", laptop.get("/api/v1/auth/me").status, 200)
}
