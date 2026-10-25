package schedule

import (
	"testing"
	"time"
)

func TestBusinessDateAtMidnightAcrossConfiguredZones(t *testing.T) {
	instant, err := time.Parse(time.RFC3339, "2026-10-24T21:30:00Z")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ zone, day string }{
		{"UTC", "2026-10-24"},
		{"Europe/Moscow", "2026-10-25"},
		{"Europe/Berlin", "2026-10-24"},
		{"Europe/Belgrade", "2026-10-24"},
		{"Asia/Vladivostok", "2026-10-25"},
	} {
		t.Run(tc.zone, func(t *testing.T) {
			loc, err := time.LoadLocation(tc.zone)
			if err != nil {
				t.Fatal(err)
			}
			got := TodayAt(instant, loc)
			if FormatDate(got) != tc.day || got.Location() != time.UTC || got.Hour() != 0 {
				t.Fatalf("business day: got %s in %s, want civil %s", got, got.Location(), tc.day)
			}
			// Civil-day arithmetic must not acquire the 23/25-hour DST day.
			if days := got.AddDate(0, 0, 1).Sub(got).Hours() / 24; days != 1 {
				t.Fatalf("civil date arithmetic: %v", days)
			}
		})
	}
}

func TestConfiguredIANAZoneObservesDaylightSavingTransitions(t *testing.T) {
	for _, zone := range []string{"Europe/Berlin", "Europe/Belgrade"} {
		t.Run(zone, func(t *testing.T) {
			loc, err := time.LoadLocation(zone)
			if err != nil {
				t.Fatal(err)
			}
			for _, tc := range []struct {
				instant, day, clock string
				offset              int
			}{
				{"2026-03-28T22:30:00Z", "2026-03-28", "23:30", 3600},
				{"2026-03-28T23:30:00Z", "2026-03-29", "00:30", 3600},
				{"2026-03-29T00:59:00Z", "2026-03-29", "01:59", 3600},
				{"2026-03-29T01:00:00Z", "2026-03-29", "03:00", 7200},
				{"2026-03-29T22:30:00Z", "2026-03-30", "00:30", 7200},
				{"2026-10-24T22:30:00Z", "2026-10-25", "00:30", 7200},
				{"2026-10-25T00:59:00Z", "2026-10-25", "02:59", 7200},
				{"2026-10-25T01:00:00Z", "2026-10-25", "02:00", 3600},
				{"2026-10-25T22:30:00Z", "2026-10-25", "23:30", 3600},
				{"2026-10-25T23:30:00Z", "2026-10-26", "00:30", 3600},
			} {
				instant, err := time.Parse(time.RFC3339, tc.instant)
				if err != nil {
					t.Fatal(err)
				}
				_, offset := instant.In(loc).Zone()
				if got := FormatDate(TodayAt(instant, loc)); got != tc.day || instant.In(loc).Format("15:04") != tc.clock || offset != tc.offset {
					t.Errorf("%s: day=%s clock=%s offset=%d; want %s %s %d", tc.instant, got, instant.In(loc).Format("15:04"), offset, tc.day, tc.clock, tc.offset)
				}
			}
		})
	}
}

func TestCivilDueDatesRemainStableAcrossZonesAndMonthEnds(t *testing.T) {
	for _, zone := range []string{"UTC", "Europe/Moscow", "Europe/Berlin", "Europe/Belgrade", "Asia/Vladivostok"} {
		loc, err := time.LoadLocation(zone)
		if err != nil {
			t.Fatal(err)
		}
		instant, _ := time.Parse(time.RFC3339, "2028-02-28T23:30:00Z")
		businessDate := TodayAt(instant, loc)
		// A February 29 deadline remains the same ISO civil date even when the
		// instant corresponds to February 28 in one of these workspaces.
		due, err := ParseDate("2028-02-29")
		if err != nil || FormatDate(due) != "2028-02-29" {
			t.Fatalf("%s: due date changed: %s %v", zone, due, err)
		}
		if businessDate.After(due) {
			t.Errorf("%s: deadline unexpectedly overdue: %s", zone, businessDate)
		}
		if got := FormatDate(MonthlyDate(Civil(2028, 1, 31), 1, 31)); got != "2028-02-29" {
			t.Errorf("%s: leap-year end %s", zone, got)
		}
		if got := FormatDate(MonthlyDate(Civil(2028, 1, 31), 2, 31)); got != "2028-03-31" {
			t.Errorf("%s: anchor drifted: %s", zone, got)
		}
	}
}
