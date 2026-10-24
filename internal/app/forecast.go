package app

// Paying ahead: periods are created only through the end of next month, so later due dates are
// projected from each payment's schedule and a chosen one can be created (and paid) early.

import (
	"database/sql"
	"net/http"
	"sort"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
)

// forecastPeriod is a scheduled due date that has no payment period yet.
type forecastPeriod struct {
	RecurringPaymentID int64       `json:"recurring_payment_id"`
	Title              string      `json:"title"`
	Amount             string      `json:"amount"`
	Currency           string      `json:"currency"`
	DueDate            string      `json:"due_date"`
	Frequency          string      `json:"frequency"`
	Category           *string     `json:"category"`
	Assignee           *Person     `json:"assignee"`
	PaymentURL         *string     `json:"payment_url"`
	PaymentDetails     *string     `json:"payment_details"`
	Wallet             *walletInfo `json:"wallet"`
	Description        *string     `json:"description"`
}

// periodsAhead limits how far ahead a period can be created.
const periodsAhead = 3

func planOf(item recurringItem) (schedule.Plan, error) {
	first, err := schedule.ParseDate(item.FirstDueDate)
	return schedule.Plan{ID: item.ID, Anchor: int64(item.AnchorDay), First: first, Frequency: item.Frequency}, err
}

func (s *Server) forecast(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	q := &queryParams{values: r.URL.Query()}
	from, to := parseRange(q)
	if from == nil && !q.values.Has("from_date") {
		q.add("from_date", "Обязательный параметр", "missing")
	}
	if to == nil && !q.values.Has("to_date") {
		q.add("to_date", "Обязательный параметр", "missing")
	}
	if from != nil && to != nil && to.Sub(*from).Hours()/24 > 366 {
		q.add("to_date", "Диапазон — не больше 366 дней", "value_error")
	}
	if err := q.err(); err != nil {
		return err
	}
	items := []forecastPeriod{}
	err := s.DB.Write(func(tx *sql.Tx) error {
		if err := schedule.Materialize(tx, s.Today()); err != nil {
			return err
		}
		payments, err := s.loadRecurring(tx, " WHERE r.active=1")
		if err != nil {
			return err
		}
		pauses, err := schedule.LoadPauses(tx)
		if err != nil {
			return err
		}
		rows, err := tx.Query("SELECT recurring_payment_id,due_date FROM payment_occurrences WHERE due_date BETWEEN ? AND ?",
			schedule.FormatDate(*from), schedule.FormatDate(*to))
		if err != nil {
			return err
		}
		defer rows.Close()
		type key struct {
			payment int64
			due     string
		}
		recorded := map[key]bool{}
		for rows.Next() {
			var k key
			if err := rows.Scan(&k.payment, &k.due); err != nil {
				return err
			}
			recorded[k] = true
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for _, p := range payments {
			plan, err := planOf(p)
			if err != nil {
				return err
			}
			for _, due := range schedule.ProjectedDates(plan, pauses[p.ID], *from, *to) {
				date := schedule.FormatDate(due)
				if recorded[key{p.ID, date}] {
					continue
				}
				items = append(items, forecastPeriod{RecurringPaymentID: p.ID, Title: p.Title, Amount: p.Amount, Currency: p.Currency,
					DueDate: date, Frequency: p.Frequency, Category: p.Category, Assignee: p.Assignee, PaymentURL: p.PaymentURL,
					PaymentDetails: p.PaymentDetails, Wallet: p.Wallet, Description: p.Description})
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].DueDate < items[j].DueDate })
	return writeJSON(w, 200, items)
}

// periodCreate creates the period of a scheduled due date ahead of time, paid when paid_at is given.
func (s *Server) periodCreate(w http.ResponseWriter, r *http.Request) error {
	user, err := s.writeUser(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	f, err := readForm(r, "due_date", "paid_at")
	if err != nil {
		return err
	}
	f.require("due_date")
	due, paidAt := f.date("due_date"), f.date("paid_at")
	if due == nil && f.isNull("due_date") {
		f.add("due_date", "Обязательное поле", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	today := s.Today()
	switch {
	case due.Before(today):
		f.add("due_date", "Срок уже прошёл: такой период создаётся сам", "value_error")
	case due.After(today.AddDate(periodsAhead, 0, 0)):
		f.add("due_date", "Заранее — не больше чем на три года", "value_error")
	}
	if paidAt != nil && paidAt.After(today) {
		f.add("paid_at", "Фактическая дата оплаты не может быть в будущем", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	var created Occurrence
	err = s.DB.Write(func(tx *sql.Tx) error {
		payment, err := s.findRecurring(tx, id)
		if err != nil {
			return err
		}
		if !payment.Active {
			return fail(409, "Платёж в архиве")
		}
		if err := schedule.Materialize(tx, today); err != nil {
			return err
		}
		plan, err := planOf(payment)
		if err != nil {
			return err
		}
		pauses, err := schedule.LoadPauses(tx)
		if err != nil {
			return err
		}
		if len(schedule.ProjectedDates(plan, nil, *due, *due)) == 0 {
			return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "due_date"}, Msg: "Такого срока нет в графике платежа", Type: "value_error"}}}
		}
		if schedule.IsPaused(pauses[id], *due) {
			return fail(409, "Срок попадает на паузу платежа")
		}
		var paid any
		if paidAt != nil {
			paid = schedule.FormatDate(*paidAt)
		}
		var cents int64
		if err := tx.QueryRow("SELECT amount_cents FROM recurring_payments WHERE id=?", id).Scan(&cents); err != nil {
			return err
		}
		result, err := tx.Exec("INSERT OR IGNORE INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency,paid_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)",
			id, schedule.FormatDate(*due), cents, payment.Currency, paid, user.Username, schedule.Timestamp())
		if err != nil {
			return err
		}
		if n, _ := result.RowsAffected(); n == 0 {
			return fail(409, "Этот период уже есть в календаре")
		}
		occurrenceID, err := result.LastInsertId()
		if err != nil {
			return err
		}
		action := "occurrence.create"
		if paid != nil {
			action = "occurrence.prepaid"
		}
		if err := audit.Record(tx, user.Username, action, occurrenceID); err != nil {
			return err
		}
		created, err = s.findOccurrence(tx, occurrenceID)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return writeJSON(w, 201, created)
}
