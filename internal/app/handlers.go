package app

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
)

var currencies = []string{"RUB", "USD", "EUR"}

// --- recurring payments ---

type recurringItem struct {
	ID           int64   `json:"id"`
	Title        string  `json:"title"`
	Amount       string  `json:"amount"`
	Currency     string  `json:"currency"`
	FirstDueDate string  `json:"first_due_date"`
	AnchorDay    int     `json:"anchor_day"`
	Frequency    string  `json:"frequency"`
	Active       bool    `json:"active"`
	UnpaidCount  int     `json:"unpaid_count"`
	CreatedAt    string  `json:"created_at"`
	DeletedAt    *string `json:"deleted_at"`
}

func (s *Server) recurringList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	items := []recurringItem{}
	err := s.DB.Write(func(tx *sql.Tx) error {
		if err := materialize(tx, s.Today()); err != nil {
			return err
		}
		rows, err := tx.Query(`SELECT r.id,r.title,r.amount_cents,r.currency,r.first_due_date,r.anchor_day,r.active,r.created_at,r.deleted_at,
			(SELECT COUNT(*) FROM payment_occurrences o WHERE o.recurring_payment_id=r.id AND o.paid_at IS NULL)
			FROM recurring_payments r ORDER BY r.active DESC,r.id DESC`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			item := recurringItem{Frequency: "monthly"}
			var cents int64
			var deleted sql.NullString
			if err := rows.Scan(&item.ID, &item.Title, &cents, &item.Currency, &item.FirstDueDate, &item.AnchorDay, &item.Active,
				&item.CreatedAt, &deleted, &item.UnpaidCount); err != nil {
				return err
			}
			item.Amount = money(cents)
			if deleted.Valid {
				item.DeletedAt = &deleted.String
			}
			items = append(items, item)
		}
		return rows.Err()
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

func (s *Server) recurringCreate(w http.ResponseWriter, r *http.Request) error {
	user, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	f, err := readForm(r, "title", "amount", "currency", "first_due_date", "frequency")
	if err != nil {
		return err
	}
	f.require("title", "amount", "currency", "first_due_date")
	title := f.text("title", textRule{trim: true, min: 1, max: 120})
	cents := f.amount("amount")
	currency := f.text("currency", textRule{max: 3})
	if f.has("currency") && (currency == nil || !slices.Contains(currencies, *currency)) {
		f.add("currency", "Допустимые значения: RUB, USD, EUR", "literal_error")
	}
	due := f.date("first_due_date")
	if due != nil && (due.Before(civil(2000, 1, 1)) || due.After(civil(2100, 12, 31))) {
		f.add("first_due_date", "Дата должна быть между 2000 и 2100 годами", "value_error")
	}
	if frequency := f.text("frequency", textRule{max: 16}); f.has("frequency") && (frequency == nil || *frequency != "monthly") {
		f.add("frequency", "Поддерживается только monthly", "literal_error")
	}
	if f.isNull("title") || f.isNull("amount") || f.isNull("currency") || f.isNull("first_due_date") {
		f.add("", "Поля платежа не могут быть пустыми", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	var id int64
	err = s.DB.Write(func(tx *sql.Tx) error {
		result, err := tx.Exec("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(?,?,?,?,?,?)",
			*title, cents, *currency, formatDate(*due), due.Day(), timestamp())
		if err != nil {
			return err
		}
		if id, err = result.LastInsertId(); err != nil {
			return err
		}
		if err := materialize(tx, s.Today()); err != nil {
			return err
		}
		return audit(tx, user.Username, "recurring.create", id)
	})
	if err != nil {
		return err
	}
	// Added less than 3 days before the due date → the reminder is checked right away.
	s.Worker.Kick()
	return writeJSON(w, 201, map[string]any{"id": id, "title": *title, "amount": money(cents), "currency": *currency,
		"first_due_date": formatDate(*due), "frequency": "monthly", "active": true})
}

func (s *Server) recurringDelete(w http.ResponseWriter, r *http.Request) error {
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
		err := tx.QueryRow("SELECT active FROM recurring_payments WHERE id=?", id).Scan(&active)
		if errors.Is(err, sql.ErrNoRows) {
			return fail(404, "Регулярный платёж не найден")
		}
		if err != nil || !active {
			return err
		}
		if _, err := tx.Exec("UPDATE recurring_payments SET active=0,deleted_at=? WHERE id=?", timestamp(), id); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN (SELECT id FROM payment_occurrences WHERE recurring_payment_id=?)", id); err != nil {
			return err
		}
		return audit(tx, user.Username, "recurring.archive", id)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// --- payment occurrences ---

type occurrenceFilter struct {
	from, to        *time.Time
	status          string
	currency        string
	search          string
	includeArchived bool
}

func (s *Server) loadOccurrences(q querier, filter occurrenceFilter) ([]Occurrence, error) {
	var clauses []string
	var args []any
	if filter.from != nil {
		clauses, args = append(clauses, "o.due_date>=?"), append(args, formatDate(*filter.from))
	}
	if filter.to != nil {
		clauses, args = append(clauses, "o.due_date<=?"), append(args, formatDate(*filter.to))
	}
	if filter.currency != "" {
		clauses, args = append(clauses, "o.currency=?"), append(args, filter.currency)
	}
	if !filter.includeArchived {
		clauses = append(clauses, "r.active=1")
	}
	query := occurrenceSelect
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	rows, err := q.Query(query+" ORDER BY o.due_date,o.id", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	today := s.Today()
	search := strings.ToLower(filter.search)
	items := []Occurrence{}
	for rows.Next() {
		item, err := scanOccurrence(rows, today)
		if err != nil {
			return nil, err
		}
		if filter.status != "" && item.Status != filter.status {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(item.Title), search) {
			continue
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func parseRange(q *queryParams) (from, to *time.Time) {
	from, to = q.date("from_date"), q.date("to_date")
	if from != nil && to != nil && from.After(*to) {
		q.errs = nil
		q.add("from_date", "Начало периода позже окончания", "value_error")
	}
	return from, to
}

func (s *Server) occurrenceList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	q := &queryParams{values: r.URL.Query()}
	from, to := parseRange(q)
	filter := occurrenceFilter{from: from, to: to,
		status:          q.choice("status", "paid", "unpaid", "overdue"),
		currency:        q.choice("currency", currencies...),
		search:          q.values.Get("search"),
		includeArchived: q.boolean("include_archived", true)}
	if len([]rune(filter.search)) > 120 {
		q.add("search", "Максимальная длина — 120", "string_too_long")
	}
	if err := q.err(); err != nil {
		return err
	}
	var items []Occurrence
	err := s.DB.Write(func(tx *sql.Tx) error {
		if err := materialize(tx, s.Today()); err != nil {
			return err
		}
		var err error
		items, err = s.loadOccurrences(tx, filter)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

func (s *Server) findOccurrence(q querier, id int64) (Occurrence, error) {
	item, err := scanOccurrence(q.QueryRow(occurrenceSelect+" WHERE o.id=?", id), s.Today())
	if errors.Is(err, sql.ErrNoRows) {
		return item, fail(404, "Период оплаты не найден")
	}
	return item, err
}

func (s *Server) occurrenceGet(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	id, err := pathID(r, "occurrence_id")
	if err != nil {
		return err
	}
	item, err := s.findOccurrence(s.DB, id)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, item)
}

func (s *Server) occurrenceUpdate(w http.ResponseWriter, r *http.Request) error {
	user, err := s.writeUser(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "occurrence_id")
	if err != nil {
		return err
	}
	f, err := readForm(r, "paid", "paid_at")
	if err != nil {
		return err
	}
	paid, paidAt := f.boolean("paid"), f.date("paid_at")
	if err := f.err(); err != nil {
		return err
	}
	switch {
	case !f.has("paid") && !f.has("paid_at"):
		f.add("", "Укажите paid или paid_at", "value_error")
	case f.isNull("paid"):
		f.add("paid", "paid должен быть true или false", "value_error")
	case paid != nil && !*paid && paidAt != nil:
		f.add("", "При отмене оплаты paid_at должна быть пустой", "value_error")
	case paid != nil && *paid && f.isNull("paid_at"):
		f.add("paid_at", "Для оплаты укажите фактическую дату", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	today := s.Today()
	if paidAt != nil && paidAt.After(today) {
		return fail(422, "Фактическая дата оплаты не может быть в будущем")
	}
	var updated Occurrence
	err = s.DB.Write(func(tx *sql.Tx) error {
		current, err := s.findOccurrence(tx, id)
		if err != nil {
			return err
		}
		var value any
		switch {
		case (paid != nil && !*paid) || f.isNull("paid_at"):
			value = nil
		case paidAt != nil:
			value = formatDate(*paidAt)
		case current.PaidAt != nil:
			value = *current.PaidAt
		case paid != nil && *paid:
			value = formatDate(today)
		}
		if _, err := tx.Exec("UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=?", value, user.Username, timestamp(), id); err != nil {
			return err
		}
		action := "occurrence.unpaid"
		if value != nil {
			action = "occurrence.paid"
		}
		if err := audit(tx, user.Username, action, id); err != nil {
			return err
		}
		updated, err = s.findOccurrence(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return writeJSON(w, 200, updated)
}

type currencyTotals struct {
	Total   string `json:"total"`
	Paid    string `json:"paid"`
	Unpaid  string `json:"unpaid"`
	Overdue string `json:"overdue"`
	Count   int    `json:"count"`
}

// summary sums by due date; unpaid includes overdue, total = paid + unpaid. No conversion.
func (s *Server) summary(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	q := &queryParams{values: r.URL.Query()}
	from, to := parseRange(q)
	includeArchived := q.boolean("include_archived", true)
	if err := q.err(); err != nil {
		return err
	}
	var items []Occurrence
	err := s.DB.Write(func(tx *sql.Tx) error {
		if err := materialize(tx, s.Today()); err != nil {
			return err
		}
		var err error
		items, err = s.loadOccurrences(tx, occurrenceFilter{from: from, to: to, includeArchived: includeArchived})
		return err
	})
	if err != nil {
		return err
	}
	type sums struct {
		total, paid, unpaid, overdue int64
		count                        int
	}
	totals := map[string]*sums{}
	for _, c := range currencies {
		totals[c] = &sums{}
	}
	for _, item := range items {
		t := totals[item.Currency]
		t.total += item.amountCents
		t.count++
		if item.Status == "paid" {
			t.paid += item.amountCents
		} else {
			t.unpaid += item.amountCents
		}
		if item.Status == "overdue" {
			t.overdue += item.amountCents
		}
	}
	result := map[string]currencyTotals{}
	for c, t := range totals {
		result[c] = currencyTotals{money(t.total), money(t.paid), money(t.unpaid), money(t.overdue), t.count}
	}
	dateOrNil := func(d *time.Time) any {
		if d == nil {
			return nil
		}
		return formatDate(*d)
	}
	return writeJSON(w, 200, map[string]any{"from_date": dateOrNil(from), "to_date": dateOrNil(to), "currencies": result})
}

// --- users ---

var loginPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)

type publicUser struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	CreatedAt   string `json:"created_at"`
}

func (s *Server) findUser(q querier, id int64) (publicUser, string, error) {
	u := publicUser{Role: "user"}
	var hash string
	err := q.QueryRow("SELECT id,username,display_name,created_at,password_hash FROM users WHERE id=?", id).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return u, "", fail(404, "Пользователь не найден")
	}
	return u, hash, err
}

func (s *Server) usersList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query("SELECT id,username,display_name,created_at FROM users ORDER BY id")
	if err != nil {
		return err
	}
	defer rows.Close()
	users := []publicUser{}
	for rows.Next() {
		u := publicUser{Role: "user"}
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt); err != nil {
			return err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, users)
}

var (
	usernameRule    = textRule{trim: true, min: 3, max: 64, pattern: loginPattern}
	displayNameRule = textRule{trim: true, min: 1, max: 80}
	passwordRule    = textRule{min: 12, max: 128}
)

func (s *Server) usersCreate(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	f, err := readForm(r, "username", "display_name", "password")
	if err != nil {
		return err
	}
	f.require("username", "display_name", "password")
	username, display, password := f.text("username", usernameRule), f.text("display_name", displayNameRule), f.text("password", passwordRule)
	if f.isNull("username") || f.isNull("display_name") || f.isNull("password") {
		f.add("", "Поля пользователя не могут быть пустыми", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	if strings.EqualFold(*username, s.Settings.AdminUsername) {
		return fail(409, "Этот логин принадлежит администратору")
	}
	encoded := hashPassword(*password)
	var created publicUser
	err = s.DB.Write(func(tx *sql.Tx) error {
		result, err := tx.Exec("INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)", *username, *display, encoded, timestamp())
		if isUniqueViolation(err) {
			return fail(409, "Пользователь с таким логином уже существует")
		}
		if err != nil {
			return err
		}
		id, _ := result.LastInsertId()
		if err := audit(tx, admin.Username, "user.create", id); err != nil {
			return err
		}
		created, _, err = s.findUser(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 201, created)
}

func (s *Server) usersUpdate(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "user_id")
	if err != nil {
		return err
	}
	f, err := readForm(r, "username", "display_name", "password")
	if err != nil {
		return err
	}
	username, display, password := f.text("username", usernameRule), f.text("display_name", displayNameRule), f.text("password", passwordRule)
	if len(f.values) == 0 || f.isNull("username") || f.isNull("display_name") || f.isNull("password") {
		f.add("", "Укажите хотя бы одно непустое поле", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	if id == 0 {
		return fail(403, "Администратор управляется только через .env")
	}
	if username != nil && strings.EqualFold(*username, s.Settings.AdminUsername) {
		return fail(409, "Этот логин принадлежит администратору")
	}
	encoded := ""
	if password != nil {
		encoded = hashPassword(*password)
	}
	var updated publicUser
	err = s.DB.Write(func(tx *sql.Tx) error {
		current, hash, err := s.findUser(tx, id)
		if err != nil {
			return err
		}
		if username != nil {
			current.Username = *username
		}
		if display != nil {
			current.DisplayName = *display
		}
		if encoded != "" {
			hash = encoded
		}
		_, err = tx.Exec("UPDATE users SET username=?,display_name=?,password_hash=? WHERE id=?", current.Username, current.DisplayName, hash, id)
		if isUniqueViolation(err) {
			return fail(409, "Пользователь с таким логином уже существует")
		}
		if err != nil {
			return err
		}
		// A new password revokes every session of that user.
		if encoded != "" {
			if _, err := tx.Exec("DELETE FROM sessions WHERE user_id=?", id); err != nil {
				return err
			}
		}
		if err := audit(tx, admin.Username, "user.update", id); err != nil {
			return err
		}
		updated, _, err = s.findUser(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, updated)
}

func (s *Server) usersDelete(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "user_id")
	if err != nil {
		return err
	}
	if id == 0 {
		return fail(403, "Администратор управляется только через .env")
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, _, err := s.findUser(tx, id); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM users WHERE id=?", id); err != nil {
			return err
		}
		return audit(tx, admin.Username, "user.delete", id)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// --- journals ---

func (s *Server) remindersList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query(`SELECT m.occurrence_id,m.state,m.attempts,m.attempted_at,m.retry_after,m.sent_at,m.message_id,m.error,r.title,o.due_date
		FROM reminders m JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
		ORDER BY COALESCE(m.attempted_at,0) DESC LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type reminder struct {
		OccurrenceID int64   `json:"occurrence_id"`
		State        string  `json:"state"`
		Attempts     int     `json:"attempts"`
		AttemptedAt  *int64  `json:"attempted_at"`
		RetryAfter   int64   `json:"retry_after"`
		SentAt       *string `json:"sent_at"`
		MessageID    *string `json:"message_id"`
		Error        *string `json:"error"`
		Title        string  `json:"title"`
		DueDate      string  `json:"due_date"`
	}
	items := []reminder{}
	for rows.Next() {
		var m reminder
		if err := rows.Scan(&m.OccurrenceID, &m.State, &m.Attempts, &m.AttemptedAt, &m.RetryAfter, &m.SentAt, &m.MessageID, &m.Error, &m.Title, &m.DueDate); err != nil {
			return err
		}
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

func (s *Server) auditList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query("SELECT id,actor,action,entity,created_at FROM audit_log ORDER BY id DESC LIMIT 100")
	if err != nil {
		return err
	}
	defer rows.Close()
	type entry struct {
		ID        int64  `json:"id"`
		Actor     string `json:"actor"`
		Action    string `json:"action"`
		Entity    string `json:"entity"`
		CreatedAt string `json:"created_at"`
	}
	items := []entry{}
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.ID, &e.Actor, &e.Action, &e.Entity, &e.CreatedAt); err != nil {
			return err
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}
