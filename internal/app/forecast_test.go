package app

import (
	"testing"

	"invoice-keeper/internal/app/schedule"
)

func TestPayAheadFromForecast(t *testing.T) {
	e := setup(t) // today is 2026-01-28: periods exist through the end of February
	admin := e.client()
	admin.signIn()
	rent := admin.createPayment(nil) // monthly from 2026-01-31
	once := admin.createPayment(map[string]any{"title": "Аудит", "first_due_date": "2026-05-15", "frequency": "once"})
	periods := "/api/v1/recurring-payments/" + id(rent) + "/periods"

	forecast := admin.get("/api/v1/payment-forecast?from_date=2026-01-01&to_date=2026-06-30").list(t)
	expect(t, "only dates without a period", dates(forecast, rent["id"]), "2026-03-31,2026-04-30,2026-05-31,2026-06-30")
	expect(t, "a one-time period already exists", dates(forecast, once["id"]), "")
	expect(t, "amount from the payment", forecast[0]["amount"], any("100.10"))

	created := admin.post(periods, map[string]any{"due_date": "2026-04-30", "paid_at": "2026-01-28"})
	expect(t, "created", created.status, 201)
	period := created.object(t)
	expect(t, "paid ahead", period["status"], any("paid"))
	expect(t, "not late", period["days_overdue"], any(0.0))
	expect(t, "audited", admin.get("/api/v1/audit-log").list(t)[0]["action"], any("occurrence.prepaid"))

	forecast = admin.get("/api/v1/payment-forecast?from_date=2026-03-01&to_date=2026-06-30").list(t)
	expect(t, "gone from the forecast", dates(forecast, rent["id"]), "2026-03-31,2026-05-31,2026-06-30")
	expect(t, "twice", admin.post(periods, map[string]any{"due_date": "2026-04-30"}).status, 409)
	expect(t, "not a scheduled date", admin.post(periods, map[string]any{"due_date": "2026-04-15"}).status, 422)
	expect(t, "in the past", admin.post(periods, map[string]any{"due_date": "2026-01-01"}).status, 422)
	expect(t, "paid in the future", admin.post(periods, map[string]any{"due_date": "2026-05-31", "paid_at": "2026-02-01"}).status, 422)
	expect(t, "too far", admin.post(periods, map[string]any{"due_date": "2029-03-31"}).status, 422)
	expect(t, "range required", admin.get("/api/v1/payment-forecast?from_date=2026-03-01").status, 422)
	expect(t, "range too long", admin.get("/api/v1/payment-forecast?from_date=2026-01-01&to_date=2027-06-01").status, 422)
	expect(t, "unknown payment", admin.post("/api/v1/recurring-payments/999/periods", map[string]any{"due_date": "2026-04-30"}).status, 404)

	unpaid := admin.post(periods, map[string]any{"due_date": "2026-06-30"})
	expect(t, "created unpaid", unpaid.object(t)["status"], any("unpaid"))

	reader := e.keyClient(admin.createToken("read", 30))
	expect(t, "read token sees the forecast", reader.get("/api/v1/payment-forecast?from_date=2026-03-01&to_date=2026-03-31").status, 200)
	expect(t, "read token cannot create", reader.post(periods, map[string]any{"due_date": "2026-05-31"}).status, 403)

	// When the date comes, the scheduler keeps the early period instead of adding a second one.
	e.clock.Set(schedule.Civil(2026, 4, 1))
	items := admin.get("/api/v1/payment-occurrences?from_date=2026-04-01&to_date=2026-06-30").list(t)
	expect(t, "no duplicate", dates(items, rent["id"]), "2026-04-30,2026-05-31,2026-06-30")
	expect(t, "still paid", items[0]["status"], any("paid"))

	// A pause removes unpaid periods and blocks new ones, but keeps what was paid ahead.
	expect(t, "pause", admin.post("/api/v1/recurring-payments/"+id(rent)+"/pause", map[string]any{"until": "2026-05-31"}).status, 200)
	items = admin.get("/api/v1/payment-occurrences?from_date=2026-04-01&to_date=2026-06-30").list(t)
	expect(t, "paid period kept", dates(items, rent["id"]), "2026-04-30,2026-06-30")
	expect(t, "inside the pause", admin.post(periods, map[string]any{"due_date": "2026-05-31"}).status, 409)
	forecast = admin.get("/api/v1/payment-forecast?from_date=2026-05-01&to_date=2026-07-31").list(t)
	expect(t, "paused date not forecast", dates(forecast, rent["id"]), "2026-07-31")

	admin.do("DELETE", "/api/v1/recurring-payments/"+id(rent), nil)
	expect(t, "archived", admin.post(periods, map[string]any{"due_date": "2026-07-31"}).status, 409)
	expect(t, "archived not forecast", dates(admin.get("/api/v1/payment-forecast?from_date=2026-07-01&to_date=2026-07-31").list(t), rent["id"]), "")
}
