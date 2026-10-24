package app

// Account: password change for regular users and TOTP two-factor sign-in for the admin.
// The admin password lives in .env, so it cannot be changed here; its second factor can.

import (
	"crypto/hmac"
	"crypto/sha1"
	"database/sql"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
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
	if err := f.err(); err != nil {
		return err
	}
	if *current == *next {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "new_password"}, Msg: "Новый пароль совпадает с текущим", Type: "value_error"}}}
	}
	now := time.Now().Unix()
	keys := []string{digest("ip:" + clientIP(r)), digest("user:" + strings.ToLower(user.Username))}
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
	if !verifyPassword(*current, stored) {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "current_password"}, Msg: "Неверный текущий пароль", Type: "value_error"}}}
	}
	encoded := hashPassword(*next)
	cookie, _ := r.Cookie(cookieName)
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE users SET password_hash=? WHERE id=?", encoded, user.ID); err != nil {
			return err
		}
		// Other devices are signed out; this session stays.
		if _, err := tx.Exec("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", user.ID, digest(cookie.Value)); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM auth_attempts WHERE key=?", keys[1]); err != nil {
			return err
		}
		return audit(tx, user.Username, "password.change", user.ID)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// --- TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 digits) ---

var totpEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

func totpCode(secret []byte, step int64) string {
	mac := hmac.New(sha1.New, secret)
	binary.Write(mac, binary.BigEndian, step)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", value%1_000_000)
}

// totpStep returns the matched time step (±1 for clock drift) or -1.
func totpStep(secretB32, code string, now time.Time) int64 {
	secret, err := totpEncoding.DecodeString(strings.ToUpper(secretB32))
	code = strings.ReplaceAll(code, " ", "")
	if err != nil || len(code) != 6 {
		return -1
	}
	current := now.Unix() / 30
	for _, step := range []int64{current - 1, current, current + 1} {
		if hmac.Equal([]byte(totpCode(secret, step)), []byte(code)) {
			return step
		}
	}
	return -1
}

func (s *Server) state(key string) (string, error) {
	var value string
	err := s.DB.QueryRow("SELECT value FROM app_state WHERE key=?", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}

func setState(q querier, key, value string) error {
	_, err := q.Exec("INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value)
	return err
}

// useTOTP accepts each code once: a step not newer than the last used one is a replay.
func (s *Server) useTOTP(secret, code string) (bool, error) {
	step := totpStep(secret, code, s.Now())
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
		return setState(tx, "admin_totp_last_step", itoa(step))
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
	secret := totpEncoding.EncodeToString(randomBytes(20))
	if err := setState(s.DB, "admin_totp_pending", secret); err != nil {
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
	step := totpStep(pending, *code, s.Now())
	if step < 0 {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "code"}, Msg: "Код не подходит. Проверьте время на телефоне", Type: "value_error"}}}
	}
	cookie, _ := r.Cookie(cookieName)
	err = s.DB.Write(func(tx *sql.Tx) error {
		for key, value := range map[string]string{"admin_totp_secret": pending, "admin_totp_last_step": itoa(step)} {
			if err := setState(tx, key, value); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("DELETE FROM app_state WHERE key='admin_totp_pending'"); err != nil {
			return err
		}
		// Sessions opened without the second factor end, except this one.
		if _, err := tx.Exec("DELETE FROM sessions WHERE is_admin=1 AND token_hash<>?", digest(cookie.Value)); err != nil {
			return err
		}
		return audit(tx, admin.Username, "2fa.enable", "admin")
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
	if !verifyPassword(*password, s.adminHash) {
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
		return audit(tx, admin.Username, "2fa.disable", "admin")
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]bool{"enabled": false})
}

// DisableTwoFactor is the recovery path for a lost phone: `invoice-keeper 2fa-off` on the server.
func DisableTwoFactor(db *DB) error {
	return db.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM app_state WHERE key IN ('admin_totp_secret','admin_totp_pending')"); err != nil {
			return err
		}
		return audit(tx, "server", "2fa.disable", "admin")
	})
}
