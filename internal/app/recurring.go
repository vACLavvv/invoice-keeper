package app

import (
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"time"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/wallet"
)

// --- recurring payments: create, edit, pause, archive ---

type pauseInfo struct {
	From  string  `json:"from"`
	Until *string `json:"until"`
}

type recurringItem struct {
	ID             int64       `json:"id"`
	Title          string      `json:"title"`
	Amount         string      `json:"amount"`
	Currency       string      `json:"currency"`
	FirstDueDate   string      `json:"first_due_date"`
	AnchorDay      int         `json:"anchor_day"`
	Frequency      string      `json:"frequency"`
	Category       *string     `json:"category"`
	Assignee       *Person     `json:"assignee"`
	PaymentURL     *string     `json:"payment_url"`
	PaymentDetails *string     `json:"payment_details"`
	Description    *string     `json:"description"`
	Wallet         *walletInfo `json:"wallet"`
	Active         bool        `json:"active"`
	Paused         *pauseInfo  `json:"paused"`
	NextDueDate    *string     `json:"next_due_date"`
	UnpaidCount    int         `json:"unpaid_count"`
	CreatedAt      string      `json:"created_at"`
	DeletedAt      *string     `json:"deleted_at"`
}

const recurringSelect = `SELECT r.id,r.title,r.amount_cents,r.currency,r.first_due_date,r.anchor_day,r.frequency,r.category,
u.id,u.display_name,u.username,r.payment_url,r.payment_details,r.description,
r.wallet_network,r.wallet_address,x.sdn_name,x.currency,x.sdn_uid,EXISTS(SELECT 1 FROM sanctioned_addresses),
r.active,r.created_at,r.deleted_at,
(SELECT COUNT(*) FROM payment_occurrences o WHERE o.recurring_payment_id=r.id AND o.removed_at IS NULL AND o.paid_at IS NULL),
(SELECT MIN(o.due_date) FROM payment_occurrences o WHERE o.recurring_payment_id=r.id AND o.removed_at IS NULL AND o.paid_at IS NULL AND o.due_date>=?)
FROM (SELECT * FROM recurring_payments WHERE removed_at IS NULL) r LEFT JOIN users u ON u.id=r.assignee_id LEFT JOIN sanctioned_addresses x ON x.address_key=r.wallet_key`

// activePause is the pause in force today or later: open-ended or ending today or later.
func activePause(pauses []schedule.Pause, today time.Time) *schedule.Pause {
	for i := len(pauses) - 1; i >= 0; i-- {
		if pauses[i].Until == nil || !pauses[i].Until.Before(today) {
			return &pauses[i]
		}
	}
	return nil
}

