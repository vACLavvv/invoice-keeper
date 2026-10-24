package schedule

import (
	"strings"
	"testing"
	"time"
)

func dates(list []time.Time) string {
	var out []string
	for _, d := range list {
		out = append(out, FormatDate(d))
	}
	return strings.Join(out, ",")
}

func TestAnchorDayNeverDrifts(t *testing.T) {
	first := Civil(2026, 1, 31)
	var got []time.Time
	for i := range 4 {
		got = append(got, MonthlyDate(first, i, 0))
	}
	if dates(got) != "2026-01-31,2026-02-28,2026-03-31,2026-04-30" {
		t.Fatalf("monthly: %s", dates(got))
	}
	for name, c := range map[string]struct {
		got  time.Time
		want string
	}{
		"leap year":        {MonthlyDate(Civil(2028, 1, 31), 1, 0), "2028-02-29"},
		"year wrap":        {MonthlyDate(Civil(2026, 12, 31), 1, 0), "2027-01-31"},
		"quarterly":        {PeriodDate(first, 1, 31, "quarterly"), "2026-04-30"},
		"yearly 29 Feb":    {PeriodDate(Civil(2028, 2, 29), 1, 29, "yearly"), "2029-02-28"},
		"yearly back":      {PeriodDate(Civil(2028, 2, 29), 4, 29, "yearly"), "2032-02-29"},
		"unknown is month": {PeriodDate(first, 1, 31, "weekly"), "2026-02-28"},
	} {
		if FormatDate(c.got) != c.want {
			t.Errorf("%s: got %s, want %s", name, FormatDate(c.got), c.want)
		}
	}
}

func TestPausesSkipDates(t *testing.T) {
	until := Civil(2026, 3, 15)
	pauses := []Pause{{From: Civil(2026, 2, 1), Until: &until}, {From: Civil(2026, 6, 1)}}
	plan := Plan{Anchor: 10, First: Civil(2026, 1, 10), Frequency: "monthly"}
	got := ProjectedDates(plan, pauses, Civil(2026, 1, 1), Civil(2026, 8, 31))
	if dates(got) != "2026-01-10,2026-04-10,2026-05-10" {
		t.Fatalf("projected: %s", dates(got))
	}
	if !IsPaused(pauses, Civil(2026, 3, 15)) || IsPaused(pauses, Civil(2026, 3, 16)) {
		t.Fatal("a pause includes its last day and no more")
	}
}

func TestFormatting(t *testing.T) {
	for got, want := range map[string]string{
		Money(150000): "1500.00", Money(5): "0.05", ShortDate("2026-01-31"): "31.01",
		FullDate("2026-01-31"): "31.01.2026", FullDate("not a date"): "not a date",
	} {
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}

func TestOneTimeHasASinglePeriod(t *testing.T) {
	plan := Plan{Anchor: 10, First: Civil(2026, 2, 10), Frequency: Once}
	if got := dates(ProjectedDates(plan, nil, Civil(2026, 1, 1), Civil(2030, 1, 1))); got != "2026-02-10" {
		t.Fatalf("one-time projected: %s", got)
	}
}
