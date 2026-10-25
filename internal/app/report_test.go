package app

import (
	"context"
	"fmt"
	"testing"
	"time"

	"invoice-keeper/internal/app/report"
	"invoice-keeper/internal/app/schedule"
)

func TestMonthlyReportMatchesBudgetAcrossLifecycle(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	rent := c.createPayment(map[string]any{"title": "Офис", "amount": "100.10", "category": "Офис"})
	quarterly := c.createPayment(map[string]any{"title": "Лицензии", "amount": "25.99", "currency": "USD", "frequency": "quarterly", "category": "IT"})
	c.createPayment(map[string]any{"title": "Домен", "amount": "15.01", "currency": "EUR", "frequency": "yearly", "first_due_date": "2026-06-01"})
	c.createPayment(map[string]any{"title": "Аудит", "amount": "80.08", "currency": "EUR", "frequency": "once", "first_due_date": "2026-08-01"})
	archived := c.createPayment(map[string]any{"title": "Архив", "amount": "4.04", "category": "Архив"})
	removed := c.createPayment(map[string]any{"title": "Удалённое", "amount": "999.99"})
	expect(t, "archive", c.delete("/api/v1/recurring-payments/"+id(archived)).status, 204)
	expect(t, "remove", c.delete("/api/v1/recurring-payments/"+id(removed)+"?mode=delete").status, 204)
	rentBase := "/api/v1/recurring-payments/" + id(rent)
	prepaid := c.post(rentBase+"/periods", map[string]any{"due_date": "2026-04-30", "paid_at": "2026-01-28"})
	expect(t, "pay future period", prepaid.status, 201)
	expect(t, "pause leaves paid history", c.post(rentBase+"/pause", map[string]any{"until": "2026-05-31"}).status, 200)
	expect(t, "delete forecast occurrence", c.delete("/api/v1/recurring-payments/"+id(quarterly)+"/periods/2026-07-31").status, 204)
	// A recorded paid period keeps the old amount; a future projection uses the edited amount.
	expect(t, "change rent", c.patch(rentBase, map[string]any{"amount": "130.25"}).status, 200)
	backend := botBackend{e.server}
	var annual struct {
		Months []struct {
			Month      string
			Currencies map[string]budgetLine
		}
	}
	c.get("/api/v1/budget?year=2026").json(t, &annual)
	for _, month := range annual.Months {
		for _, currency := range []string{"RUB", "USD", "EUR"} {
			data, err := backend.MonthlyReport(context.Background(), month.Month, currency)
			if err != nil {
				t.Fatal(err)
			}
			want := month.Currencies[currency]
			if schedule.Money(data.Planned) != want.Planned || schedule.Money(data.Paid) != want.Paid || schedule.Money(data.Planned-data.Paid) != want.Remaining {
				t.Fatalf("%s %s report=%+v web=%+v", month.Month, currency, data, want)
			}
			var planned, paid int64
			for _, category := range data.Categories {
				planned += category.Planned
				paid += category.Paid
			}
			if planned != data.Planned || paid != data.Paid {
				t.Fatal("categories mismatch")
			}
		}
	}
	for _, tc := range []struct {
		month, currency string
		planned, paid   int64
	}{
		{"2026-04", "RUB", 10010, 10010}, // paid period survives pause and edit
		{"2026-05", "RUB", 0, 0},         // pause suppresses forecast
		{"2026-06", "RUB", 13025, 0},     // current plan amount
		{"2026-07", "USD", 0, 0},         // deleted forecast stays deleted
		{"2026-06", "EUR", 1501, 0},      // yearly
		{"2026-08", "EUR", 8008, 0},      // once
		{"2026-09", "EUR", 0, 0},
		{"2026-01", "RUB", 404, 0}, // archived occurrence retained; removed payment omitted
	} {
		data, err := backend.MonthlyReport(context.Background(), tc.month, tc.currency)
		if err != nil {
			t.Fatal(err)
		}
		expect(t, tc.month+tc.currency+" planned", data.Planned, tc.planned)
		expect(t, "paid", data.Paid, tc.paid)
	}
	// A subsequent payment is immediately reflected; no report data cache can hide it.
	before, err := backend.MonthlyReport(context.Background(), "2026-04", "RUB")
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "unmark", c.patch("/api/v1/payment-occurrences/"+id(prepaid.object(t)), map[string]any{"paid": false}).status, 200)
	after, err := backend.MonthlyReport(context.Background(), "2026-04", "RUB")
	if err != nil {
		t.Fatal(err)
	}
	if after.Paid != 0 || after.Revision <= before.Revision {
		t.Fatalf("stale report before=%+v after=%+v", before, after)
	}
}

func TestMonthlyReportDateZoneValidationAndCancellation(t *testing.T) {
	e := setup(t)
	e.settings.Timezone = "Asia/Vladivostok"
	if err := e.settings.Validate(); err != nil {
		t.Fatal(err)
	}
	e.server.Now = func() time.Time { return time.Date(2026, 12, 31, 18, 30, 45, 0, time.UTC) }
	e.clock.Set(schedule.Civil(2027, 1, 1))
	backend := botBackend{e.server}
	data, err := backend.MonthlyReport(context.Background(), "2027-01", "EUR")
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "timezone", data.Timezone, "Asia/Vladivostok")
	expect(t, "timestamp", data.GeneratedAt.Format(time.RFC3339), "2027-01-01T04:30:00+10:00")
	expect(t, "business day", data.Today, "2027-01-01")
	if data.Planned != 0 || data.Paid != 0 || len(data.Categories) != 0 {
		t.Fatal("empty report is not empty")
	}
	if _, err := report.Render(data); err != nil {
		t.Fatal(err)
	}
	for _, selection := range [][2]string{{"2026-13", "RUB"}, {"2101-01", "RUB"}, {"1999-12", "RUB"}, {"2026-01", "BTC"}} {
		if _, err := backend.MonthlyReport(context.Background(), selection[0], selection[1]); err == nil {
			t.Fatal(fmt.Sprint(selection))
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := backend.MonthlyReport(ctx, "2026-01", "RUB"); err == nil {
		t.Fatal("cancelled read was not cancelled")
	}
}
