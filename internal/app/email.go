package app

import (
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
)

type emailStatus struct {
	Email         *string `json:"email"`
	VerifiedAt    *string `json:"verified_at"`
	Enabled       bool    `json:"enabled"`
	Available     bool    `json:"available"`
	DeliveryState string  `json:"delivery_state"`
	DeliveryError *string `json:"delivery_error"`
	ResendAfter   int64   `json:"resend_after"`
}

func emailField(f *form) *string {
	value := f.text("email", textRule{trim: true, min: 3, max: 254})
	if f.isNull("email") {
		f.add("email", "Укажите адрес электронной почты", "missing")
	}
	if value == nil {
		return nil
	}
	address, err := mail.ParseAddress(*value)
	if err != nil || address.Address != *value || strings.ContainsAny(*value, "\r\n") {
		f.add("email", "Укажите один адрес, например name@example.com", "value_error")
		return nil
	}
	at := strings.LastIndexByte(*value, '@')
	if at <= 0 || at == len(*value)-1 {
		f.add("email", "Укажите полный адрес электронной почты", "value_error")
		return nil
	}
	local, domain := (*value)[:at], (*value)[at+1:]
	if !strings.Contains(domain, ".") {
		f.add("email", "Укажите полный адрес электронной почты", "value_error")
		return nil
	}
	// Domain names are case-insensitive. Keep the mailbox spelling supplied by its owner.
	canonical := local + "@" + strings.ToLower(domain)
	return &canonical
}

func (s *Server) emailStatus(user *User) (emailStatus, error) {
	result := emailStatus{Available: s.Settings.SMTPHost != "" && s.Settings.PublicBaseURL != "", DeliveryState: "missing"}
	owner, args := ownerClause(user)
	var requested int64
	err := s.DB.QueryRow("SELECT email,verified_at,enabled,welcome_state,error,requested_at FROM email_contacts WHERE "+owner, args...).
		Scan(&result.Email, &result.VerifiedAt, &result.Enabled, &result.DeliveryState, &result.DeliveryError, &requested)
	if errors.Is(err, sql.ErrNoRows) {
		return result, nil
	}
	result.ResendAfter = max(0, requested+60-s.Now().Unix())
	return result, err
}

// requestEmail stores a durable welcome request in the same transaction as the user change.
// Only the digest is needed for verification; the sending copy is encrypted and erased after send.
func (s *Server) requestEmail(tx *sql.Tx, user *User, address string, resend bool, actor string) error {
	owner, args := ownerClause(user)
	var id, requested int64
	var current string
	var verified sql.NullString
	err := tx.QueryRow("SELECT id,email,verified_at,requested_at FROM email_contacts WHERE "+owner, args...).Scan(&id, &current, &verified, &requested)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if id != 0 {
		if current == address && !resend {
			return nil
		}
		if resend && verified.Valid {
			return fail(409, "Почта уже подтверждена")
		}
		if remaining := requested + 60 - s.Now().Unix(); remaining > 0 {
			return &apiError{Status: 429, Detail: "Повторить отправку можно через минуту", Header: http.Header{"Retry-After": {itoa(remaining)}}}
		}
	}
	code := security.RandomToken(32)
	secret := security.EncryptText("email_contacts.token_secret", code)
	now := s.Now()
	if id == 0 {
		uid, admin := ownerArgs(user)
		result, err := tx.Exec(`INSERT INTO email_contacts(user_id,is_admin,email,token_hash,token_secret,expires_at,requested_at)
			VALUES(?,?,?,?,?,?,?)`, uid, admin, address, security.Digest(code), secret, now.Add(24*time.Hour).Unix(), now.Unix())
		if err != nil {
			return err
		}
		id, err = result.LastInsertId()
		if err != nil {
			return err
		}
	} else {
		_, err := tx.Exec(`UPDATE email_contacts SET email=?,verified_at=NULL,token_hash=?,token_secret=?,expires_at=?,requested_at=?,
			welcome_state='pending',attempts=0,attempted_at=NULL,retry_after=0,error=NULL WHERE id=?`, address, security.Digest(code), secret, now.Add(24*time.Hour).Unix(), now.Unix(), id)
		if err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE deliveries SET state='cancelled' WHERE channel=? AND state='pending'", "email:"+itoa(id)); err != nil {
			return err
		}
	}
	return audit.Record(tx, actor, "email.request", id)
}

func (s *Server) myEmail(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.currentUser(r))
	if err != nil {
		return err
	}
	status, err := s.emailStatus(user)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, status)
}

func (s *Server) myEmailUpdate(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	f, err := readForm(r, "email", "enabled")
	if err != nil {
		return err
	}
	address, enabled := emailField(f), f.boolean("enabled")
	if len(f.values) == 0 || f.isNull("enabled") {
		f.add("", "Укажите почту или настройку уведомлений", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		if address != nil {
			if err := s.requestEmail(tx, user, *address, false, user.Username); err != nil {
				return err
			}
		}
		if enabled != nil {
			uid, admin := ownerArgs(user)
			result, err := tx.Exec("UPDATE email_contacts SET enabled=? WHERE (user_id=? AND is_admin=0) OR (? AND is_admin=1)", *enabled, uid, admin)
			if err != nil {
				return err
			}
			if n, _ := result.RowsAffected(); n == 0 {
				return fail(409, "Сначала укажите почту")
			}
			return audit.Record(tx, user.Username, "email.settings", user.ID)
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return s.myEmail(w, r)
}

func (s *Server) resendEmail(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	actor := user.Username
	if r.PathValue("user_id") != "" {
		if user.Role != "admin" {
			return fail(403, "Раздел доступен администратору")
		}
		id, err := pathID(r, "user_id")
		if err != nil {
			return err
		}
		target, _, err := s.findUser(s.DB, id)
		if err != nil {
			return err
		}
		user = &User{ID: target.ID, Username: target.Username, Role: "user"}
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		where, args := ownerClause(user)
		var address string
		if err := tx.QueryRow("SELECT email FROM email_contacts WHERE "+where, args...).Scan(&address); errors.Is(err, sql.ErrNoRows) {
			return fail(409, "Сначала укажите почту")
		} else if err != nil {
			return err
		}
		return s.requestEmail(tx, user, address, true, actor)
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return noContent(w)
}

func (s *Server) confirmEmail(w http.ResponseWriter, r *http.Request) error {
	if err := s.originCheck(r); err != nil {
		return err
	}
	f, err := readForm(r, "token")
	if err != nil {
		return err
	}
	f.require("token")
	code := f.text("token", textRule{min: 32, max: 128})
	if code == nil {
		f.add("token", "Нужна ссылка из письма", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		var id int64
		err := tx.QueryRow("SELECT id FROM email_contacts WHERE token_hash=? AND expires_at>? AND verified_at IS NULL", security.Digest(*code), s.Now().Unix()).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			return fail(410, "Ссылка уже использована или устарела. Запросите новое письмо в аккаунте или у администратора.")
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE email_contacts SET verified_at=?,token_hash=NULL,token_secret='',expires_at=NULL,error=NULL,welcome_state='confirmed' WHERE id=?", schedule.Timestamp(), id)
		if err != nil {
			return err
		}
		return audit.Record(tx, "email-confirmation", "email.confirm", id)
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return noContent(w)
}
