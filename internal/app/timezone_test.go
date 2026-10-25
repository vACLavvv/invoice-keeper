package app

import (
	"path/filepath"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
)

func TestWorkspaceTimezoneDrivesAPIAndTelegramPaymentDates(t *testing.T) {
	instant, _ := time.Parse(time.RFC3339, "2026-10-24T21:30:00Z")
	for _, tc := range []struct {
		zone, day string
		late      bool
	}{
		{"UTC", "2026-10-24", false},
		{"Europe/Moscow", "2026-10-25", true},
		{"Europe/Berlin", "2026-10-24", false},
		{"Europe/Belgrade", "2026-10-24", false},
		{"Asia/Vladivostok", "2026-10-25", true},
	} {
		t.Run(tc.zone, func(t *testing.T) {
			settings := &config.Settings{DatabasePath: filepath.Join(t.TempDir(), "timezone.sqlite3"), AdminUsername: "admin", AdminPassword: testPassword, Timezone: tc.zone}
			if err := settings.Validate(); err != nil {
				t.Fatal(err)
			}
			e := &harness{t: t, settings: settings, clock: &clock{now: schedule.TodayAt(instant, settings.Location())}}
			e.start()
			c := e.client()
			c.signIn()
			apiSettings := c.get("/api/v1/settings").object(t)
			expect(t, "configured zone", apiSettings["timezone"], any(tc.zone))
			expect(t, "shared business date", apiSettings["today"], any(tc.day))
			c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-10-24"})
			period := c.get("/api/v1/payment-occurrences").list(t)[0]
			expect(t, "due date is a civil date", period["due_date"], any("2026-10-24"))
			expect(t, "lateness uses workspace day", period["is_late"], any(tc.late))
			path := "/api/v1/payment-occurrences/" + id(period)
			start := time.Now().UTC()
			paid := c.patch(path, map[string]any{"paid": true}).object(t)
			expect(t, "API date defaults to workspace date", paid["paid_at"], any(tc.day))
			assertUpdatedAtUTC(t, e, id(period), start)
			// A correction is a factual calendar date, independent of device and
			// server clocks; the exact time of recording is a different field.
			corrected := c.patch(path, map[string]any{"paid_at": "2026-10-24"}).object(t)
			expect(t, "factual date preserved", corrected["paid_at"], any("2026-10-24"))
			expect(t, "on due date is on time", corrected["is_late"], any(false))
			expect(t, "deadline unchanged", corrected["due_date"], any("2026-10-24"))
			c.patch(path, map[string]any{"paid": false})
			start = time.Now().UTC()
			already, err := e.server.BotBackend().MarkPaid(int64(period["id"].(float64)), "telegram:test-user")
			if err != nil || already {
				t.Fatalf("Telegram mark: already=%v err=%v", already, err)
			}
			paid = c.get(path).object(t)
			expect(t, "Telegram uses same workspace date", paid["paid_at"], any(tc.day))
			assertUpdatedAtUTC(t, e, id(period), start)
			var prior string
			e.db.QueryRow("SELECT updated_at FROM payment_occurrences WHERE id=?", id(period)).Scan(&prior)
			already, err = e.server.BotBackend().MarkPaid(int64(period["id"].(float64)), "telegram:test-user")
			if err != nil || !already {
				t.Fatalf("Telegram repeated mark: already=%v err=%v", already, err)
			}
			var current string
			e.db.QueryRow("SELECT updated_at FROM payment_occurrences WHERE id=?", id(period)).Scan(&current)
			expect(t, "repeat does not replace exact time", current, prior)
		})
	}
}

func assertUpdatedAtUTC(t *testing.T, e *harness, periodID string, start time.Time) {
	t.Helper()
	var raw string
	if err := e.db.QueryRow("SELECT updated_at FROM payment_occurrences WHERE id=?", periodID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	stamp, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		t.Fatalf("timestamp %q: %v", raw, err)
	}
	_, offset := stamp.Zone()
	if offset != 0 || stamp.Before(start.Truncate(time.Microsecond)) || stamp.After(time.Now().UTC()) {
		t.Fatalf("recording timestamp must be exact UTC wall time, got %q", raw)
	}
}
