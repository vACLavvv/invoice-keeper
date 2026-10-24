package app

// The browser extension reads the current page (activeTab) and sends found payments as suggestions.
// It authenticates with a personal API key (Authorization: Bearer ik_…) that can do nothing else:
// the key works only on /extension/whoami and POST /payment-suggestions. Those two endpoints answer
// CORS for any origin without credentials, so a stolen page cannot ride on the user's cookies.

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"slices"
	"strings"
	"time"
)

const (
	keyPrefix         = "ik_"
	maxKeysPerOwner   = 20
	maxPendingInInbox = 500
)

// --- API keys (managed from the panel with the cookie session) ---

type apiKey struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	Access     string  `json:"access"` // extension | read | write
	ExpiresAt  *string `json:"expires_at"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
}

// ownerClause selects the keys of the signed-in account: the admin is not a row in users.
func ownerClause(user *User) (string, []any) {
	if user.Role == "admin" {
		return "is_admin=1", nil
	}
	return "user_id=?", []any{user.ID}
}

func (s *Server) apiKeysList(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.currentUser(r))
	if err != nil {
		return err
	}
	where, args := ownerClause(user)
	rows, err := s.DB.Query("SELECT id,name,prefix,access,expires_at,created_at,last_used_at FROM api_keys WHERE "+where+" ORDER BY id DESC", args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	keys := []apiKey{}
	for rows.Next() {
		var k apiKey
		var expires sql.NullInt64
		if err := rows.Scan(&k.ID, &k.Name, &k.Prefix, &k.Access, &expires, &k.CreatedAt, &k.LastUsedAt); err != nil {
			return err
		}
		k.ExpiresAt = unixTime(expires)
		keys = append(keys, k)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, keys)
}

// apiKeysCreate issues a key for the browser extension (default) or a token for scripts:
// "read" — GET requests only, "write" — any data request; optionally for 30, 90 or 365 days.
func (s *Server) apiKeysCreate(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	f, err := readForm(r, "name", "access", "expires_in_days")
	if err != nil {
		return err
	}
	f.require("name")
	name := f.text("name", textRule{trim: true, min: 1, max: 60})
	if f.isNull("name") {
		f.add("name", "Укажите название ключа", "missing")
	}
	access := f.text("access", textRule{max: 16})
	if f.has("access") && (access == nil || !slices.Contains(tokenAccess, *access)) {
		f.add("access", "Допустимые значения: extension, read, write", "literal_error")
	}
	days := f.integer("expires_in_days")
	if days != nil && !slices.Contains([]int64{30, 90, 365}, *days) {
		f.add("expires_in_days", "Допустимые значения: 30, 90, 365 или null — бессрочно", "literal_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	kind := "extension"
	if access != nil {
		kind = *access
	}
	// Extension keys live a year unless chosen otherwise; an explicit null means no expiry.
	if days == nil && !f.has("expires_in_days") && kind == "extension" {
		year := int64(extensionKeyLifetime)
		days = &year
	}
	var created apiKey
	var token string
	err = s.DB.Write(func(tx *sql.Tx) error {
		var err error
		created, token, err = s.issueKey(tx, user, *name, kind, days)
		return err
	})
	if err != nil {
		return err
	}
	// The token is shown once; only its SHA-256 is stored.
	return writeJSON(w, 201, struct {
		apiKey
		Token string `json:"token"`
	}{created, token})
}

func (s *Server) apiKeysDelete(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	id, err := pathID(r, "key_id")
	if err != nil {
		return err
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		where, args := ownerClause(user)
		result, err := tx.Exec("DELETE FROM api_keys WHERE id=? AND "+where, append([]any{id}, args...)...) // #nosec G202 -- where is a constant clause, values are parameters
		if err != nil {
			return err
		}
		if n, _ := result.RowsAffected(); n == 0 {
			return fail(404, "Ключ не найден")
		}
		return audit(tx, user.Username, "api_key.delete", id)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// keyUser authenticates the extension endpoints by an API key only; cookies are ignored there.
// Both the extension key and a write token may submit suggestions.
func (s *Server) keyUser(r *http.Request) (*User, error) { return s.tokenUser(r, "extension", "write") }

// cors lets the extension popup call the key endpoints. No credentials: the key is the only proof.
func cors(next handlerFunc) handlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Max-Age", "600")
		if r.Method == http.MethodOptions {
			return noContent(w)
		}
		return next(w, r)
	}
}

func (s *Server) extensionWhoami(w http.ResponseWriter, r *http.Request) error {
	user, err := s.keyUser(r)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{
		"username": user.Username, "display_name": user.DisplayName, "role": user.Role,
		"timezone": s.Settings.Timezone, "today": formatDate(s.Today()),
	})
}

// --- suggestions ---

type suggestion struct {
	ID                 int64   `json:"id"`
	SourceKey          string  `json:"source_key"`
	SourceURL          *string `json:"source_url"`
	Title              string  `json:"title"`
	Amount             string  `json:"amount"`
	Currency           string  `json:"currency"`
	NextDueDate        string  `json:"next_due_date"`
	Status             string  `json:"status"`
	SubmittedBy        string  `json:"submitted_by"`
	RecurringPaymentID *int64  `json:"recurring_payment_id"`
	CreatedAt          string  `json:"created_at"`
	UpdatedAt          string  `json:"updated_at"`

	amountCents int64
}

const suggestionSelect = `SELECT id,source_key,source_url,title,amount_cents,currency,next_due_date,status,submitted_by,
recurring_payment_id,created_at,updated_at FROM payment_suggestions`

func scanSuggestion(row scanner) (suggestion, error) {
	var sg suggestion
	err := row.Scan(&sg.ID, &sg.SourceKey, &sg.SourceURL, &sg.Title, &sg.amountCents, &sg.Currency, &sg.NextDueDate,
		&sg.Status, &sg.SubmittedBy, &sg.RecurringPaymentID, &sg.CreatedAt, &sg.UpdatedAt)
	sg.Amount = money(sg.amountCents)
	return sg, err
}

func (s *Server) findSuggestion(q querier, id int64) (suggestion, error) {
	sg, err := scanSuggestion(q.QueryRow(suggestionSelect+" WHERE id=?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return sg, fail(404, "Предложение не найдено")
	}
	return sg, err
}

// paymentFields validates title / amount / currency / date shared by suggestions and their acceptance.
func paymentFields(f *form, dateField string) (title *string, cents int64, currency *string, due *time.Time) {
	title = f.text("title", textRule{trim: true, min: 1, max: 120})
	cents = f.amount("amount")
	currency = f.text("currency", textRule{max: 3})
	if f.has("currency") && (currency == nil || !slices.Contains(currencies, *currency)) {
		f.add("currency", "Допустимые значения: RUB, USD, EUR", "literal_error")
	}
	due = f.date(dateField)
	if due != nil && (due.Before(civil(2000, 1, 1)) || due.After(civil(2100, 12, 31))) {
		f.add(dateField, "Дата должна быть между 2000 и 2100 годами", "value_error")
	}
	for _, name := range []string{"title", "amount", "currency", dateField} {
		if f.isNull(name) {
			f.add(name, "Поле не может быть пустым", "missing")
		}
	}
	return
}

func (s *Server) suggestionsSubmit(w http.ResponseWriter, r *http.Request) error {
	user, err := s.keyUser(r)
	if err != nil {
		return err
	}
	f, err := readForm(r, "source_key", "source_url", "title", "amount", "currency", "next_due_date")
	if err != nil {
		return err
	}
	f.require("source_key", "title", "amount", "currency", "next_due_date")
	source := f.text("source_key", textRule{trim: true, min: 1, max: 200})
	link := f.text("source_url", textRule{trim: true, max: 500})
	if link != nil && *link != "" && !strings.HasPrefix(*link, "https://") && !strings.HasPrefix(*link, "http://") {
		f.add("source_url", "Ссылка должна начинаться с http:// или https://", "url_scheme")
	}
	title, cents, currency, due := paymentFields(f, "next_due_date")
	if err := f.err(); err != nil {
		return err
	}
	var url any
	if link != nil && *link != "" {
		url = *link
	}
	status, result := 200, "unchanged"
	var saved suggestion
	err = s.DB.Write(func(tx *sql.Tx) error {
		now := timestamp()
		existing, err := scanSuggestion(tx.QueryRow(suggestionSelect+" WHERE source_key=?", *source))
		switch {
		case errors.Is(err, sql.ErrNoRows):
			var pending int
			if err := tx.QueryRow("SELECT COUNT(*) FROM payment_suggestions WHERE status='pending'").Scan(&pending); err != nil {
				return err
			}
			if pending >= maxPendingInInbox {
				return fail(429, "Слишком много неразобранных предложений. Разберите их в панели")
			}
			res, err := tx.Exec(`INSERT INTO payment_suggestions(source_key,source_url,title,amount_cents,currency,next_due_date,submitted_by,created_at,updated_at)
				VALUES(?,?,?,?,?,?,?,?,?)`, *source, url, *title, cents, *currency, formatDate(*due), user.Username, now, now)
			if err != nil {
				return err
			}
			id, _ := res.LastInsertId()
			status, result = 201, "created"
			if err := audit(tx, user.Username, "suggestion.create", id); err != nil {
				return err
			}
			saved, err = s.findSuggestion(tx, id)
			return err
		case err != nil:
			return err
		case existing.Status == "pending":
			// The same service seen again: keep one suggestion, with the latest price and date.
			if _, err := tx.Exec(`UPDATE payment_suggestions SET source_url=?,title=?,amount_cents=?,currency=?,next_due_date=?,submitted_by=?,updated_at=?
				WHERE id=?`, url, *title, cents, *currency, formatDate(*due), user.Username, now, existing.ID); err != nil {
				return err
			}
			result = "updated"
			saved, err = s.findSuggestion(tx, existing.ID)
			return err
		default:
			// Already accepted or rejected by the admin: re-sending never recreates it.
			saved = existing
			return nil
		}
	})
	if err != nil {
		return err
	}
	return writeJSON(w, status, map[string]any{"result": result, "suggestion": saved})
}

func (s *Server) suggestionsList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	q := &queryParams{values: r.URL.Query()}
	status := q.choice("status", "pending", "accepted", "rejected")
	if err := q.err(); err != nil {
		return err
	}
	query, args := suggestionSelect, []any{}
	if status != "" {
		query, args = query+" WHERE status=?", append(args, status)
	}
	rows, err := s.DB.Query(query+" ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, updated_at DESC LIMIT 200", args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []suggestion{}
	for rows.Next() {
		sg, err := scanSuggestion(rows)
		if err != nil {
			return err
		}
		items = append(items, sg)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

// readOptionalForm is readForm that also accepts an empty body.
func readOptionalForm(r *http.Request, allowed ...string) (*form, error) {
	raw, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 64<<10))
	if err != nil {
		return nil, &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body"}, Msg: "Ожидается JSON-объект", Type: "json_invalid"}}}
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		raw = []byte("{}")
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	return readForm(r, allowed...)
}

// suggestionsAccept turns a suggestion into a recurring payment; the admin may correct any field first.
func (s *Server) suggestionsAccept(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "suggestion_id")
	if err != nil {
		return err
	}
	f, err := readOptionalForm(r, "title", "amount", "currency", "first_due_date")
	if err != nil {
		return err
	}
	title, cents, currency, due := paymentFields(f, "first_due_date")
	if err := f.err(); err != nil {
		return err
	}
	var saved suggestion
	err = s.DB.Write(func(tx *sql.Tx) error {
		sg, err := s.findSuggestion(tx, id)
		if err != nil {
			return err
		}
		if sg.Status != "pending" {
			return fail(409, "Предложение уже разобрано")
		}
		if title == nil {
			title = &sg.Title
		}
		if cents == 0 {
			cents = sg.amountCents
		}
		if currency == nil {
			currency = &sg.Currency
		}
		if due == nil {
			parsed, err := parseDate(sg.NextDueDate)
			if err != nil {
				return err
			}
			due = &parsed
		}
		paymentID, err := s.createRecurring(tx, admin.Username, recurringInput{title: *title, cents: cents, currency: *currency, due: *due})
		if err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE payment_suggestions SET status='accepted',recurring_payment_id=?,updated_at=? WHERE id=?", paymentID, timestamp(), id); err != nil {
			return err
		}
		if err := audit(tx, admin.Username, "suggestion.accept", id); err != nil {
			return err
		}
		saved, err = s.findSuggestion(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return writeJSON(w, 200, saved)
}

func (s *Server) suggestionsReject(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "suggestion_id")
	if err != nil {
		return err
	}
	var saved suggestion
	err = s.DB.Write(func(tx *sql.Tx) error {
		sg, err := s.findSuggestion(tx, id)
		if err != nil {
			return err
		}
		if sg.Status != "pending" {
			return fail(409, "Предложение уже разобрано")
		}
		if _, err := tx.Exec("UPDATE payment_suggestions SET status='rejected',updated_at=? WHERE id=?", timestamp(), id); err != nil {
			return err
		}
		if err := audit(tx, admin.Username, "suggestion.reject", id); err != nil {
			return err
		}
		saved, err = s.findSuggestion(tx, id)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, saved)
}

// extensionZip packs the embedded extension/ folder for "Load unpacked" installation.
func (s *Server) extensionZip(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return nil
	}
	source, err := fs.Sub(s.assets, "extension")
	if err != nil {
		return err
	}
	var archive bytes.Buffer
	zw := zip.NewWriter(&archive)
	err = fs.WalkDir(source, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		content, err := fs.ReadFile(source, name)
		if err != nil {
			return err
		}
		file, err := zw.Create("invoice-keeper-extension/" + name)
		if err != nil {
			return err
		}
		_, err = file.Write(content)
		return err
	})
	if err == nil {
		err = zw.Close()
	}
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="invoice-keeper-extension.zip"`)
	_, err = w.Write(archive.Bytes())
	return err
}
