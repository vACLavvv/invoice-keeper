package app

import (
	"fmt"
	"strings"
	"time"

	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

// Every messenger listing counts the full section, but selects only its visible
// rows. No payment details, wallet checks, receipt counts or decryption are needed.
func messengerWhere(onlyOverdue bool, today time.Time) (string, []any) {
	where := " WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL"
	if onlyOverdue {
		return where + " AND o.due_date<?", []any{schedule.FormatDate(today)}
	}
	return where + " AND o.due_date<=?", []any{schedule.FormatDate(today.AddDate(0, 0, 7))}
}

func messengerTotals(q store.Querier, where string, args []any) (int, map[string]int64, error) {
	rows, err := q.Query("SELECT o.currency,COUNT(*),COALESCE(SUM(o.amount_cents),0)"+occurrenceFrom+where+" GROUP BY o.currency", args...)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()
	total := 0
	totals := map[string]int64{}
	for rows.Next() {
		var currency string
		var count int
		var cents int64
		if err := rows.Scan(&currency, &count, &cents); err != nil {
			return 0, nil, err
		}
		total += count
		totals[currency] = cents
	}
	return total, totals, rows.Err()
}

func messengerRows(q store.Querier, where string, args []any, today time.Time, limit, offset int) ([]bot.PaymentItem, error) {
	rows, err := q.Query("SELECT o.id,r.title,o.amount_cents,o.currency,o.due_date"+occurrenceFrom+where+" ORDER BY o.due_date,o.id LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []bot.PaymentItem{}
	day := schedule.FormatDate(today)
	for rows.Next() {
		var item bot.PaymentItem
		var cents int64
		if err := rows.Scan(&item.ID, &item.Title, &cents, &item.Currency, &item.DueDate); err != nil {
			return nil, err
		}
		item.Amount = schedule.Money(cents)
		item.Status = "unpaid"
		if item.DueDate < day {
			item.Status = "overdue"
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func messengerTotalText(totals map[string]int64) string {
	var parts []string
	for _, currency := range currencies {
		if totals[currency] > 0 {
			parts = append(parts, fmt.Sprintf("%s %s", schedule.Money(totals[currency]), currency))
		}
	}
	return strings.Join(parts, " · ")
}
