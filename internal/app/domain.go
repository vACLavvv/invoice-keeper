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

type querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

// materialize keeps the calendar complete for both the current and the following month.
func materialize(q querier, today time.Time) error {
	horizon := monthlyDate(civil(today.Year(), today.Month(), 1), 2, 1).AddDate(0, 0, -1)
	type plan struct {
		id, amount, anchor, next int64
		first, currency          string
	}
	rows, err := q.Query("SELECT id,amount_cents,anchor_day,next_index,first_due_date,currency FROM recurring_payments WHERE active=1")
	if err != nil {
		return err
	}
	var plans []plan
	for rows.Next() {
		var p plan
		if err := rows.Scan(&p.id, &p.amount, &p.anchor, &p.next, &p.first, &p.currency); err != nil {
			rows.Close()
			return err
		}
		plans = append(plans, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, p := range plans {
		first, err := parseDate(p.first)
		if err != nil {
			return err
		}
		index := p.next
		for {
			due := monthlyDate(first, int(index), int(p.anchor))
			if index > 0 && due.After(horizon) {
				break
			}
			if _, err := q.Exec("INSERT OR IGNORE INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,?)",
				p.id, formatDate(due), p.amount, p.currency); err != nil {
				return err
			}
			index++
		}
		if index != p.next {
			if _, err := q.Exec("UPDATE recurring_payments SET next_index=? WHERE id=?", index, p.id); err != nil {
				return err
			}
		}
	}
	return nil
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

	amountCents int64
}

const occurrenceSelect = `SELECT o.id,o.recurring_payment_id,r.title,o.amount_cents,o.currency,o.due_date,o.paid_at,r.active,o.updated_by
FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id`

type scanner interface{ Scan(dest ...any) error }

// scanOccurrence derives status and lateness from the two dates; nothing derived is stored.
func scanOccurrence(row scanner, today time.Time) (Occurrence, error) {
	var o Occurrence
	var paid, updatedBy sql.NullString
	if err := row.Scan(&o.ID, &o.RecurringPaymentID, &o.Title, &o.amountCents, &o.Currency, &o.DueDate, &paid, &o.Active, &updatedBy); err != nil {
		return o, err
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
