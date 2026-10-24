package app

// Account: password change for regular users and TOTP two-factor sign-in for the admin.
// The admin password lives in .env, so it cannot be changed here; its second factor can.

import (
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	if user.Role == "admin" {
		return fail(403, "Пароль администратора меняется только в .env")
	}
	f, err := readForm(r, "current_password", "new_password")
	if err != nil {
		return err
	}
	f.require("current_password", "new_password")
	current := f.text("current_password", textRule{min: 1, max: 128})
	next := f.text("new_password", passwordRule)
	checkPassword(f, "new_password", next, user.Username)
	if err := f.err(); err != nil {
		return err
	}
	if *current == *next {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "new_password"}, Msg: "Новый пароль совпадает с текущим", Type: "value_error"}}}
	}
	now := time.Now().Unix()
	keys := []string{security.Digest("ip:" + clientIP(r)), security.Digest("user:" + strings.ToLower(user.Username))}
	var stored string
	// A wrong current password counts as a failed sign-in, so this form cannot be used for guessing.
	err = s.DB.Write(func(tx *sql.Tx) error {
		if err := limitAttempts(tx, keys, now); err != nil {
			return err
		}
		return tx.QueryRow("SELECT password_hash FROM users WHERE id=?", user.ID).Scan(&stored)
	})
	if err != nil {
		return err
	}
	if !security.VerifyPassword(*current, stored) {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "current_password"}, Msg: "Неверный текущий пароль", Type: "value_error"}}}
	}
	encoded := security.HashPassword(*next)
	cookie, _ := r.Cookie(cookieName)
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE users SET password_hash=? WHERE id=?", encoded, user.ID); err != nil {
			return err
		}
		// Other devices are signed out; this session stays.
		if _, err := tx.Exec("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", user.ID, security.Digest(cookie.Value)); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM auth_attempts WHERE key=?", keys[1]); err != nil {
			return err
		}
		return audit.Record(tx, user.Username, "password.change", user.ID)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// --- TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 digits) ---

func (s *Server) state(key string) (string, error) {
	var value string
	err := s.DB.QueryRow("SELECT value FROM app_state WHERE key=?", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return security.DecryptText("app_state."+key, value)
}

// setSecretState stores a secret (the TOTP keys) encrypted when DATA_ENCRYPTION_KEY is set.
func setSecretState(q store.Querier, key, value string) error {
	return store.SetState(q, key, security.EncryptText("app_state."+key, value))
}

// useTOTP accepts each code once: a step not newer than the last used one is a replay.
func (s *Server) useTOTP(secret, code string) (bool, error) {
	step := security.TOTPStep(secret, code, s.Now())
	if step < 0 {
		return false, nil
	}
	ok := false
	err := s.DB.Write(func(tx *sql.Tx) error {
		var last string
		if err := tx.QueryRow("SELECT value FROM app_state WHERE key='admin_totp_last_step'").Scan(&last); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if used, _ := strconv.ParseInt(last, 10, 64); last != "" && step <= used {
			return nil
		}
		ok = true
		return store.SetState(tx, "admin_totp_last_step", itoa(step))
	})
	return ok, err
}

func (s *Server) checkSecondFactor(code *string) error {
	secret, err := s.state("admin_totp_secret")
	if err != nil || secret == "" {
		return err
	}
	if code == nil || *code == "" {
		return &apiError{Status: 401, Detail: "Введите код из приложения-аутентификатора", Code: "two_factor_required"}
	}
	ok, err := s.useTOTP(secret, *code)
	if err != nil {
		return err
	}
	if !ok {
		return &apiError{Status: 401, Detail: "Неверный или уже использованный код", Code: "two_factor_required"}
	}
	return nil
}

func (s *Server) twoFactorStatus(w http.ResponseWriter, r *http.Request) error {
	if _, err := panelOnly(s.adminUser(r)); err != nil {
		return err
	}
	secret, err := s.state("admin_totp_secret")
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]bool{"enabled": secret != ""})
}

