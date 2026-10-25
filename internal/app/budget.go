package app

// Budget for a year: planned spending per month and per category, separately for each currency.
// Future months are projected by the repetition rule (pauses skipped), so the plan is complete
// even beyond the materialized horizon; paid amounts come from the recorded periods.

import (
	"context"
	"database/sql"
	"net/http"
	"sort"
	"strconv"
	"time"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

type budgetLine struct {
	Planned   string `json:"planned"`
	Paid      string `json:"paid"`
	Remaining string `json:"remaining"`
}

type budgetCell struct{ planned, paid int64 }

func (c budgetCell) line() budgetLine {
	return budgetLine{schedule.Money(c.planned), schedule.Money(c.paid), schedule.Money(max(0, c.planned-c.paid))}
}

type budgetBook map[string]*budgetCell // by currency

func (b budgetBook) add(currency string, planned, paid int64) {
	cell := b[currency]
	if cell == nil {
		cell = &budgetCell{}
		b[currency] = cell
	}
	cell.planned += planned
	cell.paid += paid
}

func (b budgetBook) lines() map[string]budgetLine {
	out := map[string]budgetLine{}
	for _, c := range currencies {
		cell := b[c]
		if cell == nil {
			cell = &budgetCell{}
		}
		out[c] = cell.line()
	}
	return out
}

func (s *Server) budget(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	year := s.Today().Year()
	if raw := r.URL.Query().Get("year"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 2000 || parsed > 2100 {
			return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"query", "year"}, Msg: "Год от 2000 до 2100", Type: "value_error"}}}
		}
		year = parsed
	}
	from, to := schedule.Civil(year, 1, 1), schedule.Civil(year, 12, 31)
	data, err := s.readBudget(r.Context(), from, to)
	if err != nil {
		return err
	}

	type monthOut struct {
		Month      string                `json:"month"`
		Currencies map[string]budgetLine `json:"currencies"`
	}
	type categoryOut struct {
		Category   *string               `json:"category"`
		Currencies map[string]budgetLine `json:"currencies"`
	}
	result := struct {
		Year       int                   `json:"year"`
		Currencies map[string]budgetLine `json:"currencies"`
		Months     []monthOut            `json:"months"`
		Categories []categoryOut         `json:"categories"`
	}{Year: year, Currencies: data.total.lines(), Categories: []categoryOut{}} // [] even for a year without payments
	for i, book := range data.months {
		result.Months = append(result.Months, monthOut{schedule.Civil(year, time.Month(i+1), 1).Format("2006-01"), book.lines()})
	}
	names := make([]string, 0, len(data.byCategory))
	for name := range data.byCategory {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool { return names[i] != "" && (names[j] == "" || names[i] < names[j]) })
	for _, name := range names {
		var category *string
		if name != "" {
			category = &name
		}
		result.Categories = append(result.Categories, categoryOut{category, data.byCategory[name].lines()})
	}
	return writeJSON(w, 200, result)
}

// budgetData is shared by the web annual plan and Telegram monthly reports.
// Both use the same recorded snapshots, projections, deletion and pause rules.
type budgetData struct {
	months     []budgetBook
	total      budgetBook
	byCategory map[string]budgetBook
}

// A deferred read transaction gives all queries one snapshot without taking
// SQLite's writer lock (DB.Write deliberately uses BEGIN IMMEDIATE).
func (s *Server) readBudget(ctx context.Context, from, to time.Time) (budgetData, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	conn, err := s.DB.Conn(ctx)
	if err != nil {
		return budgetData{}, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "BEGIN"); err != nil {
		return budgetData{}, err
	}
	defer conn.ExecContext(context.Background(), "ROLLBACK")
	return calculateBudget(ctx, budgetQuery{ctx, conn}, from, to)
}

type budgetQuery struct {
	ctx  context.Context
	conn *sql.Conn
}

func (q budgetQuery) Exec(statement string, args ...any) (sql.Result, error) {
	return q.conn.ExecContext(q.ctx, statement, args...)
}
func (q budgetQuery) Query(statement string, args ...any) (*sql.Rows, error) {
	return q.conn.QueryContext(q.ctx, statement, args...)
}
func (q budgetQuery) QueryRow(statement string, args ...any) *sql.Row {
	return q.conn.QueryRowContext(q.ctx, statement, args...)
}

func calculateBudget(ctx context.Context, q store.Querier, from, to time.Time) (budgetData, error) {
	var result budgetData
	type key struct {
		payment int64
		due     string
	}
	type recorded struct {
		amount   int64
		currency string
		paid     bool
		removed  bool
	}
	occurrences := map[key]recorded{}
	rows, err := q.Query("SELECT o.recurring_payment_id,o.due_date,o.amount_cents,o.currency,o.paid_at IS NOT NULL,o.removed_at IS NOT NULL OR r.removed_at IS NOT NULL FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.due_date>=? AND o.due_date<=?",
		schedule.FormatDate(from), schedule.FormatDate(to))
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var k key
		var o recorded
		if err := rows.Scan(&k.payment, &k.due, &o.amount, &o.currency, &o.paid, &o.removed); err != nil {
			rows.Close()
			return result, err
		}
		occurrences[k] = o
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return result, err
	}
	rows.Close()

	categories := map[int64]string{}
	catRows, err := q.Query("SELECT id,COALESCE(category,'') FROM recurring_payments")
	if err != nil {
		return result, err
	}
	for catRows.Next() {
		var id int64
		var c string
		if err := catRows.Scan(&id, &c); err != nil {
			catRows.Close()
			return result, err
		}
		categories[id] = c
	}
	if err := catRows.Err(); err != nil {
		catRows.Close()
		return result, err
	}
	catRows.Close()

	plans, err := schedule.LoadPlans(q, "active=1")
	if err != nil {
		return result, err
	}
	pauses, err := schedule.LoadPauses(q)
	if err != nil {
		return result, err
	}
	months := make([]budgetBook, 12)
	for i := range months {
		months[i] = budgetBook{}
	}
	total, byCategory := budgetBook{}, map[string]budgetBook{}
	count := func(payment int64, due time.Time, amount int64, currency string, paid bool) {
		var paidAmount int64
		if paid {
			paidAmount = amount
		}
		months[due.Month()-1].add(currency, amount, paidAmount)
		total.add(currency, amount, paidAmount)
		category := categories[payment]
		if byCategory[category] == nil {
			byCategory[category] = budgetBook{}
		}
		byCategory[category].add(currency, amount, paidAmount)
	}
	// Active payments: every projected date; a recorded period supplies its own amount and payment.
	for _, p := range plans {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		for _, due := range schedule.ProjectedDates(p, pauses[p.ID], from, to) {
			k := key{p.ID, schedule.FormatDate(due)}
			if o, ok := occurrences[k]; ok {
				if !o.removed {
					count(p.ID, due, o.amount, o.currency, o.paid)
				}
				delete(occurrences, k)
			} else {
				count(p.ID, due, p.Amount, p.Currency, false)
			}
		}
	}
	// Whatever is left (archived payments, history) counts as recorded.
	for k, o := range occurrences {
		if o.removed {
			continue
		}
		due, _ := schedule.ParseDate(k.due)
		count(k.payment, due, o.amount, o.currency, o.paid)
	}

	return budgetData{months: months, total: total, byCategory: byCategory}, nil
}
