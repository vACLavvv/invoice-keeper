package app

import (
	"net/url"
	"testing"

	"invoice-keeper/internal/app/config"
)

func TestBehindReverseProxy(t *testing.T) {
	e := setup(t)
	proxies, _ := config.ParseProxies("127.0.0.1, 10.0.0.0/8")
	e.settings.PublicBaseURL, e.settings.TrustedProxies = "https://keeper.example.ru", proxies
	e.start() // restart with the proxy settings

	c := e.client()
	login := map[string]any{"username": "admin", "password": testPassword}
	// The proxy talks to the app as 127.0.0.1:port, so the Host header no longer proves anything.
	expect(t, "origin of the internal address", c.do("POST", "/api/v1/auth/login", login).status, 403)
	expect(t, "other site", c.do("POST", "/api/v1/auth/login", login, "Origin", "https://evil.example").status, 403)
	expect(t, "public address", c.do("POST", "/api/v1/auth/login", login, "Origin", "https://keeper.example.ru",
		"X-Forwarded-For", "6.6.6.6, 198.51.100.7, 10.1.2.3").status, 200)

	sessions := c.get("/api/v1/me/sessions").list(t)
	// 10.1.2.3 is our own proxy; 6.6.6.6 was written by the client and is not believed.
	expect(t, "client address from the proxy", sessions[0]["ip"], any("198.51.100.7"))
}

func TestRequestLogHidesSecrets(t *testing.T) {
	got, _ := url.ParseQuery(safeQuery(url.Values{"from_date": {"2026-01-01"}, "token": {"ik_secret"}, "next": {"/budget"}}))
	expect(t, "filter kept", got.Get("from_date"), "2026-01-01")
	expect(t, "token hidden", got.Get("token"), "***")
	expect(t, "unknown hidden", got.Get("next"), "***")
	expect(t, "empty", safeQuery(nil), "")
}
