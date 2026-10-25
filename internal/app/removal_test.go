package app

import (
	"strings"
	"testing"

	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/schedule"
)

func TestRemovePaidPeriodAndUndo(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(nil)
	periods := c.get("/api/v1/payment-occurrences").list(t)
	period := periods[0]
	path := "/api/v1/payment-occurrences/" + id(period)
	target := "/api/v1/recurring-payments/" + id(payment) + "/periods/" + period["due_date"].(string)
	expect(t, "paid", c.patch(path, map[string]any{"paid": true, "paid_at": "2026-01-27"}).status, 200)
	expect(t, "receipt", c.upload(path+"/receipts", "check.png", pngBytes).status, 201)
	receipt := c.get(path + "/receipts").list(t)[0]
	for range 2 {
		expect(t, "delete is idempotent", c.delete(target).status, 204)
	}
	expect(t, "hidden even with archive", len(c.get("/api/v1/payment-occurrences?include_archived=true").list(t)), len(periods)-1)
	expect(t, "stale URL", c.get(path).status, 404)
	expect(t, "stale edit", c.patch(path, map[string]any{"paid": false}).status, 404)
	expect(t, "receipt hidden", c.get(path+"/receipts").status, 404)
	expect(t, "file hidden", c.get(receipt["download_url"].(string)).status, 404)
	expect(t, "retained receipt protected", c.delete("/api/v1/receipts/"+id(receipt)).status, 404)
	var budget struct{ Currencies map[string]budgetLine }
	c.get("/api/v1/budget?year=2026").json(t, &budget)
	expect(t, "removed from annual plan", budget.Currencies["RUB"].Planned, "1101.10")
	expect(t, "removed from paid totals", budget.Currencies["RUB"].Paid, "0.00")
	expect(t, "other periods remain", c.get("/api/v1/recurring-payments").list(t)[0]["unpaid_count"], any(1.0))
	for range 2 {
		expect(t, "restore is idempotent", c.post(target+"/restore", nil).status, 204)
	}
	restored := c.get(path).object(t)
	expect(t, "same id", id(restored), id(period))
	expect(t, "payment date retained", restored["paid_at"], any("2026-01-27"))
	expect(t, "receipt retained", restored["receipts"], any(1.0))
	expect(t, "file restored", string(c.get(receipt["download_url"].(string)).body), string(pngBytes))
	expect(t, "audit integrity", c.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

func TestRemoveForecastSurvivesPauseMaterializationAndRestart(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(nil)
	base := "/api/v1/recurring-payments/" + id(payment)
	target := base + "/periods/2026-04-30"
	expect(t, "delete future date", c.delete(target).status, 204)
	expect(t, "repeat delete", c.delete(target).status, 204)
	forecast := c.get("/api/v1/payment-forecast?from_date=2026-03-01&to_date=2026-05-31").list(t)
	expect(t, "deleted date not projected", dates(forecast, payment["id"]), "2026-03-31,2026-05-31")
	expect(t, "cannot create deleted period", c.post(base+"/periods", map[string]any{"due_date": "2026-04-30"}).status, 409)
	expect(t, "pause", c.post(base+"/pause", map[string]any{"until": "2026-04-30"}).status, 200)
	expect(t, "resume", c.post(base+"/resume", nil).status, 200)
	e.clock.Set(schedule.Civil(2026, 4, 1))
	e.http.Close()
	e.db.Close()
	e.start()
	c = e.client()
	c.signIn()
	items := c.get("/api/v1/payment-occurrences?from_date=2026-04-01&to_date=2026-05-31").list(t)
	expect(t, "materialization keeps tombstone", dates(items, payment["id"]), "2026-05-31")
	expect(t, "restore after restart", c.post(target+"/restore", nil).status, 204)
	items = c.get("/api/v1/payment-occurrences?from_date=2026-04-01&to_date=2026-05-31").list(t)
	expect(t, "restore date", dates(items, payment["id"]), "2026-04-30,2026-05-31")
}

func TestRemoveWholePaymentAndPreserveSeparateRemoval(t *testing.T) {
	for _, frequency := range []string{"monthly", "once"} {
		t.Run(frequency, func(t *testing.T) {
			e := setup(t)
			c := e.client()
			c.signIn()
			payment := c.createPayment(map[string]any{"frequency": frequency, "title": "Remove this payment"})
			base := "/api/v1/recurring-payments/" + id(payment)
			period := c.get("/api/v1/payment-occurrences").list(t)[0]
			if frequency == "monthly" {
				expect(t, "delete one date first", c.delete(base+"/periods/2026-01-31").status, 204)
			}
			for range 2 {
				expect(t, "remove all", c.delete(base+"?mode=delete").status, 204)
			}
			expect(t, "no templates", len(c.get("/api/v1/recurring-payments").list(t)), 0)
			expect(t, "no periods", len(c.get("/api/v1/payment-occurrences?include_archived=true").list(t)), 0)
			expect(t, "cannot edit", c.patch(base, map[string]any{"title": "Oops"}).status, 404)
			expect(t, "cannot archive", c.delete(base).status, 404)
			expect(t, "stale period", c.get("/api/v1/payment-occurrences/"+id(period)).status, 404)
			expect(t, "restore parent first", c.post(base+"/periods/2026-01-31/restore", nil).status, 404)
			expect(t, "no forecasts", len(c.get("/api/v1/payment-forecast?from_date=2026-03-01&to_date=2026-12-31").list(t)), 0)
			expect(t, "CSV excludes deleted", strings.Contains(string(c.get("/api/v1/payment-occurrences/export").body), "Remove this payment"), false)
			var budget struct{ Currencies map[string]budgetLine }
			c.get("/api/v1/budget?year=2026").json(t, &budget)
			expect(t, "zero planned", budget.Currencies["RUB"].Planned, "0.00")
			var summary struct{ Currencies map[string]currencyTotals }
			c.get("/api/v1/payments/summary").json(t, &summary)
			expect(t, "zero total", summary.Currencies["RUB"].Total, "0.00")
			for range 2 {
				expect(t, "undo all", c.post(base+"/restore", nil).status, 204)
			}
			items := c.get("/api/v1/payment-occurrences").list(t)
			if frequency == "monthly" {
				expect(t, "separate removal stays removed", dates(items, payment["id"]), "2026-02-28")
			} else {
				expect(t, "one-time restored", len(items), 1)
			}
			expect(t, "archive original", c.delete(base).status, 204)
			expect(t, "remove archived", c.delete(base+"?mode=delete").status, 204)
			expect(t, "undo archived", c.post(base+"/restore", nil).status, 204)
			expect(t, "still archived", c.get("/api/v1/recurring-payments").list(t)[0]["active"], any(false))
		})
	}
}

func TestRemovalPermissionsAndValidation(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(nil)
	base := "/api/v1/recurring-payments/" + id(payment)
	c.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Alex", "password": "User-password123!"})
	ordinary := e.client()
	ordinary.signIn("alex", "User-password123!")
	reader := e.keyClient(c.createToken("read", 30))
	anonymous := e.client()
	routes := []struct{ method, path string }{
		{"DELETE", base + "?mode=delete"}, {"POST", base + "/restore"},
		{"DELETE", base + "/periods/2026-01-31"}, {"POST", base + "/periods/2026-01-31/restore"},
	}
	csrf := c.csrf
	for _, route := range routes {
		expect(t, "anonymous", anonymous.do(route.method, route.path, nil).status, 401)
		expect(t, "regular user", ordinary.do(route.method, route.path, nil).status, 403)
		expect(t, "read key", reader.do(route.method, route.path, nil).status, 403)
		c.csrf = ""
		expect(t, "missing CSRF", c.do(route.method, route.path, nil).status, 403)
		c.csrf = csrf
	}
	for _, due := range []string{"invalid", "2026-02-30", "1999-01-31", "2026-04-15", "2025-01-31", "2030-01-31"} {
		expect(t, "invalid "+due, c.delete(base+"/periods/"+due).status, 422)
	}
	expect(t, "bad mode", c.delete(base+"?mode=oops").status, 422)
	expect(t, "unknown parent", c.delete("/api/v1/recurring-payments/999?mode=delete").status, 404)
	expect(t, "unknown period restore", c.post(base+"/periods/2026-05-31/restore", nil).status, 404)
	writer := e.keyClient(c.createToken("write", 30))
	expect(t, "admin write token", writer.delete(base+"/periods/2026-01-31").status, 204)
	expect(t, "admin write token undo", writer.post(base+"/periods/2026-01-31/restore", nil).status, 204)
}

func TestRemovedPaymentsStopRemindersAndUndoDoesNotRepeatSent(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(nil)
	base := "/api/v1/recurring-payments/" + id(payment)
	period := c.get("/api/v1/payment-occurrences").list(t)[0]
	for _, statement := range []string{
		"INSERT INTO reminders(occurrence_id,state) VALUES(?,'pending')",
		"INSERT INTO deliveries(occurrence_id,kind,channel,state) VALUES(?,'due','email','pending')",
	} {
		if _, err := e.db.Exec(statement, id(period)); err != nil {
			t.Fatal(err)
		}
	}
	telegram, email := &recorder{}, &recorder{}
	w := channelWorker(e, telegram, map[string]notify.Sender{"email": email.sender(notify.SendResult{State: "sent"})})
	expect(t, "delete period", c.delete(base+"/periods/2026-01-31").status, 204)
	w.Tick()
	expect(t, "no Telegram", telegram.count(), 0)
	expect(t, "no email", email.count(), 0)
	expect(t, "cancelled pending", reminderState(t, e), "cancelled")
	expect(t, "undo", c.post(base+"/periods/2026-01-31/restore", nil).status, 204)
	w.Tick()
	expect(t, "Telegram restored", telegram.count(), 1)
	expect(t, "email restored", email.count(), 1)
	expect(t, "remove schedule", c.delete(base+"?mode=delete").status, 204)
	w.Tick()
	expect(t, "undo schedule", c.post(base+"/restore", nil).status, 204)
	w.Tick()
	expect(t, "no duplicate Telegram", telegram.count(), 1)
	expect(t, "no duplicate email", email.count(), 1)
	expect(t, "delete schedule again", c.delete(base+"?mode=delete").status, 204)
	e.clock.Set(schedule.Civil(2026, 2, 26))
	w.Tick()
	expect(t, "no future Telegram", telegram.count(), 1)
	expect(t, "no future email", email.count(), 1)
}

func TestRemovalMigrationFromV5KeepsExistingPayments(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(nil)
	period := c.get("/api/v1/payment-occurrences").list(t)[0]
	path := "/api/v1/payment-occurrences/" + id(period)
	expect(t, "paid before upgrade", c.patch(path, map[string]any{"paid": true, "paid_at": "2026-01-27"}).status, 200)
	expect(t, "receipt before upgrade", c.upload(path+"/receipts", "check.png", pngBytes).status, 201)
	for _, statement := range []string{
		"ALTER TABLE recurring_payments DROP COLUMN removed_at",
		"ALTER TABLE payment_occurrences DROP COLUMN removed_at",
		"PRAGMA user_version=5",
	} {
		if _, err := e.db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	e.http.Close()
	e.db.Close()
	e.start()
	c = e.client()
	c.signIn()
	expect(t, "same payment", id(c.get("/api/v1/recurring-payments").list(t)[0]), id(payment))
	restored := c.get(path).object(t)
	expect(t, "paid date retained", restored["paid_at"], any("2026-01-27"))
	expect(t, "receipt retained", restored["receipts"], any(1.0))
	base := "/api/v1/recurring-payments/" + id(payment)
	expect(t, "delete after migration", c.delete(base+"?mode=delete").status, 204)
	expect(t, "restore after migration", c.post(base+"/restore", nil).status, 204)
}
