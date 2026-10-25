package app

import (
	"database/sql"
	"errors"
	"net/http"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
)

// Removal is separate from archiving. Keep rows (including skipped future dates),
// IDs, receipts and payment dates so undo is lossless and materialization cannot
// recreate a deleted period. The public readers exclude removed rows.
func (s *Server) recurringRemove(w http.ResponseWriter, r *http.Request) error {
	return s.changeRecurringRemoval(w, r, true)
}

func (s *Server) recurringRestore(w http.ResponseWriter, r *http.Request) error {
	return s.changeRecurringRemoval(w, r, false)
}

func (s *Server) changeRecurringRemoval(w http.ResponseWriter, r *http.Request, remove bool) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	err = s.paymentWrite(w, r, 204, nil, func(tx *sql.Tx) error {
		var removed bool
		err := tx.QueryRow("SELECT removed_at IS NOT NULL FROM recurring_payments WHERE id=?", id).Scan(&removed)
		if errors.Is(err, sql.ErrNoRows) {
			return fail(404, "Платёж не найден")
		}
		if err != nil || removed == remove {
			return err
		}
		var at any
		action := "recurring.restore"
		if remove {
			at, action = schedule.Timestamp(), "recurring.delete"
		}
		if _, err := tx.Exec("UPDATE recurring_payments SET removed_at=? WHERE id=?", at, id); err != nil {
			return err
		}
		if err := s.removalReminders(tx, id, 0, remove); err != nil {
			return err
		}
		return audit.Record(tx, user.Username, action, id)
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return noContent(w)
}

func (s *Server) periodDelete(w http.ResponseWriter, r *http.Request) error {
	return s.changePeriodRemoval(w, r, true)
}

func (s *Server) periodRestore(w http.ResponseWriter, r *http.Request) error {
	return s.changePeriodRemoval(w, r, false)
}

func (s *Server) changePeriodRemoval(w http.ResponseWriter, r *http.Request, remove bool) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	due, err := schedule.ParseDate(r.PathValue("due_date"))
	invalidDate := func(message string) error {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"path", "due_date"}, Msg: message, Type: "value_error"}}}
	}
	if err != nil || due.Year() < 2000 || due.Year() > 2100 {
		return invalidDate("Ожидается дата от 2000 до 2100 года в формате ГГГГ-ММ-ДД")
	}
	err = s.paymentWrite(w, r, 204, nil, func(tx *sql.Tx) error {
		payment, err := s.findRecurring(tx, id)
		if err != nil {
			return err
		}
		var occurrenceID int64
		var removed bool
		err = tx.QueryRow("SELECT id,removed_at IS NOT NULL FROM payment_occurrences WHERE recurring_payment_id=? AND due_date=?",
			id, schedule.FormatDate(due)).Scan(&occurrenceID, &removed)
		if errors.Is(err, sql.ErrNoRows) {
			if !remove {
				return fail(404, "Период не найден")
			}
			if !payment.Active {
				return fail(409, "Платёж в архиве")
			}
			if due.Before(s.Today()) || due.After(s.Today().AddDate(periodsAhead, 0, 0)) {
				return invalidDate("Будущий период — от сегодняшнего дня до трёх лет вперёд")
			}
			plan, err := planOf(payment)
			if err != nil {
				return err
			}
			if len(schedule.ProjectedDates(plan, nil, due, due)) == 0 {
				return invalidDate("Такого срока нет в графике платежа")
			}
			pauses, err := schedule.LoadPauses(tx)
			if err != nil {
				return err
			}
			if schedule.IsPaused(pauses[id], due) {
				return fail(409, "Срок попадает на паузу платежа")
			}
			result, err := tx.Exec(`INSERT INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency)
				SELECT id,?,amount_cents,currency FROM recurring_payments WHERE id=?`, schedule.FormatDate(due), id)
			if err != nil {
				return err
			}
			if occurrenceID, err = result.LastInsertId(); err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else if removed == remove {
			return nil
		}
		var at any
		action := "occurrence.restore"
		if remove {
			at, action = schedule.Timestamp(), "occurrence.delete"
		}
		if _, err := tx.Exec("UPDATE payment_occurrences SET removed_at=? WHERE id=?", at, occurrenceID); err != nil {
			return err
		}
		if err := s.removalReminders(tx, id, occurrenceID, remove); err != nil {
			return err
		}
		return audit.Record(tx, user.Username, action, occurrenceID)
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return noContent(w)
}

// Only unsent notifications are cancelled/re-enabled; sent and uncertain ones
// are retained so restoring a payment cannot send them twice.
func (s *Server) removalReminders(tx *sql.Tx, paymentID, occurrenceID int64, remove bool) error {
	// occurrenceID=0 selects the whole schedule. All identifiers are bound values.
	const selected = `(SELECT id FROM payment_occurrences WHERE recurring_payment_id=? AND (?=0 OR id=?))`
	if remove {
		for _, statement := range []string{
			"UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN " + selected,
			"UPDATE deliveries SET state='cancelled' WHERE state='pending' AND occurrence_id IN " + selected,
		} {
			if _, err := tx.Exec(statement, paymentID, occurrenceID, occurrenceID); err != nil {
				return err
			}
		}
		return nil
	}
	// The legacy Telegram worker re-enables eligible cancelled reminders itself.
	_, err := tx.Exec(`UPDATE deliveries SET state='pending' WHERE state='cancelled' AND occurrence_id IN `+selected+`
  AND occurrence_id IN (SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
  WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL
  AND ((kind='due' AND o.due_date>=? AND o.due_date<=?) OR (kind='overdue' AND o.due_date>=? AND o.due_date<?)))`,
		paymentID, occurrenceID, occurrenceID, schedule.FormatDate(s.Today()), schedule.FormatDate(s.Today().AddDate(0, 0, 3)),
		schedule.FormatDate(s.Today().AddDate(0, 0, -7)), schedule.FormatDate(s.Today()))
	return err
}
