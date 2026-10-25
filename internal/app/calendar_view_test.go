package app

import (
	"fmt"
	"testing"
)

func TestCalendarBoundedPreviewAndDayPaging(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for i := 0; i < 8; i++ {
		c.createPayment(map[string]any{"title": fmt.Sprintf("Аренда %d", i), "amount": "10.01"})
	}
	for _, month := range []string{"2026-01", "2026-03"} {
		response := c.get("/api/v1/payments/calendar?month=" + month)
		expect(t, "calendar status", response.status, 200)
		var result struct {
			Days   []calendarDay
			Totals map[string]string
		}
		response.json(t, &result)
		expect(t, "one date", len(result.Days), 1)
		expect(t, "full count", result.Days[0].Count, 8)
		expect(t, "bounded preview", len(result.Days[0].Items), 3)
		expect(t, "all amounts", result.Totals["RUB"], "80.08")
		seen := map[string]bool{}
		for page := 1; page <= 3; page++ {
			r := c.get(fmt.Sprintf("/api/v1/payments/calendar/day?date=%s-31&page=%d&page_size=3", month, page))
			expect(t, "day status", r.status, 200)
			var data struct {
				Items        []map[string]any
				Total, Pages int
			}
			r.json(t, &data)
			expect(t, "day total", data.Total, 8)
			expect(t, "day pages", data.Pages, 3)
			for _, item := range data.Items {
				key := fmt.Sprint(item["recurring_payment_id"])
				if seen[key] {
					t.Fatal("duplicate page item")
				}
				seen[key] = true
			}
		}
		expect(t, "all reachable", len(seen), 8)
	}
	expect(t, "auth required", e.client().get("/api/v1/payments/calendar").status, 401)
	for _, path := range []string{"/api/v1/payments/calendar?month=bad", "/api/v1/payments/calendar/day", "/api/v1/payments/calendar/day?date=2026-03-31&page_size=101"} {
		expect(t, "validation", c.get(path).status, 422)
	}
}
func TestCalendarSummaryMatchesBudgetAfterHistoryChanges(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	a := c.createPayment(map[string]any{"title": "Пауза", "amount": "10.01"})
	b := c.createPayment(map[string]any{"title": "Архив", "amount": "20.02", "currency": "USD"})
	d := c.createPayment(map[string]any{"title": "Удаление", "amount": "30.03", "currency": "EUR"})
	base := "/api/v1/recurring-payments/" + id(a)
	expect(t, "prepay", c.post(base+"/periods", map[string]any{"due_date": "2026-04-30", "paid_at": "2026-01-28"}).status, 201)
	expect(t, "pause", c.post(base+"/pause", map[string]any{"until": "2026-05-31"}).status, 200)
	expect(t, "archive", c.delete("/api/v1/recurring-payments/"+id(b)).status, 204)
	expect(t, "remove period", c.delete("/api/v1/recurring-payments/"+id(d)+"/periods/2026-03-31").status, 204)
	var budget struct {
		Months []struct {
			Month      string
			Currencies map[string]budgetLine
		}
	}
	c.get("/api/v1/budget?year=2026").json(t, &budget)
	for _, month := range budget.Months {
		var calendar struct{ Totals map[string]string }
		r := c.get("/api/v1/payments/calendar?month=" + month.Month)
		expect(t, "calendar", r.status, 200)
		r.json(t, &calendar)
		for _, currency := range currencies {
			amount := calendar.Totals[currency]
			if amount == "" {
				amount = "0.00"
			}
			expect(t, month.Month+currency, amount, month.Currencies[currency].Planned)
		}
	}
}
