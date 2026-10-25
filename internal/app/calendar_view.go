package app

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

type calendarDay struct {
	Date   string            `json:"date"`
	Count  int               `json:"count"`
	Totals map[string]string `json:"totals"`
	Items  []any             `json:"items"`
}
type calendarReference struct {
	occurrence, payment int64
	due                 string
}
type calendarBucket struct {
	count int
	sums  map[string]int64
	refs  []calendarReference
}

// Count and sum every obligation, but decrypt/serialize only the visible preview.
// Recorded periods precede projections, with a stable ID order inside each group.
func (s *Server) calendarData(ctx context.Context, q store.Querier, from, to time.Time, offset, limit int) ([]calendarDay, map[string]string, error) {
	type key struct {
		payment int64
		due     string
	}
	recorded := map[key]bool{}
	buckets := map[string]*calendarBucket{}
	total := map[string]int64{}
	add := func(ref calendarReference, amount int64, currency string) {
		b := buckets[ref.due]
		if b == nil {
			b = &calendarBucket{sums: map[string]int64{}, refs: []calendarReference{}}
			buckets[ref.due] = b
		}
		if b.count >= offset && len(b.refs) < limit {
			b.refs = append(b.refs, ref)
		}
		b.count++
		b.sums[currency] += amount
		total[currency] += amount
	}
	rows, err := q.Query(`SELECT o.id,o.recurring_payment_id,o.due_date,o.amount_cents,o.currency,o.removed_at IS NOT NULL OR r.removed_at IS NOT NULL
 FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.due_date BETWEEN ? AND ? ORDER BY o.due_date,o.id`, schedule.FormatDate(from), schedule.FormatDate(to))
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var id, payment, amount int64
		var due, currency string
		var removed bool
		if err = rows.Scan(&id, &payment, &due, &amount, &currency, &removed); err != nil {
			rows.Close()
			return nil, nil, err
		}
		recorded[key{payment, due}] = true
		if !removed {
			add(calendarReference{id, payment, due}, amount, currency)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	plans, err := schedule.LoadPlans(q, "active=1")
	if err != nil {
		return nil, nil, err
	}
	pauses, err := schedule.LoadPauses(q)
	if err != nil {
		return nil, nil, err
	}
	sort.Slice(plans, func(i, j int) bool { return plans[i].ID < plans[j].ID })
	for _, p := range plans {
		if err = ctx.Err(); err != nil {
			return nil, nil, err
		}
		for _, due := range schedule.ProjectedDates(p, pauses[p.ID], from, to) {
			day := schedule.FormatDate(due)
			if !recorded[key{p.ID, day}] {
				add(calendarReference{payment: p.ID, due: day}, p.Amount, p.Currency)
			}
		}
	}
	amounts := func(sums map[string]int64) map[string]string {
		result := map[string]string{}
		for c, n := range sums {
			result[c] = schedule.Money(n)
		}
		return result
	}
	dates := make([]string, 0, len(buckets))
	for day := range buckets {
		dates = append(dates, day)
	}
	sort.Strings(dates)
	// Load only the projected cards that are actually shown, in one bounded query.
	previewPlans := map[int64]recurringItem{}
	ids := []any{}
	seen := map[int64]bool{}
	for _, day := range dates {
		for _, ref := range buckets[day].refs {
			if ref.occurrence == 0 && !seen[ref.payment] {
				seen[ref.payment] = true
				ids = append(ids, ref.payment)
			}
		}
	}
	if len(ids) > 0 {
		where := " WHERE r.id IN (" + strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",") + ")"
		plans, err := s.loadRecurring(q, where, ids...)
		if err != nil {
			return nil, nil, err
		}
		for _, p := range plans {
			previewPlans[p.ID] = p
		}
	}
	days := make([]calendarDay, 0, len(dates))
	for _, date := range dates {
		b := buckets[date]
		day := calendarDay{Date: date, Count: b.count, Totals: amounts(b.sums), Items: []any{}}
		for _, ref := range b.refs {
			if ref.occurrence != 0 {
				item, err := s.findOccurrence(q, ref.occurrence)
				if err != nil {
					return nil, nil, err
				}
				day.Items = append(day.Items, item)
			} else {
				p := previewPlans[ref.payment]
				day.Items = append(day.Items, forecastPeriod{RecurringPaymentID: p.ID, Title: p.Title, Amount: p.Amount, Currency: p.Currency, DueDate: ref.due, Frequency: p.Frequency, Category: p.Category, Assignee: p.Assignee, PaymentURL: p.PaymentURL, PaymentDetails: p.PaymentDetails, Wallet: p.Wallet, Description: p.Description})
			}
		}
		days = append(days, day)
	}
	return days, amounts(total), nil
}

func (s *Server) paymentCalendar(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	month := r.URL.Query().Get("month")
	if month == "" {
		month = s.Today().Format("2006-01")
	}
	from, err := time.Parse("2006-01", month)
	if err != nil || from.Year() < 2000 || from.Year() > 2100 {
		return fail(422, "Месяц в формате YYYY-MM, год от 2000 до 2100")
	}
	if err = s.ensureMaterialized(); err != nil {
		return err
	}
	var days []calendarDay
	var totals map[string]string
	err = s.readSnapshot(r.Context(), func(q store.Querier) error {
		var e error
		days, totals, e = s.calendarData(r.Context(), q, from, from.AddDate(0, 1, -1), 0, 3)
		return e
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{"month": month, "days": days, "totals": totals})
}
func (s *Server) paymentCalendarDay(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	params := &queryParams{values: r.URL.Query()}
	day := params.date("date")
	page := params.integer("page", 1, 1, 1000000)
	size := params.integer("page_size", 25, 1, 100)
	if day == nil && !params.values.Has("date") {
		params.add("date", "Обязательный параметр", "missing")
	}
	if day != nil && (day.Year() < 2000 || day.Year() > 2100) {
		params.add("date", "Год от 2000 до 2100", "value_error")
	}
	if err := params.err(); err != nil {
		return err
	}
	if err := s.ensureMaterialized(); err != nil {
		return err
	}
	var days []calendarDay
	err := s.readSnapshot(r.Context(), func(q store.Querier) error {
		var e error
		days, _, e = s.calendarData(r.Context(), q, *day, *day, (page-1)*size, size)
		return e
	})
	if err != nil {
		return err
	}
	items := []any{}
	total := 0
	if len(days) > 0 {
		items, total = days[0].Items, days[0].Count
	}
	return writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "page_size": size, "pages": max(1, (total+size-1)/size)})
}
