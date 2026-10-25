package app

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

var currencies = []string{"RUB", "USD", "EUR"}

// --- payment occurrences ---

type occurrenceFilter struct {
	from, to        *time.Time
	status          string
	currency        string
	search          string
	category        string // "-" — without a category
	assignee        string // user id, or "-" — without an assignee
	includeArchived bool
}

func (s *Server) loadOccurrences(q store.Querier, filter occurrenceFilter) ([]Occurrence, error) {
	var clauses []string
	var args []any
	if filter.from != nil {
		clauses, args = append(clauses, "o.due_date>=?"), append(args, schedule.FormatDate(*filter.from))
	}
	if filter.to != nil {
		clauses, args = append(clauses, "o.due_date<=?"), append(args, schedule.FormatDate(*filter.to))
	}
	if filter.currency != "" {
		clauses, args = append(clauses, "o.currency=?"), append(args, filter.currency)
	}
	if !filter.includeArchived {
		clauses = append(clauses, "r.active=1")
	}
	if filter.category == "-" {
		clauses = append(clauses, "(r.category IS NULL OR r.category='')")
	}
	switch filter.assignee {
	case "":
	case "-":
		clauses = append(clauses, "r.assignee_id IS NULL")
	default:
		clauses, args = append(clauses, "r.assignee_id=?"), append(args, filter.assignee)
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
		// Compared in Go: SQLite NOCASE folds only ASCII, and categories are usually Cyrillic.
		if filter.category != "" && filter.category != "-" && (item.Category == nil || !strings.EqualFold(*item.Category, filter.category)) {
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

// occurrenceQuery reads the list filters shared by the list and the CSV export.
func occurrenceQuery(r *http.Request, user *User) (occurrenceFilter, error) {
	q := &queryParams{values: r.URL.Query()}
	from, to := parseRange(q)
	filter := occurrenceFilter{from: from, to: to,
		status:          q.choice("status", "paid", "unpaid", "overdue"),
		currency:        q.choice("currency", currencies...),
		search:          q.values.Get("search"),
		category:        strings.TrimSpace(q.values.Get("category")),
		includeArchived: q.boolean("include_archived", true)}
	if len([]rune(filter.search)) > 120 {
		q.add("search", "Максимальная длина — 120", "string_too_long")
	}
	if len([]rune(filter.category)) > 40 {
		q.add("category", "Максимальная длина — 40", "string_too_long")
	}
	switch assignee := q.values.Get("assignee"); {
	case assignee == "" || assignee == "-":
		filter.assignee = assignee
	case assignee == "me":
		// "Только мои" for a user; the admin is responsible for everything, so no filter.
		if user.Role != "admin" {
			filter.assignee = itoa(user.ID)
		}
	default:
		if _, err := strconv.ParseInt(assignee, 10, 64); err != nil {
			q.add("assignee", "Ожидается me, - или ID пользователя", "value_error")
		}
		filter.assignee = assignee
	}
	return filter, q.err()
}

func (s *Server) occurrenceList(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	filter, err := occurrenceQuery(r, user)
	if err != nil {
		return err
	}
	var items []Occurrence
	err = s.DB.Write(func(tx *sql.Tx) error {
		if err := schedule.Materialize(tx, s.Today()); err != nil {
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

func (s *Server) findOccurrence(q store.Querier, id int64) (Occurrence, error) {
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
			value = schedule.FormatDate(*paidAt)
		case current.PaidAt != nil:
			value = *current.PaidAt
		case paid != nil && *paid:
			value = schedule.FormatDate(today)
		}
		if _, err := tx.Exec("UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=?", value, user.Username, schedule.Timestamp(), id); err != nil {
			return err
		}
		action := "occurrence.unpaid"
		if value != nil {
			action = "occurrence.paid"
		}
		if err := audit.Record(tx, user.Username, action, id); err != nil {
			return err
		}
		updated, err = s.findOccurrence(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
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
		if err := schedule.Materialize(tx, s.Today()); err != nil {
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
		result[c] = currencyTotals{schedule.Money(t.total), schedule.Money(t.paid), schedule.Money(t.unpaid), schedule.Money(t.overdue), t.count}
	}
	dateOrNil := func(d *time.Time) any {
		if d == nil {
			return nil
		}
		return schedule.FormatDate(*d)
	}
	return writeJSON(w, 200, map[string]any{"from_date": dateOrNil(from), "to_date": dateOrNil(to), "currencies": result})
}

// --- users ---

var loginPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)

type publicUser struct {
	ID              int64   `json:"id"`
	Username        string  `json:"username"`
	DisplayName     string  `json:"display_name"`
	Role            string  `json:"role"`
	CreatedAt       string  `json:"created_at"`
	Email           *string `json:"email"`
	EmailVerifiedAt *string `json:"email_verified_at"`
}

func (s *Server) findUser(q store.Querier, id int64) (publicUser, string, error) {
	u := publicUser{Role: "user"}
	var hash string
	err := q.QueryRow("SELECT u.id,u.username,u.display_name,u.created_at,u.password_hash,e.email,e.verified_at FROM users u LEFT JOIN email_contacts e ON e.user_id=u.id WHERE u.id=?", id).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt, &hash, &u.Email, &u.EmailVerifiedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return u, "", fail(404, "Пользователь не найден")
	}
	return u, hash, err
}

func (s *Server) usersList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query("SELECT u.id,u.username,u.display_name,u.created_at,e.email,e.verified_at FROM users u LEFT JOIN email_contacts e ON e.user_id=u.id ORDER BY u.id")
	if err != nil {
		return err
	}
	defer rows.Close()
	users := []publicUser{}
	for rows.Next() {
		u := publicUser{Role: "user"}
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt, &u.Email, &u.EmailVerifiedAt); err != nil {
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
	f, err := readForm(r, "username", "display_name", "password", "email")
	if err != nil {
		return err
	}
	f.require("username", "display_name", "password", "email")
	username, display, password := f.text("username", usernameRule), f.text("display_name", displayNameRule), f.text("password", passwordRule)
	email := emailField(f)
	if f.isNull("username") || f.isNull("display_name") || f.isNull("password") {
		f.add("", "Поля пользователя не могут быть пустыми", "missing")
	}
	if username != nil {
		checkPassword(f, "password", password, *username)
	}
	if err := f.err(); err != nil {
		return err
	}
	if strings.EqualFold(*username, s.Settings.AdminUsername) {
		return fail(409, "Этот логин принадлежит администратору")
	}
	encoded := security.HashPassword(*password)
	var created publicUser
	err = s.DB.Write(func(tx *sql.Tx) error {
		result, err := tx.Exec("INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)", *username, *display, encoded, schedule.Timestamp())
		if store.IsUniqueViolation(err) {
			return fail(409, "Пользователь с таким логином уже существует")
		}
		if err != nil {
			return err
		}
		id, _ := result.LastInsertId()
		if err := s.requestEmail(tx, &User{ID: id, Username: *username, Role: "user"}, *email, false, admin.Username); err != nil {
			return err
		}
		if err := audit.Record(tx, admin.Username, "user.create", id); err != nil {
			return err
		}
		created, _, err = s.findUser(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
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
	f, err := readForm(r, "username", "display_name", "password", "email")
	if err != nil {
		return err
	}
	username, display, password := f.text("username", usernameRule), f.text("display_name", displayNameRule), f.text("password", passwordRule)
	email := emailField(f)
	if len(f.values) == 0 || f.isNull("username") || f.isNull("display_name") || f.isNull("password") {
		f.add("", "Укажите хотя бы одно непустое поле", "value_error")
	}
	// The login is checked when it changes together with the password; the stored one — below.
	login := ""
	if username != nil {
		login = *username
	}
	checkPassword(f, "password", password, login)
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
		encoded = security.HashPassword(*password)
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
		if store.IsUniqueViolation(err) {
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
		if email != nil {
			if err := s.requestEmail(tx, &User{ID: id, Username: current.Username, Role: "user"}, *email, false, admin.Username); err != nil {
				return err
			}
		}
		if err := audit.Record(tx, admin.Username, "user.update", id); err != nil {
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
		return audit.Record(tx, admin.Username, "user.delete", id)
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
