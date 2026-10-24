package app

import (
	"database/sql"
	"fmt"
	"strconv"
	"time"
)

const dateLayout = "2006-01-02"

// Dates are calendar days stored as UTC midnight; the application timezone only decides "today".
func civil(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

func parseDate(value string) (time.Time, error) { return time.Parse(dateLayout, value) }

func formatDate(t time.Time) string { return t.Format(dateLayout) }

func localToday(s *Settings) time.Time {
	now := time.Now().In(s.Location())
	return civil(now.Year(), now.Month(), now.Day())
}

func timestamp() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000000-07:00") }

func daysIn(y int, m time.Month) int { return civil(y, m+1, 0).Day() }

// monthlyDate returns the due date of period index: the anchor day, clamped to the month's last day.
// The anchor never drifts: 31 Jan → 28 Feb → 31 Mar.
func monthlyDate(first time.Time, index, anchor int) time.Time {
	if anchor == 0 {
		anchor = first.Day()
	}
	total := first.Year()*12 + int(first.Month()) - 1 + index
	y, m := total/12, time.Month(total%12+1)
	return civil(y, m, min(anchor, daysIn(y, m)))
}

// frequencyMonths is the step between periods; the anchor day keeps every step on the same day.
var frequencyMonths = map[string]int{"monthly": 1, "quarterly": 3, "yearly": 12}

var frequencies = []string{"monthly", "quarterly", "yearly"}

// periodDate is the due date of period index: 29 Feb yearly → 28 Feb in a common year.
func periodDate(first time.Time, index, anchor int, frequency string) time.Time {
	step := frequencyMonths[frequency]
	if step == 0 {
		step = 1
	}
	return monthlyDate(first, index*step, anchor)
}

type querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

// pause skips due dates from From through Until (inclusive); an open pause has no Until.
type pause struct {
	From  time.Time
	Until *time.Time
}

func (p pause) covers(due time.Time) bool {
	return !due.Before(p.From) && (p.Until == nil || !due.After(*p.Until))
}

func isPaused(pauses []pause, due time.Time) bool {
	for _, p := range pauses {
		if p.covers(due) {
			return true
		}
	}
	return false
}

func loadPauses(q querier) (map[int64][]pause, error) {
	rows, err := q.Query("SELECT recurring_payment_id,from_date,until_date FROM payment_pauses ORDER BY from_date")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[int64][]pause{}
	for rows.Next() {
		var id int64
		var from string
		var until sql.NullString
		if err := rows.Scan(&id, &from, &until); err != nil {
			return nil, err
		}
		p := pause{}
		if p.From, err = parseDate(from); err != nil {
			return nil, err
		}
		if until.Valid {
			u, err := parseDate(until.String)
			if err != nil {
				return nil, err
			}
			p.Until = &u
		}
		result[id] = append(result[id], p)
	}
	return result, rows.Err()
}

// plan is the repetition rule of one recurring payment.
type plan struct {
	id, amount, anchor, next int64
	first                    time.Time
	currency, frequency      string
}

func loadPlans(q querier, where string) ([]plan, error) {
	rows, err := q.Query("SELECT id,amount_cents,anchor_day,next_index,first_due_date,currency,frequency FROM recurring_payments WHERE " + where)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var plans []plan
	for rows.Next() {
		var p plan
		var first string
		if err := rows.Scan(&p.id, &p.amount, &p.anchor, &p.next, &first, &p.currency, &p.frequency); err != nil {
			return nil, err
		}
		if p.first, err = parseDate(first); err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

// materialize keeps the calendar complete through the end of next month and always keeps
// the next upcoming period, so a yearly payment shows its next date right away.
// Periods inside a pause are skipped: they are neither created nor overdue later.
func materialize(q querier, today time.Time) error {
	horizon := monthlyDate(civil(today.Year(), today.Month(), 1), 2, 1).AddDate(0, 0, -1)
	plans, err := loadPlans(q, "active=1")
	if err != nil {
		return err
	}
	pauses, err := loadPauses(q)
	if err != nil {
		return err
	}
	for _, p := range plans {
		// A pause can end earlier than planned (resume), so paused payments are re-scanned from the start.
		index := p.next
		if len(pauses[p.id]) > 0 {
			index = 0
		}
		prev := time.Time{}
		if index > 0 {
			prev = periodDate(p.first, int(index-1), int(p.anchor), p.frequency)
		}
		for ; index < 2400; index++ {
			due := periodDate(p.first, int(index), int(p.anchor), p.frequency)
			if index > 0 && due.After(horizon) && prev.After(today) {
				break
			}
			prev = due
			if isPaused(pauses[p.id], due) {
				continue
			}
			if _, err := q.Exec("INSERT OR IGNORE INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,?)",
				p.id, formatDate(due), p.amount, p.currency); err != nil {
				return err
			}
		}
		if index != p.next && len(pauses[p.id]) == 0 {
			if _, err := q.Exec("UPDATE recurring_payments SET next_index=? WHERE id=?", index, p.id); err != nil {
				return err
			}
		}
	}
	return nil
}

// projectedDates lists the due dates of a plan within [from, to], skipping pauses.
func projectedDates(p plan, pauses []pause, from, to time.Time) []time.Time {
	var dates []time.Time
	for index := 0; index < 2400; index++ {
		due := periodDate(p.first, index, int(p.anchor), p.frequency)
		if due.After(to) {
			break
		}
		if !due.Before(from) && !isPaused(pauses, due) {
			dates = append(dates, due)
		}
	}
	return dates
}

func money(cents int64) string { return fmt.Sprintf("%d.%02d", cents/100, cents%100) }

type Occurrence struct {
	ID                 int64   `json:"id"`
	RecurringPaymentID int64   `json:"recurring_payment_id"`
	Title              string  `json:"title"`
	Amount             string  `json:"amount"`
	Currency           string  `json:"currency"`
	DueDate            string  `json:"due_date"`
	PaidAt             *string `json:"paid_at"`
	Status             string  `json:"status"`
	DaysOverdue        int     `json:"days_overdue"`
	IsLate             bool    `json:"is_late"`
	Active             bool    `json:"active"`
	UpdatedBy          *string `json:"updated_by"`
	Frequency          string  `json:"frequency"`
	Category           *string `json:"category"`
	Assignee           *Person `json:"assignee"`
	Receipts           int     `json:"receipts"`
	PaymentURL         *string `json:"payment_url"`
	PaymentDetails     *string `json:"payment_details"`

	amountCents int64
}

// Person is a regular user shown next to a payment (its assignee).
type Person struct {
	ID          int64  `json:"id"`
	DisplayName string `json:"display_name"`
	Username    string `json:"username"`
}

const occurrenceSelect = `SELECT o.id,o.recurring_payment_id,r.title,o.amount_cents,o.currency,o.due_date,o.paid_at,r.active,o.updated_by,
r.frequency,r.category,u.id,u.display_name,u.username,(SELECT COUNT(*) FROM receipts x WHERE x.occurrence_id=o.id),
r.payment_url,r.payment_details
FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id LEFT JOIN users u ON u.id=r.assignee_id`

type scanner interface{ Scan(dest ...any) error }

// scanOccurrence derives status and lateness from the two dates; nothing derived is stored.
func scanOccurrence(row scanner, today time.Time) (Occurrence, error) {
	var o Occurrence
	var paid, updatedBy, category, assigneeName, assigneeLogin sql.NullString
	var assigneeID sql.NullInt64
	if err := row.Scan(&o.ID, &o.RecurringPaymentID, &o.Title, &o.amountCents, &o.Currency, &o.DueDate, &paid, &o.Active, &updatedBy,
		&o.Frequency, &category, &assigneeID, &assigneeName, &assigneeLogin, &o.Receipts, &o.PaymentURL, &o.PaymentDetails); err != nil {
		return o, err
	}
	if category.Valid {
		o.Category = &category.String
	}
	if assigneeID.Valid {
		o.Assignee = &Person{ID: assigneeID.Int64, DisplayName: assigneeName.String, Username: assigneeLogin.String}
	}
	due, err := parseDate(o.DueDate)
	if err != nil {
		return o, err
	}
	o.Amount = money(o.amountCents)
	reference := today
	switch {
	case paid.Valid:
		o.PaidAt = &paid.String
		paidAt, err := parseDate(paid.String)
		if err != nil {
			return o, err
		}
		reference = paidAt
		o.Status = "paid"
	case today.After(due):
		o.Status = "overdue"
	default:
		o.Status = "unpaid"
	}
	if updatedBy.Valid {
		o.UpdatedBy = &updatedBy.String
	}
	o.DaysOverdue = max(0, int(reference.Sub(due).Hours()/24))
	o.IsLate = o.DaysOverdue > 0
	return o, nil
}

func audit(q querier, actor, action string, entity any) error {
	_, err := q.Exec("INSERT INTO audit_log(actor,action,entity,created_at) VALUES(?,?,?,?)", actor, action, fmt.Sprint(entity), timestamp())
	return err
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