// twoFactorSetup creates a new secret; it becomes active only after a correct code (enable).
func (s *Server) twoFactorSetup(w http.ResponseWriter, r *http.Request) error {
	admin, err := panelOnly(s.adminWrite(r))
	if err != nil {
		return err
	}
	if secret, err := s.state("admin_totp_secret"); err != nil || secret != "" {
		if err != nil {
			return err
		}
		return fail(409, "Двухфакторный вход уже включён")
	}
	secret := security.TOTPEncoding.EncodeToString(security.RandomBytes(20))
	if err := setSecretState(s.DB, "admin_totp_pending", secret); err != nil {
		return err
	}
	label := url.PathEscape("Invoice Keeper:" + admin.Username)
	otpauth := "otpauth://totp/" + label + "?" + url.Values{"secret": {secret}, "issuer": {"Invoice Keeper"}, "digits": {"6"}, "period": {"30"}}.Encode()
	return writeJSON(w, 200, map[string]string{"secret": secret, "otpauth_url": otpauth})
}

func (s *Server) twoFactorEnable(w http.ResponseWriter, r *http.Request) error {
	admin, err := panelOnly(s.adminWrite(r))
	if err != nil {
		return err
	}
	f, err := readForm(r, "code")
	if err != nil {
		return err
	}
	f.require("code")
	code := f.text("code", textRule{trim: true, min: 6, max: 12})
	if err := f.err(); err != nil {
		return err
	}
	pending, err := s.state("admin_totp_pending")
	if err != nil {
		return err
	}
	if pending == "" {
		return fail(409, "Сначала получите QR-код")
	}
	step := security.TOTPStep(pending, *code, s.Now())
	if step < 0 {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "code"}, Msg: "Код не подходит. Проверьте время на телефоне", Type: "value_error"}}}
	}
	cookie, _ := r.Cookie(cookieName)
	err = s.DB.Write(func(tx *sql.Tx) error {
		if err := setSecretState(tx, "admin_totp_secret", pending); err != nil {
			return err
		}
		if err := store.SetState(tx, "admin_totp_last_step", itoa(step)); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM app_state WHERE key='admin_totp_pending'"); err != nil {
			return err
		}
		// Sessions opened without the second factor end, except this one.
		if _, err := tx.Exec("DELETE FROM sessions WHERE is_admin=1 AND token_hash<>?", security.Digest(cookie.Value)); err != nil {
			return err
		}
		return audit.Record(tx, admin.Username, "2fa.enable", "admin")
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]bool{"enabled": true})
}

func (s *Server) twoFactorDisable(w http.ResponseWriter, r *http.Request) error {
	admin, err := panelOnly(s.adminWrite(r))
	if err != nil {
		return err
	}
	f, err := readForm(r, "password", "code")
	if err != nil {
		return err
	}
	f.require("password", "code")
	password := f.text("password", textRule{min: 1, max: 128})
	code := f.text("code", textRule{trim: true, min: 6, max: 12})
	if err := f.err(); err != nil {
		return err
	}
	if !security.VerifyPassword(*password, s.adminHash) {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "password"}, Msg: "Неверный пароль", Type: "value_error"}}}
	}
	secret, err := s.state("admin_totp_secret")
	if err != nil {
		return err
	}
	if secret == "" {
		return fail(409, "Двухфакторный вход не включён")
	}
	if ok, err := s.useTOTP(secret, *code); err != nil || !ok {
		if err != nil {
			return err
		}
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "code"}, Msg: "Неверный или уже использованный код", Type: "value_error"}}}
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM app_state WHERE key IN ('admin_totp_secret','admin_totp_pending')"); err != nil {
			return err
		}
		return audit.Record(tx, admin.Username, "2fa.disable", "admin")
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]bool{"enabled": false})
}

// DisableTwoFactor is the recovery path for a lost phone: `invoice-keeper 2fa-off` on the server.
func DisableTwoFactor(db *store.DB) error {
	return db.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM app_state WHERE key IN ('admin_totp_secret','admin_totp_pending')"); err != nil {
			return err
		}
		return audit.Record(tx, "server", "2fa.disable", "admin")
	})
}
