package app

import (
	"net/http"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

func (s *Server) paymentOverview(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	if err := s.ensureMaterialized(); err != nil {
		return err
	}
	result := struct {
		Counts struct {
			Open       int `json:"open"`
			Overdue    int `json:"overdue"`
			Soon       int `json:"soon"`
			Once       int `json:"once"`
			Urgent     int `json:"urgent"`
			MonthPaid  int `json:"month_paid"`
			MonthTotal int `json:"month_total"`
		} `json:"counts"`
		Queues struct {
			Week []Occurrence `json:"week"`
			All  []Occurrence `json:"all"`
			Once []Occurrence `json:"once"`
		} `json:"queues"`
		Later  []Occurrence `json:"later"`
		Recent []Occurrence `json:"recent"`
	}{}
	today := s.Today()
	day := schedule.FormatDate(today)
	soon := schedule.FormatDate(today.AddDate(0, 0, 7))
	urgent := soon
	month := today.Format("2006-01")
	err := s.readSnapshot(r.Context(), func(q store.Querier) error {
		query := `SELECT
   COALESCE(SUM(CASE WHEN r.active=1 AND o.paid_at IS NULL THEN 1 ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN r.active=1 AND o.paid_at IS NULL AND o.due_date<? THEN 1 ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN r.active=1 AND o.paid_at IS NULL AND o.due_date>=? AND o.due_date<=? THEN 1 ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN r.active=1 AND o.paid_at IS NULL AND r.frequency='once' THEN 1 ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN r.active=1 AND o.paid_at IS NULL AND o.due_date<=? THEN 1 ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN o.paid_at IS NOT NULL AND substr(o.due_date,1,7)=? THEN 1 ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN substr(o.due_date,1,7)=? THEN 1 ELSE 0 END),0)
   FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
   WHERE r.removed_at IS NULL AND o.removed_at IS NULL`
		if err := q.QueryRow(query, day, day, soon, urgent, month, month).Scan(&result.Counts.Open, &result.Counts.Overdue, &result.Counts.Soon, &result.Counts.Once, &result.Counts.Urgent, &result.Counts.MonthPaid, &result.Counts.MonthTotal); err != nil {
			return err
		}
		var err error
		base := " WHERE r.active=1 AND o.paid_at IS NULL"
		result.Queues.All, err = s.occurrenceRows(q, base+" ORDER BY o.due_date,o.id LIMIT 5")
		if err != nil {
			return err
		}
		result.Queues.Week, err = s.occurrenceRows(q, base+" AND o.due_date<=? ORDER BY o.due_date,o.id LIMIT 5", soon)
		if err != nil {
			return err
		}
		result.Queues.Once, err = s.occurrenceRows(q, base+" AND r.frequency='once' ORDER BY o.due_date,o.id LIMIT 5")
		if err != nil {
			return err
		}
		result.Later, err = s.occurrenceRows(q, base+" AND o.due_date>? ORDER BY o.due_date,o.id LIMIT 3", soon)
		if err != nil {
			return err
		}
		result.Recent, err = s.occurrenceRows(q, " WHERE o.paid_at IS NOT NULL ORDER BY o.paid_at DESC,o.id DESC LIMIT 3")
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}
