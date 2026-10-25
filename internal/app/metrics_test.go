package app

import (
	"strings"
	"testing"
)

func TestMetricsIndependentCredentialAndNoBusinessData(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "Private payment title"})
	expect(t, "disabled", c.get("/metrics").status, 404)
	e.settings.MetricsToken = strings.Repeat("x", 40)
	expect(t, "cookie is not scrape authorization", c.get("/metrics").status, 401)
	expect(t, "wrong token", c.do("GET", "/metrics", nil, "Authorization", "Bearer wrong").status, 401)
	e.server.Worker.Tick()
	response := c.do("GET", "/metrics", nil, "Authorization", "Bearer "+e.settings.MetricsToken)
	expect(t, "scrape", response.status, 200)
	body := string(response.body)
	for _, secret := range []string{e.settings.MetricsToken, e.settings.AdminUsername, "Private payment title", "@"} {
		if strings.Contains(body, secret) {
			t.Fatalf("metrics leaked %q", secret)
		}
	}
	for _, name := range []string{"keeper_scheduler_last_success_timestamp_seconds", "keeper_http_request_duration_seconds_bucket", "keeper_deliveries{channel=\"email\",state=\"pending\"}"} {
		if !strings.Contains(body, name) {
			t.Fatalf("missing metric %s", name)
		}
	}
	last, errors := e.server.Worker.Health()
	if last <= 0 || errors != 0 {
		t.Fatalf("bad scheduler health %d %d", last, errors)
	}
}
