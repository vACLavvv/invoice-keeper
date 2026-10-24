package app

import (
	"database/sql"
	"strconv"
	"time"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
)

type Occurrence struct {
	ID                 int64       `json:"id"`
	RecurringPaymentID int64       `json:"recurring_payment_id"`
	Title              string      `json:"title"`
	Amount             string      `json:"amount"`
	Currency           string      `json:"currency"`
	DueDate            string      `json:"due_date"`
	PaidAt             *string     `json:"paid_at"`
	Status             string      `json:"status"`
	DaysOverdue        int         `json:"days_overdue"`
	IsLate             bool        `json:"is_late"`
	Active             bool        `json:"active"`
	UpdatedBy          *string     `json:"updated_by"`
	Frequency          string      `json:"frequency"`
	Category           *string     `json:"category"`
	Assignee           *Person     `json:"assignee"`
	Receipts           int         `json:"receipts"`
	PaymentURL         *string     `json:"payment_url"`
	PaymentDetails     *string     `json:"payment_details"`
	Description        *string     `json:"description"`
	Wallet             *walletInfo `json:"wallet"`

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
r.payment_url,r.payment_details,r.description,r.wallet_network,r.wallet_address,x.sdn_name,x.currency,x.sdn_uid,EXISTS(SELECT 1 FROM sanctioned_addresses)
FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id LEFT JOIN users u ON u.id=r.assignee_id
LEFT JOIN sanctioned_addresses x ON x.address_key=r.wallet_key`

type scanner interface{ Scan(dest ...any) error }

// scanOccurrence derives status and lateness from the two dates; nothing derived is stored.
func scanOccurrence(row scanner, today time.Time) (Occurrence, error) {
	var o Occurrence
	var paid, updatedBy, category, assigneeName, assigneeLogin sql.NullString
	var walletNetwork, walletAddress, sdnName, sdnCurrency sql.NullString
	var assigneeID, sdnUID sql.NullInt64
	var listLoaded bool
	if err := row.Scan(&o.ID, &o.RecurringPaymentID, &o.Title, &o.amountCents, &o.Currency, &o.DueDate, &paid, &o.Active, &updatedBy,
		&o.Frequency, &category, &assigneeID, &assigneeName, &assigneeLogin, &o.Receipts, &o.PaymentURL, &o.PaymentDetails, &o.Description,
		&walletNetwork, &walletAddress, &sdnName, &sdnCurrency, &sdnUID, &listLoaded); err != nil {
		return o, err
	}
	o.Wallet = makeWallet(walletNetwork, walletAddress, sdnName, sdnCurrency, sdnUID, listLoaded)
	if err := security.DecryptNullable("recurring_payments.payment_details", &o.PaymentDetails); err != nil {
		return o, err
	}
	if category.Valid {
		o.Category = &category.String
	}
	if assigneeID.Valid {
		o.Assignee = &Person{ID: assigneeID.Int64, DisplayName: assigneeName.String, Username: assigneeLogin.String}
	}
	due, err := schedule.ParseDate(o.DueDate)
	if err != nil {
		return o, err
	}
	o.Amount = schedule.Money(o.amountCents)
	reference := today
	switch {
	case paid.Valid:
		o.PaidAt = &paid.String
		paidAt, err := schedule.ParseDate(paid.String)
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

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
