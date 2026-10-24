// Package schedule is the calendar of recurring payments: due dates from an anchor day
// (31 Jan → 28 Feb → 31 Mar), quarterly and yearly steps, pauses, and the periods kept in the database.
package schedule

import (
	"database/sql"
	"fmt"
	"time"

	"invoice-keeper/internal/app/store"
)

const DateLayout = "2006-01-02"

// Dates are calendar days stored as UTC midnight; the application timezone only decides "today".
func Civil(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

func ParseDate(value string) (time.Time, error) { return time.Parse(DateLayout, value) }

func FormatDate(t time.Time) string { return t.Format(DateLayout) }

func Today(loc *time.Location) time.Time {
	now := time.Now().In(loc)
	return Civil(now.Year(), now.Month(), now.Day())
}

func Timestamp() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000000-07:00") }

func DaysIn(y int, m time.Month) int { return Civil(y, m+1, 0).Day() }

// MonthlyDate returns the due date of period index: the anchor day, clamped to the month's last day.
// The anchor never drifts: 31 Jan → 28 Feb → 31 Mar.
func MonthlyDate(first time.Time, index, anchor int) time.Time {
	if anchor == 0 {
		anchor = first.Day()
	}
	total := first.Year()*12 + int(first.Month()) - 1 + index
	y, m := total/12, time.Month(total%12+1)
	return Civil(y, m, min(anchor, DaysIn(y, m)))
}

// frequencyMonths is the step between periods; the anchor day keeps every step on the same day.
var frequencyMonths = map[string]int{"monthly": 1, "quarterly": 3, "yearly": 12}

var Frequencies = []string{"monthly", "quarterly", "yearly"}

// PeriodDate is the due date of period index: 29 Feb yearly → 28 Feb in a common year.
func PeriodDate(first time.Time, index, anchor int, frequency string) time.Time {
	step := frequencyMonths[frequency]
	if step == 0 {
		step = 1
	}
	return MonthlyDate(first, index*step, anchor)
}

// Pause skips due dates from From through Until (inclusive); an open Pause has no Until.
type Pause struct {
	From  time.Time
	Until *time.Time
}

func (p Pause) covers(due time.Time) bool {
	return !due.Before(p.From) && (p.Until == nil || !due.After(*p.Until))
}

func IsPaused(pauses []Pause, due time.Time) bool {
	for _, p := range pauses {
		if p.covers(due) {
			return true
		}
	}
	return false
}

func LoadPauses(q store.Querier) (map[int64][]Pause, error) {
	rows, err := q.Query("SELECT recurring_payment_id,from_date,until_date FROM payment_pauses ORDER BY from_date")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[int64][]Pause{}
	for rows.Next() {
		var id int64
		var from string
		var until sql.NullString
		if err := rows.Scan(&id, &from, &until); err != nil {
			return nil, err
		}
		p := Pause{}
		if p.From, err = ParseDate(from); err != nil {
			return nil, err
		}
		if until.Valid {
			u, err := ParseDate(until.String)
			if err != nil {
				return nil, err
			}
			p.Until = &u
		}
		result[id] = append(result[id], p)
	}
	return result, rows.Err()
}

// Plan is the repetition rule of one recurring payment.
type Plan struct {
	ID, Amount, Anchor, Next int64
	First                    time.Time
	Currency, Frequency      string
}

func LoadPlans(q store.Querier, where string) ([]Plan, error) {
	rows, err := q.Query("SELECT id,amount_cents,anchor_day,next_index,first_due_date,currency,frequency FROM recurring_payments WHERE " + where)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var plans []Plan
	for rows.Next() {
		var p Plan
		var first string
		if err := rows.Scan(&p.ID, &p.Amount, &p.Anchor, &p.Next, &first, &p.Currency, &p.Frequency); err != nil {
			return nil, err
		}
		if p.First, err = ParseDate(first); err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

// Materialize keeps the calendar complete through the end of next month and always keeps
// the next upcoming period, so a yearly payment shows its next date right away.
// Periods inside a Pause are skipped: they are neither created nor overdue later.
func Materialize(q store.Querier, today time.Time) error {
	horizon := MonthlyDate(Civil(today.Year(), today.Month(), 1), 2, 1).AddDate(0, 0, -1)
	plans, err := LoadPlans(q, "active=1")
	if err != nil {
		return err
	}
	pauses, err := LoadPauses(q)
	if err != nil {
		return err
	}
	for _, p := range plans {
		// A Pause can end earlier than planned (resume), so paused payments are re-scanned from the start.
		index := p.Next
		if len(pauses[p.ID]) > 0 {
			index = 0
		}
		prev := time.Time{}
		if index > 0 {
			prev = PeriodDate(p.First, int(index-1), int(p.Anchor), p.Frequency)
		}
		for ; index < 2400; index++ {
			due := PeriodDate(p.First, int(index), int(p.Anchor), p.Frequency)
			if index > 0 && due.After(horizon) && prev.After(today) {
				break
			}
			prev = due
			if IsPaused(pauses[p.ID], due) {
				continue
			}
			if _, err := q.Exec("INSERT OR IGNORE INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,?)",
				p.ID, FormatDate(due), p.Amount, p.Currency); err != nil {
				return err
			}
		}
		if index != p.Next && len(pauses[p.ID]) == 0 {
			if _, err := q.Exec("UPDATE recurring_payments SET next_index=? WHERE id=?", index, p.ID); err != nil {
				return err
			}
		}
	}
	return nil
}

// ProjectedDates lists the due dates of a Plan within [from, to], skipping pauses.
func ProjectedDates(p Plan, pauses []Pause, from, to time.Time) []time.Time {
	var dates []time.Time
	for index := 0; index < 2400; index++ {
		due := PeriodDate(p.First, index, int(p.Anchor), p.Frequency)
		if due.After(to) {
			break
		}
		if !due.Before(from) && !IsPaused(pauses, due) {
			dates = append(dates, due)
		}
	}
	return dates
}

func Money(cents int64) string { return fmt.Sprintf("%d.%02d", cents/100, cents%100) }

// ShortDate is 31.01 for messages; FullDate is 31.01.2026.
func ShortDate(iso string) string {
	if d, err := ParseDate(iso); err == nil {
		return d.Format("02.01")
	}
	return iso
}

func FullDate(iso string) string {
	if d, err := ParseDate(iso); err == nil {
		return d.Format("02.01.2006")
	}
	return iso
}
