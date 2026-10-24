package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const cookieName = "invoice_session"

type Options struct {
	Today  func() time.Time
	Sender Sender
}

type Server struct {
	DB       *DB
	Settings *Settings
	Worker   *ReminderWorker
	Today    func() time.Time

	assets    fs.FS
	pages     map[string]page
	adminHash string
	handler   http.Handler
}

// NewServer prepares routes and materializes periods. The reminder loop is started separately.
func NewServer(settings *Settings, db *DB, assets fs.FS, opts Options) (*Server, error) {
	today := opts.Today
	if today == nil {
		today = func() time.Time { return localToday(settings) }
	}
	s := &Server{
		DB: db, Settings: settings, Today: today, assets: assets,
		Worker:    NewReminderWorker(db, settings, opts.Sender, today),
		adminHash: hashPassword(settings.AdminPassword),
	}
	if err := db.Write(func(tx *sql.Tx) error { return materialize(tx, today()) }); err != nil {
		return nil, err
	}
	app, err := fs.Sub(assets, "web/app")
	if err != nil {
		return nil, err
	}
	if s.pages, err = loadPages(app); err != nil {
		return nil, err
	}
	s.handler = securityHeaders(s.routes())
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }

type handlerFunc func(w http.ResponseWriter, r *http.Request) error

func (h handlerFunc) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	err := h(w, r)
	if err == nil {
		return
	}
	var apiErr *apiError
	if !errors.As(err, &apiErr) {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		apiErr = &apiError{Status: 500, Detail: "Внутренняя ошибка сервера"}
	}
	for key, values := range apiErr.Header {
		w.Header()[key] = values
	}
	writeJSON(w, apiErr.Status, map[string]any{"detail": apiErr.Detail})
}

func writeJSON(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}

func noContent(w http.ResponseWriter) error {
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cache-Control", "no-store")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// Panel pages replace this with a policy that lists their inline scripts by hash.
		scripts := "'self'"
		if r.URL.Path == "/api/v1/docs" {
			scripts = "'self' 'unsafe-inline'"
		}
		h.Set("Content-Security-Policy", csp+"; script-src "+scripts+"; style-src 'self' 'unsafe-inline'")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	handle := func(pattern string, h handlerFunc) { mux.Handle(pattern, h) }

	app, _ := fs.Sub(s.assets, "web/app")
	swagger, _ := fs.Sub(s.assets, "web/swagger")
	mux.Handle("GET /_next/", nextAssets(app))
	mux.Handle("GET /favicon.svg", files(app))
	mux.Handle("GET /swagger-assets/", http.StripPrefix("/swagger-assets", files(swagger)))

	handle("/", s.notFound)
	handle("GET /", s.panelPage)
	handle("GET /login", s.loginPage)
	handle("GET /api/v1/docs", s.docs)
	handle("GET /api/v1/openapi.json", s.openapi)
	for _, route := range s.apiRoutes() {
		handle(route.pattern, route.handler)
	}
	return mux
}

type route struct {
	pattern string
	handler handlerFunc
}

// apiRoutes are the documented operations; a test checks them against docs/openapi.json.
func (s *Server) apiRoutes() []route {
	return []route{
		{"GET /healthz", s.health},

		{"POST /api/v1/auth/login", s.login},
		{"GET /api/v1/auth/me", s.me},
		{"POST /api/v1/auth/logout", s.logout},
		{"GET /api/v1/settings", s.appSettings},

		{"GET /api/v1/recurring-payments", s.recurringList},
		{"POST /api/v1/recurring-payments", s.recurringCreate},
		{"DELETE /api/v1/recurring-payments/{payment_id}", s.recurringDelete},

		{"GET /api/v1/payment-occurrences", s.occurrenceList},
		{"GET /api/v1/payment-occurrences/{occurrence_id}", s.occurrenceGet},
		{"PATCH /api/v1/payment-occurrences/{occurrence_id}", s.occurrenceUpdate},
		{"GET /api/v1/payments/summary", s.summary},

		{"GET /api/v1/users", s.usersList},
		{"POST /api/v1/users", s.usersCreate},
		{"PATCH /api/v1/users/{user_id}", s.usersUpdate},
		{"DELETE /api/v1/users/{user_id}", s.usersDelete},

		{"GET /api/v1/reminders", s.remindersList},
		{"GET /api/v1/audit-log", s.auditList},
	}
}

