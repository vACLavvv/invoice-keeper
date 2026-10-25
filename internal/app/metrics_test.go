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

func TestMetricsBusinessGaugesAndAPIEndpoint(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	e.settings.MetricsToken = strings.Repeat("m", 40)
	create := func(title, amount, currency, date string) int64 {
		item := c.createPayment(map[string]any{"title": title, "amount": amount, "currency": currency, "first_due_date": date, "frequency": "once"})
		return int64(item["id"].(float64))
	}
	create("due-rub", "12.34", "RUB", "2026-01-27")
	create("due-usd", "7.50", "USD", "2026-01-20")
	create("future-eur", "5.00", "EUR", "2026-01-29")
	paid := create("paid", "9.00", "RUB", "2026-01-20")
	archived := create("archived", "4.00", "USD", "2026-01-20")
	removed := create("removed", "5.00", "EUR", "2026-01-20")
	if _, err := e.db.Exec("UPDATE payment_occurrences SET paid_at='2026-01-20' WHERE recurring_payment_id=?", paid); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec("UPDATE recurring_payments SET active=0 WHERE id=?", archived); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec("UPDATE recurring_payments SET removed_at='2026-01-20T00:00:00Z' WHERE id=?", removed); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/metrics", "/api/v1/metrics"} {
		expect(t, "cookie cannot scrape", c.get(path).status, 401)
		res := c.do("GET", path, nil, "Authorization", "Bearer "+e.settings.MetricsToken)
		expect(t, "scrape", res.status, 200)
		for _, want := range []string{`keeper_overdue_payments{currency="RUB"} 1`, `keeper_overdue_payments{currency="USD"} 1`, `keeper_overdue_payments{currency="EUR"} 0`, `keeper_overdue_amount{currency="RUB"} 12.34`, `keeper_overdue_amount{currency="USD"} 7.50`, `keeper_overdue_amount{currency="EUR"} 0.00`, `keeper_open_payments{currency="EUR"} 1`, `keeper_worker_uptime_seconds 0`} {
			if !strings.Contains(string(res.body), want+"\n") {
				t.Fatalf("missing %s in %s", want, res.body)
			}
		}
	}
}
