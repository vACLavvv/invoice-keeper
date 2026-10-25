package app

import (
	"net/http"

	"invoice-keeper/internal/app/schedule"
)

type deletedPayment struct {
	Kind               string  `json:"kind"`
	RecurringPaymentID int64   `json:"recurring_payment_id"`
	Title              string  `json:"title"`
	Amount             string  `json:"amount"`
	Currency           string  `json:"currency"`
	DueDate            *string `json:"due_date"`
	PaidAt             *string `json:"paid_at"`
	RemovedAt          string  `json:"removed_at"`
	Active             bool    `json:"active"`
}

// A removed schedule represents all its periods. Individually removed periods
// become visible again after restoring their parent, and stay removed until
// explicitly restored. No financial or receipt data is lost by either action.
func (s *Server) deletedPaymentList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query(`SELECT 'payment',id,title,amount_cents,currency,NULL,NULL,removed_at,active
FROM recurring_payments WHERE removed_at IS NOT NULL
UNION ALL
SELECT 'period',r.id,r.title,o.amount_cents,o.currency,o.due_date,o.paid_at,o.removed_at,r.active
FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
WHERE o.removed_at IS NOT NULL AND r.removed_at IS NULL
ORDER BY 8 DESC,2 DESC,6 DESC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []deletedPayment{}
	for rows.Next() {
		var item deletedPayment
		var cents int64
		if err := rows.Scan(&item.Kind, &item.RecurringPaymentID, &item.Title, &cents,
			&item.Currency, &item.DueDate, &item.PaidAt, &item.RemovedAt, &item.Active); err != nil {
			return err
		}
		item.Amount = schedule.Money(cents)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}