// files serves embedded files only; directory listings are hidden.
func files(root fs.FS) http.Handler {
	server := http.FileServerFS(root)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if info, err := fs.Stat(root, name); err != nil || info.IsDir() {
			handlerFunc(func(http.ResponseWriter, *http.Request) error { return fail(404, "Not Found") }).ServeHTTP(w, r)
			return
		}
		server.ServeHTTP(w, r)
	})
}

// --- authentication ---

type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	CSRFToken   string `json:"csrf_token"`
}

func (s *Server) adminFingerprint() string {
	return digest(s.Settings.AdminUsername + "\x00" + s.Settings.AdminPassword)
}

func (s *Server) currentUser(r *http.Request) (*User, error) {
	cookie, err := r.Cookie(cookieName)
	if err != nil || cookie.Value == "" || len(cookie.Value) > 128 {
		return nil, fail(401, "Войдите в систему")
	}
	var userID sql.NullInt64
	var isAdmin bool
	var fingerprint sql.NullString
	var csrf string
	err = s.DB.QueryRow("SELECT user_id,is_admin,admin_fingerprint,csrf_token FROM sessions WHERE token_hash=? AND expires_at>?",
		digest(cookie.Value), time.Now().Unix()).Scan(&userID, &isAdmin, &fingerprint, &csrf)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(401, "Сессия завершена. Войдите снова")
	}
	if err != nil {
		return nil, err
	}
	if isAdmin {
		if !constantEqual(fingerprint.String, s.adminFingerprint()) {
			return nil, fail(401, "Настройки администратора изменены. Войдите снова")
		}
		return &User{ID: 0, Username: s.Settings.AdminUsername, DisplayName: "Администратор", Role: "admin", CSRFToken: csrf}, nil
	}
	user := &User{Role: "user", CSRFToken: csrf}
	err = s.DB.QueryRow("SELECT id,username,display_name FROM users WHERE id=?", userID.Int64).Scan(&user.ID, &user.Username, &user.DisplayName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(401, "Пользователь удалён")
	}
	return user, err
}

func originCheck(r *http.Request) error {
	if origin := r.Header.Get("Origin"); origin != "" {
		if parsed, err := url.Parse(origin); err != nil || parsed.Host != r.Host {
			return fail(403, "Запрос с другого сайта запрещён")
		}
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return fail(403, "Запрос с другого сайта запрещён")
	}
	return nil
}

// writeUser authorizes a state-changing request: session, same origin and CSRF token.
func (s *Server) writeUser(r *http.Request) (*User, error) {
	user, err := s.currentUser(r)
	if err != nil {
		return nil, err
	}
	if err := originCheck(r); err != nil {
		return nil, err
	}
	token := r.Header.Get("X-CSRF-Token")
	if token == "" || !constantEqual(token, user.CSRFToken) {
		return nil, fail(403, "Необходим X-CSRF-Token из /api/v1/auth/me")
	}
	return user, nil
}

func requireAdmin(user *User, err error) (*User, error) {
	if err != nil {
		return nil, err
	}
	if user.Role != "admin" {
		return nil, fail(403, "Действие доступно только администратору")
	}
	return user, nil
}

func (s *Server) adminUser(r *http.Request) (*User, error)  { return requireAdmin(s.currentUser(r)) }
func (s *Server) adminWrite(r *http.Request) (*User, error) { return requireAdmin(s.writeUser(r)) }

func (s *Server) health(w http.ResponseWriter, r *http.Request) error {
	if err := s.DB.QueryRow("SELECT 1").Scan(new(int)); err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]string{"status": "ok"})
}

const swaggerPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice Keeper · API</title>
<link type="text/css" rel="stylesheet" href="/swagger-assets/swagger-ui.css">
<link rel="shortcut icon" href="/favicon.svg"></head>
<body><div id="swagger-ui"></div>
<script src="/swagger-assets/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url: '/api/v1/openapi.json', dom_id: '#swagger-ui', layout: 'BaseLayout', deepLinking: true,
showExtensions: true, showCommonExtensions: true, presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset]})</script>
</body></html>`

func (s *Server) docs(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, err := w.Write([]byte(swaggerPage))
	return err
}

func (s *Server) openapi(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	spec, err := fs.ReadFile(s.assets, "docs/openapi.json")
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(spec)
	return err
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "unknown"
	}
	return host
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	f, err := readForm(r, "username", "password")
	if err != nil {
		return err
	}
	f.require("username", "password")
	username := f.text("username", textRule{trim: true, min: 1, max: 64})
	password := f.text("password", textRule{min: 1, max: 128})
	if f.isNull("username") || f.isNull("password") {
		f.add("", "Укажите логин и пароль", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	if err := originCheck(r); err != nil {
		return err
	}
	now := time.Now().Unix()
	// Both buckets prevent changing the username or IP from trivially bypassing a limit.
	keys := []string{digest("ip:" + clientIP(r)), digest("user:" + strings.ToLower(*username))}
	var storedID int64
	var storedName, storedDisplay, storedHash string
	found := false
	err = s.DB.Write(func(tx *sql.Tx) error {
		for _, key := range keys {
			var count, resetAt int64
			err := tx.QueryRow("SELECT count,reset_at FROM auth_attempts WHERE key=? AND reset_at>?", key, now).Scan(&count, &resetAt)
			if err == nil && count >= 10 {
				return &apiError{Status: 429, Detail: "Слишком много попыток. Попробуйте через 5 минут",
					Header: http.Header{"Retry-After": {strconv.FormatInt(resetAt-now, 10)}}}
			}
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return err
			}
		}
		for _, key := range keys {
			if _, err := tx.Exec(`INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?)
				ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
				reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END`, key, now+300, now, now, now+300); err != nil {
				return err
			}
		}
		err := tx.QueryRow("SELECT id,username,display_name,password_hash FROM users WHERE username=? COLLATE NOCASE", *username).
			Scan(&storedID, &storedName, &storedDisplay, &storedHash)
		if err == nil {
			found = true
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		return nil
	})
	if err != nil {
		return err
	}
	isAdmin := strings.EqualFold(*username, s.Settings.AdminUsername)
	encoded := s.adminHash // also verified for unknown users, so timing does not reveal them
	if !isAdmin && found {
		encoded = storedHash
	}
	if !verifyPassword(*password, encoded) || !(isAdmin || found) {
		return fail(401, "Неверный логин или пароль")
	}
	token, csrf := randomToken(32), randomToken(32)
	user := User{ID: storedID, Username: storedName, DisplayName: storedDisplay, Role: "user", CSRFToken: csrf}
	var sessionUser, fingerprint any = storedID, nil
	if isAdmin {
		user = User{ID: 0, Username: s.Settings.AdminUsername, DisplayName: "Администратор", Role: "admin", CSRFToken: csrf}
		sessionUser, fingerprint = nil, s.adminFingerprint()
	}
	maxAge := s.Settings.SessionHours * 3600
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM auth_attempts WHERE key=?", keys[1]); err != nil {
			return err
		}
		// Successful sign-ins do not accumulate failures in the shared IP bucket.
		if _, err := tx.Exec("UPDATE auth_attempts SET count=MAX(0,count-1) WHERE key=?", keys[0]); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO sessions(token_hash,user_id,is_admin,admin_fingerprint,csrf_token,expires_at) VALUES(?,?,?,?,?,?)",
			digest(token), sessionUser, isAdmin, fingerprint, csrf, now+int64(maxAge)); err != nil {
			return err
		}
		return audit(tx, *username, "login", "session")
	})
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, MaxAge: maxAge, Path: "/", HttpOnly: true,
		Secure: s.Settings.CookieSecure, SameSite: http.SameSiteStrictMode})
	return writeJSON(w, 200, user)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, user)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.writeUser(r); err != nil {
		return err
	}
	cookie, _ := r.Cookie(cookieName)
	if _, err := s.DB.Exec("DELETE FROM sessions WHERE token_hash=?", digest(cookie.Value)); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", MaxAge: -1, Path: "/", HttpOnly: true,
		Secure: s.Settings.CookieSecure, SameSite: http.SameSiteStrictMode})
	return noContent(w)
}

func (s *Server) appSettings(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{
		"timezone": s.Settings.Timezone, "today": formatDate(s.Today()), "telegram_enabled": s.Settings.TelegramEnabled,
		"reminder_days": 3, "reminder_interval_seconds": s.Settings.ReminderInterval,
	})
}