func (s *Server) loadRecurring(q store.Querier, where string, args ...any) ([]recurringItem, error) {
	today := s.Today()
	pauses, err := schedule.LoadPauses(q)
	if err != nil {
		return nil, err
	}
	rows, err := q.Query(recurringSelect+where, append([]any{schedule.FormatDate(today)}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []recurringItem{}
	for rows.Next() {
		var item recurringItem
		var cents int64
		var category, deleted, assigneeName, assigneeLogin, next sql.NullString
		var walletNetwork, walletAddress, sdnName, sdnCurrency sql.NullString
		var assigneeID, sdnUID sql.NullInt64
		var listLoaded bool
		if err := rows.Scan(&item.ID, &item.Title, &cents, &item.Currency, &item.FirstDueDate, &item.AnchorDay, &item.Frequency, &category,
			&assigneeID, &assigneeName, &assigneeLogin, &item.PaymentURL, &item.PaymentDetails, &item.Description,
			&walletNetwork, &walletAddress, &sdnName, &sdnCurrency, &sdnUID, &listLoaded, &item.Active, &item.CreatedAt, &deleted, &item.UnpaidCount, &next); err != nil {
			return nil, err
		}
		item.Amount = schedule.Money(cents)
		if err := security.DecryptNullable("recurring_payments.payment_details", &item.PaymentDetails); err != nil {
			return nil, err
		}
		item.Wallet = makeWallet(walletNetwork, walletAddress, sdnName, sdnCurrency, sdnUID, listLoaded)
		if category.Valid {
			item.Category = &category.String
		}
		if assigneeID.Valid {
			item.Assignee = &Person{ID: assigneeID.Int64, DisplayName: assigneeName.String, Username: assigneeLogin.String}
		}
		if deleted.Valid {
			item.DeletedAt = &deleted.String
		}
		if next.Valid {
			item.NextDueDate = &next.String
		}
		if p := activePause(pauses[item.ID], today); p != nil && item.Active {
			info := &pauseInfo{From: schedule.FormatDate(p.From)}
			if p.Until != nil {
				until := schedule.FormatDate(*p.Until)
				info.Until = &until
			}
			item.Paused = info
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) recurringList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	var items []recurringItem
	err := s.DB.Write(func(tx *sql.Tx) error {
		if err := schedule.Materialize(tx, s.Today()); err != nil {
			return err
		}
		var err error
		items, err = s.loadRecurring(tx, " ORDER BY r.active DESC,r.id DESC")
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

func (s *Server) findRecurring(q store.Querier, id int64) (recurringItem, error) {
	items, err := s.loadRecurring(q, " WHERE r.id=?", id)
	if err != nil {
		return recurringItem{}, err
	}
	if len(items) == 0 {
		return recurringItem{}, fail(404, "Регулярный платёж не найден")
	}
	return items[0], nil
}

// recurringInput is a validated new payment.
type recurringInput struct {
	title, currency, frequency   string
	cents                        int64
	due                          time.Time
	category                     *string
	assigneeID                   *int64
	paymentURL, paymentDetails   *string
	description                  *string
	walletNetwork, walletAddress *string
}

// extraFields validates frequency, category and assignee shared by create, edit and CSV import.
func extraFields(f *form) (frequency *string, category *string, assignee *int64) {
	frequency = f.text("frequency", textRule{max: 16})
	if f.has("frequency") && (frequency == nil || !slices.Contains(schedule.Frequencies, *frequency)) {
		f.add("frequency", "Допустимые значения: monthly, quarterly, yearly, once", "literal_error")
	}
	category = f.text("category", textRule{trim: true, max: 40})
	assignee = f.integer("assignee_id")
	return
}

// sealedDetails encrypts payment details (bank requisites) for storage.
func sealedDetails(details *string) *string {
	if details == nil {
		return nil
	}
	sealed := security.EncryptText("recurring_payments.payment_details", *details)
	return &sealed
}

// auditSanctioned records that a payment was saved with a wallet from the OFAC list.
func auditSanctioned(q store.Querier, actor string, item recurringItem) error {
	if item.Wallet == nil || item.Wallet.Sanctioned == nil || !*item.Wallet.Sanctioned {
		return nil
	}
	return audit.Record(q, actor, "wallet.sanctioned", item.ID)
}

// paymentLinkFields validates where to pay: a http(s) link to the bill or cabinet and free-form details.
func paymentLinkFields(f *form) (link *string, details *string) {
	link = f.text("payment_url", textRule{trim: true, max: 500})
	if link != nil && *link != "" && !isWebURL(*link) {
		f.add("payment_url", "Ссылка должна начинаться с http:// или https://", "url_scheme")
		link = nil
	}
	details = f.text("payment_details", textRule{trim: true, max: 500})
	return
}

func isWebURL(link string) bool {
	parsed, err := url.Parse(link)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

func checkAssignee(q store.Querier, id *int64) error {
	if id == nil {
		return nil
	}
	var found int
	if err := q.QueryRow("SELECT COUNT(*) FROM users WHERE id=?", *id).Scan(&found); err != nil {
		return err
	}
	if found == 0 {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "assignee_id"}, Msg: "Пользователь не найден", Type: "value_error"}}}
	}
	return nil
}

func nullableString(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

func nullableInt(n *int64) any {
	if n == nil {
		return nil
	}
	return *n
}

func (s *Server) recurringCreate(w http.ResponseWriter, r *http.Request) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	f, err := readForm(r, "title", "amount", "currency", "first_due_date", "frequency", "category", "assignee_id", "payment_url", "payment_details", "description",
		"wallet_network", "wallet_address")
	if err != nil {
		return err
	}
	f.require("title", "amount", "currency", "first_due_date")
	title, cents, currency, due := paymentFields(f, "first_due_date")
	frequency, category, assignee := extraFields(f)
	link, details := paymentLinkFields(f)
	walletNetwork, walletAddress := walletFields(f, "wallet_network", "wallet_address")
	description := f.text("description", textRule{trim: true, max: 500})
	if err := f.err(); err != nil {
		return err
	}
	input := recurringInput{title: *title, cents: cents, currency: *currency, due: *due, frequency: "monthly", category: category, assigneeID: assignee,
		paymentURL: link, paymentDetails: details, walletNetwork: walletNetwork, walletAddress: walletAddress, description: description}
	if frequency != nil {
		input.frequency = *frequency
	}
	var created recurringItem
	err = s.DB.Write(func(tx *sql.Tx) error {
		if err := checkAssignee(tx, assignee); err != nil {
			return err
		}
		id, err := s.createRecurring(tx, user.Username, input)
		if err != nil {
			return err
		}
		if created, err = s.findRecurring(tx, id); err != nil {
			return err
		}
		return auditSanctioned(tx, user.Username, created)
	})
	if err != nil {
		return err
	}
	// Added less than 3 days before the due date → the reminder is checked right away.
	s.Worker.Kick()
	return writeJSON(w, 201, created)
}

// createRecurring adds a payment and its periods; the caller kicks the reminder worker after commit.
func (s *Server) createRecurring(tx *sql.Tx, actor string, in recurringInput) (int64, error) {
	if in.frequency == "" {
		in.frequency = "monthly"
	}
	var walletKeyValue any
	if in.walletAddress != nil {
		walletKeyValue = wallet.Key(*in.walletAddress)
	}
	result, err := tx.Exec(`INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,frequency,category,assignee_id,
		payment_url,payment_details,wallet_network,wallet_address,wallet_key,description,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		in.title, in.cents, in.currency, schedule.FormatDate(in.due), in.due.Day(), in.frequency,
		nullableString(in.category), nullableInt(in.assigneeID), nullableString(in.paymentURL), nullableString(sealedDetails(in.paymentDetails)),
		nullableString(in.walletNetwork), nullableString(in.walletAddress), walletKeyValue, nullableString(in.description), schedule.Timestamp())
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := schedule.Materialize(tx, s.Today()); err != nil {
		return 0, err
	}
	return id, audit.Record(tx, actor, "recurring.create", id)
}

// recurringUpdate edits the title, category, assignee, payment link and details, or amount. A new amount applies to unpaid
// periods from today on; paid and past periods keep the amount they were due with.
func (s *Server) recurringUpdate(w http.ResponseWriter, r *http.Request) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	f, err := readForm(r, "title", "amount", "category", "assignee_id", "payment_url", "payment_details", "wallet_network", "wallet_address", "description")
	if err != nil {
		return err
	}
	title := f.text("title", textRule{trim: true, min: 1, max: 120})
	cents := f.amount("amount")
	_, category, assignee := extraFields(f)
	link, details := paymentLinkFields(f)
	walletNetwork, walletAddress := walletFields(f, "wallet_network", "wallet_address")
	description := f.text("description", textRule{trim: true, max: 500})
	if f.has("wallet_network") != f.has("wallet_address") {
		f.add("wallet_address", "Сеть и адрес кошелька меняются вместе", "value_error")
	}
	if len(f.values) == 0 {
		f.add("", "Укажите, что изменить", "value_error")
	}
	if f.isNull("title") || f.isNull("amount") {
		f.add("", "Название и сумма не могут быть пустыми", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	var updated recurringItem
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := s.findRecurring(tx, id); err != nil {
			return err
		}
		if err := checkAssignee(tx, assignee); err != nil {
			return err
		}
		set := func(query string, args ...any) error {
			_, err := tx.Exec(query, append(args, id)...)
			return err
		}
		if title != nil {
			if err := set("UPDATE recurring_payments SET title=? WHERE id=?", *title); err != nil {
				return err
			}
		}
		if f.has("category") {
			if err := set("UPDATE recurring_payments SET category=? WHERE id=?", nullableString(category)); err != nil {
				return err
			}
		}
		if f.has("assignee_id") {
			if err := set("UPDATE recurring_payments SET assignee_id=? WHERE id=?", nullableInt(assignee)); err != nil {
				return err
			}
		}
		if f.has("payment_url") {
			if err := set("UPDATE recurring_payments SET payment_url=? WHERE id=?", nullableString(link)); err != nil {
				return err
			}
		}
		if f.has("payment_details") {
			if err := set("UPDATE recurring_payments SET payment_details=? WHERE id=?", nullableString(sealedDetails(details))); err != nil {
				return err
			}
		}
		if f.has("description") {
			if err := set("UPDATE recurring_payments SET description=? WHERE id=?", nullableString(description)); err != nil {
				return err
			}
		}
		if f.has("wallet_address") {
			var key any
			if walletAddress != nil {
				key = wallet.Key(*walletAddress)
			}
			if err := set("UPDATE recurring_payments SET wallet_network=?,wallet_address=?,wallet_key=? WHERE id=?",
				nullableString(walletNetwork), nullableString(walletAddress), key); err != nil {
				return err
			}
		}
		if cents > 0 {
			if err := set("UPDATE recurring_payments SET amount_cents=? WHERE id=?", cents); err != nil {
				return err
			}
			if _, err := tx.Exec("UPDATE payment_occurrences SET amount_cents=? WHERE recurring_payment_id=? AND paid_at IS NULL AND due_date>=?",
				cents, id, schedule.FormatDate(s.Today())); err != nil {
				return err
			}
		}
		if err := audit.Record(tx, user.Username, "recurring.update", id); err != nil {
			return err
		}
		if updated, err = s.findRecurring(tx, id); err != nil {
			return err
		}
		if f.has("wallet_address") {
			return auditSanctioned(tx, user.Username, updated)
		}
		return nil
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, updated)
}

func (s *Server) recurringDelete(w http.ResponseWriter, r *http.Request) error {
	q := &queryParams{values: r.URL.Query()}
	mode := q.choice("mode", "archive", "delete")
	if err := q.err(); err != nil {
		return err
	}
	if mode == "delete" {
		return s.recurringRemove(w, r)
	}
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		var active bool
		err := tx.QueryRow("SELECT active FROM recurring_payments WHERE id=? AND removed_at IS NULL", id).Scan(&active)
		if errors.Is(err, sql.ErrNoRows) {
			return fail(404, "Регулярный платёж не найден")
		}
		if err != nil || !active {
			return err
		}
		if _, err := tx.Exec("UPDATE recurring_payments SET active=0,deleted_at=? WHERE id=?", schedule.Timestamp(), id); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN (SELECT id FROM payment_occurrences WHERE recurring_payment_id=?)", id); err != nil {
			return err
		}
		return audit.Record(tx, user.Username, "recurring.archive", id)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// recurringPause stops new periods and reminders from today until a date or until resumed.
// Unpaid periods already created inside the pause are removed; paid ones and history stay.
func (s *Server) recurringPause(w http.ResponseWriter, r *http.Request) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	f, err := readOptionalForm(r, "until")
	if err != nil {
		return err
	}
	until := f.date("until")
	today := s.Today()
	if until != nil && until.Before(today) {
		f.add("until", "Пауза не может закончиться в прошлом", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	var updated recurringItem
	err = s.DB.Write(func(tx *sql.Tx) error {
		current, err := s.findRecurring(tx, id)
		if err != nil {
			return err
		}
		if !current.Active {
			return fail(409, "Платёж в архиве")
		}
		if current.Paused != nil {
			return fail(409, "Платёж уже на паузе")
		}
		if current.Frequency == schedule.Once {
			return fail(409, "Разовый платёж нельзя поставить на паузу: перенесите срок или прекратите платёж")
		}
		var untilValue any
		if until != nil {
			untilValue = schedule.FormatDate(*until)
		}
		if _, err := tx.Exec("INSERT INTO payment_pauses(recurring_payment_id,from_date,until_date,created_by,created_at) VALUES(?,?,?,?,?)",
			id, schedule.FormatDate(today), untilValue, user.Username, schedule.Timestamp()); err != nil {
			return err
		}
		inPause := `SELECT o.id FROM payment_occurrences o WHERE o.recurring_payment_id=? AND o.removed_at IS NULL AND o.paid_at IS NULL AND o.due_date>=?
			AND (? IS NULL OR o.due_date<=?) AND NOT EXISTS (SELECT 1 FROM receipts x WHERE x.occurrence_id=o.id)`
		args := []any{id, schedule.FormatDate(today), untilValue, untilValue}
		for _, table := range []string{"reminders", "personal_reminders"} {
			if _, err := tx.Exec("DELETE FROM "+table+" WHERE occurrence_id IN ("+inPause+")", args...); err != nil { // #nosec G202 -- table is one of two constant names, values are parameters
				return err
			}
		}
		if _, err := tx.Exec("DELETE FROM payment_occurrences WHERE id IN ("+inPause+")", args...); err != nil {
			return err
		}
		if err := audit.Record(tx, user.Username, "recurring.pause", id); err != nil {
			return err
		}
		if err := schedule.Materialize(tx, today); err != nil {
			return err
		}
		updated, err = s.findRecurring(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, updated)
}

// recurringResume ends the pause yesterday: periods from today on are created again,
// while the months skipped during the pause never become overdue.
func (s *Server) recurringResume(w http.ResponseWriter, r *http.Request) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "payment_id")
	if err != nil {
		return err
	}
	today := s.Today()
	var updated recurringItem
	err = s.DB.Write(func(tx *sql.Tx) error {
		current, err := s.findRecurring(tx, id)
		if err != nil {
			return err
		}
		if current.Paused == nil {
			return fail(409, "Платёж не на паузе")
		}
		yesterday := schedule.FormatDate(today.AddDate(0, 0, -1))
		if current.Paused.From > yesterday {
			_, err = tx.Exec("DELETE FROM payment_pauses WHERE recurring_payment_id=? AND from_date=?", id, current.Paused.From)
		} else {
			_, err = tx.Exec("UPDATE payment_pauses SET until_date=? WHERE recurring_payment_id=? AND from_date=?", yesterday, id, current.Paused.From)
		}
		if err != nil {
			return err
		}
		if err := audit.Record(tx, user.Username, "recurring.resume", id); err != nil {
			return err
		}
		if err := schedule.Materialize(tx, today); err != nil {
			return err
		}
		updated, err = s.findRecurring(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return writeJSON(w, 200, updated)
}
