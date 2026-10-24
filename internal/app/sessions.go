package app

// Active sessions of the signed-in account (device, address, last activity) and API tokens for scripts.
// A token (Authorization: Bearer ik_…) acts with its owner's rights: "read" only on GET requests,
// "write" on any data request. Account settings — password, second factor, tokens, sessions,
// Telegram linking — stay panel-only, so a leaked token cannot lock the owner out or mint new tokens.

import (
	"cmp"
	"database/sql"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"
)

// sessionID is the public handle of a session: a prefix of its token hash, never the token itself.
func sessionID(tokenHash string) string { return tokenHash[:16] }

// panelOnly refuses requests authenticated by an API token.
func panelOnly(user *User, err error) (*User, error) {
	if err != nil {
		return nil, err
	}
	if user.viaToken {
		return nil, fail(403, "Это действие доступно только в панели, не по токену API")
	}
	return user, nil
}

func userAgent(r *http.Request) string {
	agent := strings.TrimSpace(r.UserAgent())
	if len([]rune(agent)) > 200 {
		agent = string([]rune(agent)[:200])
	}
	return agent
}

type sessionItem struct {
	ID         string  `json:"id"`
	Current    bool    `json:"current"`
	CreatedAt  *string `json:"created_at"`
	LastSeenAt *string `json:"last_seen_at"`
	ExpiresAt  string  `json:"expires_at"`
	UserAgent  *string `json:"user_agent"`
	IP         *string `json:"ip"`
}

func unixTime(value sql.NullInt64) *string {
	if !value.Valid {
		return nil
	}
	formatted := time.Unix(value.Int64, 0).UTC().Format(time.RFC3339)
	return &formatted
}

func sessionOwner(user *User) (string, []any) {
	if user.Role == "admin" {
		return "is_admin=1", nil
	}
	return "user_id=?", []any{user.ID}
}

func currentTokenHash(r *http.Request) string {
	if cookie, err := r.Cookie(cookieName); err == nil {
		return digest(cookie.Value)
	}
	return ""
}

func (s *Server) sessionsList(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.currentUser(r))
	if err != nil {
		return err
	}
	where, args := sessionOwner(user)
	rows, err := s.DB.Query("SELECT token_hash,created_at,last_seen_at,expires_at,user_agent,ip FROM sessions WHERE "+where+
		" AND expires_at>? ORDER BY COALESCE(last_seen_at,created_at,0) DESC", append(args, time.Now().Unix())...)
	if err != nil {
		return err
	}
	defer rows.Close()
	current := currentTokenHash(r)
	items := []sessionItem{}
	for rows.Next() {
		var hash string
		var created, seen sql.NullInt64
		var expires int64
		var item sessionItem
		if err := rows.Scan(&hash, &created, &seen, &expires, &item.UserAgent, &item.IP); err != nil {
			return err
		}
		item.ID, item.Current = sessionID(hash), hash == current
		item.CreatedAt, item.LastSeenAt = unixTime(created), unixTime(seen)
		item.ExpiresAt = time.Unix(expires, 0).UTC().Format(time.RFC3339)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

func (s *Server) sessionsDelete(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	id := r.PathValue("session_id")
	if len(id) != 16 {
		return fail(404, "Сессия не найдена")
	}
	if strings.HasPrefix(currentTokenHash(r), id) {
		return fail(409, "Это текущая сессия: чтобы завершить её, нажмите «Выйти»")
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		where, args := sessionOwner(user)
		result, err := tx.Exec("DELETE FROM sessions WHERE substr(token_hash,1,16)=? AND "+where, append([]any{id}, args...)...) // #nosec G202 -- where is a constant clause, values are parameters
		if err != nil {
			return err
		}
		if n, _ := result.RowsAffected(); n == 0 {
			return fail(404, "Сессия не найдена")
		}
		return audit(tx, user.Username, "session.revoke", id)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// sessionsDeleteOthers signs the account out everywhere except this browser.
func (s *Server) sessionsDeleteOthers(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	var closed int64
	err = s.DB.Write(func(tx *sql.Tx) error {
		where, args := sessionOwner(user)
		result, err := tx.Exec("DELETE FROM sessions WHERE token_hash<>? AND "+where, append([]any{currentTokenHash(r)}, args...)...) // #nosec G202 -- where is a constant clause, values are parameters
		if err != nil {
			return err
		}
		closed, _ = result.RowsAffected()
		return audit(tx, user.Username, "session.revoke_others", closed)
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]int64{"closed": closed})
}

// --- API tokens ---

var tokenAccess = []string{"extension", "read", "write"}

// tokenUser authenticates by an API key whose access is one of allowed; expired keys are refused.
func (s *Server) tokenUser(r *http.Request, allowed ...string) (*User, error) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || !strings.HasPrefix(token, keyPrefix) || len(token) > 128 {
		return nil, fail(401, "Нужен ключ API: Authorization: Bearer ik_…")
	}
	var keyID int64
	var userID, expires sql.NullInt64
	var isAdmin bool
	var fingerprint, lastUsed sql.NullString
	var access, createdAt string
	err := s.DB.QueryRow("SELECT id,user_id,is_admin,admin_fingerprint,access,expires_at,last_used_at,created_at FROM api_keys WHERE token_hash=?", digest(token)).
		Scan(&keyID, &userID, &isAdmin, &fingerprint, &access, &expires, &lastUsed, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(401, "Ключ API не найден или удалён")
	}
	if err != nil {
		return nil, err
	}
	if expires.Valid && expires.Int64 <= time.Now().Unix() {
		return nil, fail(401, "Срок действия ключа API истёк. Подключите расширение заново или создайте новый токен")
	}
	// The worker removes idle keys periodically; this check closes the gap until it runs.
	if last := cmp.Or(lastUsed.String, createdAt); s.Settings.KeyIdleDays > 0 && last < idleCutoff(s.Settings.KeyIdleDays, time.Now()) {
		return nil, fail(401, "Ключом не пользовались больше "+itoa(int64(s.Settings.KeyIdleDays))+" дней, и он отключён. Подключите расширение заново")
	}
	if !slices.Contains(allowed, access) {
		switch access {
		case "extension":
			return nil, fail(403, "Ключ расширения работает только для расширения. Создайте токен API в «Аккаунте»")
		case "read":
			return nil, fail(403, "Токен только для чтения: изменения запрещены")
		}
		return nil, fail(403, "Этот ключ API здесь не подходит")
	}
	user := &User{Role: "user", viaToken: true}
	if isAdmin {
		if !constantEqual(fingerprint.String, s.adminFingerprint()) {
			return nil, fail(401, "Настройки администратора изменены. Создайте новый ключ")
		}
		user = &User{ID: 0, Username: s.Settings.AdminUsername, DisplayName: "Администратор", Role: "admin", viaToken: true}
	} else if err := s.DB.QueryRow("SELECT id,username,display_name FROM users WHERE id=?", userID.Int64).
		Scan(&user.ID, &user.Username, &user.DisplayName); err != nil {
		return nil, fail(401, "Пользователь ключа удалён")
	}
	if _, err := s.DB.Exec("UPDATE api_keys SET last_used_at=? WHERE id=?", timestamp(), keyID); err != nil {
		return nil, err
	}
	return user, nil
}

func hasBearer(r *http.Request) bool {
	return strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ")
}
