package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"invoice-keeper/internal/api"
	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/wallet"
	"invoice-keeper/internal/app/webhooks"
)

const cookieName = "invoice_session"

type Options struct {
	Today    func() time.Time
	Sender   notify.Sender
	Channels map[string]notify.Sender // replaces the channels from .env (tests)
	Notifier notify.Notifier          // security alerts; by default the Telegram bot, when configured
}

type Server struct {
	DB        *store.DB
	Settings  *config.Settings
	Worker    *notify.ReminderWorker
	Sanctions *wallet.Refresher
	Today     func() time.Time
	Now       func() time.Time // wall clock for one-time codes; replaceable in tests

	assets               fs.FS
	pages                map[string]page
	adminHash            string
	handler              http.Handler
	limiter              *rateLimiter
	notifier             notify.Notifier
	alerts               sync.WaitGroup
	botUsername          atomic.Value // set by the Telegram bot after getMe
	metrics              serviceMetrics
	events               eventStreams
	webhookConsoleActive atomic.Int32 // bounded interactive outbound requests
}

func (s *Server) BotUsername() string {
	name, _ := s.botUsername.Load().(string)
	return name
}

func (s *Server) SetBotUsername(name string) { s.botUsername.Store(name) }

// NewServer prepares routes and materializes periods. The reminder loop is started separately.
func NewServer(settings *config.Settings, db *store.DB, assets fs.FS, opts Options) (*Server, error) {
	if err := ConfigureEncryption(db, settings.EncryptionKey); err != nil {
		return nil, err
	}
	if err := webhooks.ImportLegacy(db, settings); err != nil {
		return nil, err
	}
	today := opts.Today
	if today == nil {
		today = func() time.Time { return schedule.Today(settings.Location()) }
	}
	s := &Server{
		DB: db, Settings: settings, Today: today, Now: time.Now, assets: assets,
		events:    newEventStreams(),
		Worker:    notify.NewReminderWorker(db, settings, opts.Sender, today),
		adminHash: security.HashPassword(settings.AdminPassword),
	}
	if opts.Channels != nil {
		s.Worker.Channels = opts.Channels
	}
	s.Worker.Maintenance = func(tx *sql.Tx) error { return cleanupKeys(tx, settings.KeyIdleDays, time.Now()) }
	s.Sanctions = &wallet.Refresher{DB: db, Settings: settings}
	s.notifier = opts.Notifier
	if s.notifier == nil && settings.TelegramBotToken != "" {
		s.notifier = notify.TelegramNotifier(settings, "")
	}
	if err := db.Write(func(tx *sql.Tx) error { return schedule.Materialize(tx, today()) }); err != nil {
		return nil, err
	}
	app, err := fs.Sub(assets, "web/app")
	if err != nil {
		return nil, err
	}
	if s.pages, err = loadPages(app); err != nil {
		return nil, err
	}
	s.limiter = newRateLimiter(float64(settings.RateLimitPerSecond), float64(settings.RateLimitBurst))
	s.handler = s.realIP(s.accessLog(s.securityHeaders(s.rateLimit(s.routes()))))
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
		log.Printf("%s %q: %v", r.Method, r.URL.Path, err) // #nosec G706 -- %q escapes the path, so it cannot forge log lines
		apiErr = &apiError{Status: 500, Detail: "Внутренняя ошибка сервера"}
	}
	for key, values := range apiErr.Header {
		w.Header()[key] = values
	}
	body := map[string]any{"detail": apiErr.Detail}
	if apiErr.Code != "" {
		body["code"] = apiErr.Code
	}
	writeJSON(w, apiErr.Status, body)
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

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cache-Control", "no-store")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		// Other sites cannot hold a reference to our window or embed our responses.
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("X-Permitted-Cross-Domain-Policies", "none")
		if s.Settings.CookieSecure {
			// Secure cookies mean the site is served over HTTPS: browsers must never fall back to HTTP.
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
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
	mux.Handle("GET /manifest.webmanifest", files(app))
	mux.Handle("GET /notification-worker.js", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		files(app).ServeHTTP(w, r)
	}))
	mux.Handle("GET /swagger-assets/", http.StripPrefix("/swagger-assets", files(swagger)))

	handle("/", s.notFound)
	handle("GET /", s.panelPage)
	handle("GET /login", s.loginPage)
	handle("GET /confirm-email", func(w http.ResponseWriter, r *http.Request) error {
		w.Header().Set("Referrer-Policy", "no-referrer")
		return s.servePage(w, "confirm-email", 200)
	})
	handle("GET /api/v1/docs", s.docs)
	handle("GET /api/v1/openapi.json", s.openapi)
	handle("GET /metrics", s.prometheusMetrics)
	handle("GET /extension.zip", s.extensionZip)
	preflight := cors(func(http.ResponseWriter, *http.Request) error { return nil })
	handle("OPTIONS /api/v1/extension/whoami", preflight)
	handle("OPTIONS /api/v1/payment-suggestions", preflight)
	handle("OPTIONS /api/v1/extension/pairings/claim", preflight)
	// API routes come from the spec: the generated code registers every documented operation.
	api.HandlerWithOptions(apiAdapter{s}, api.StdHTTPServerOptions{BaseRouter: mux, ErrorHandlerFunc: parameterError})
	return mux
}

// onlyQuery refuses unknown query parameters, the way readForm refuses unknown body fields:
// a misspelled filter must not silently return everything.
func onlyQuery(allowed []string, next handlerFunc) handlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		var errs []fieldError
		for name := range r.URL.Query() {
			if !slices.Contains(allowed, name) {
				errs = append(errs, fieldError{Loc: []any{"query", name}, Msg: "Неизвестный параметр", Type: "extra_forbidden"})
			}
		}
		if len(errs) > 0 {
			return &apiError{Status: 422, Detail: errs}
		}
		return next(w, r)
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

	viaToken bool // authenticated by an API token, not by the panel session
}

func (s *Server) adminFingerprint() string {
	return security.Digest(s.Settings.AdminUsername + "\x00" + s.Settings.AdminPassword)
}

// currentUser authenticates a reading request: the panel session cookie or an API token (read or write).
func (s *Server) currentUser(r *http.Request) (*User, error) {
	if hasBearer(r) {
		return s.tokenUser(r, "read", "write")
	}
	return s.sessionUser(r, true)
}

// Event-stream heartbeats authenticate read-only: passive connections must not
// keep writing session activity or wait for a write lock held by a transport.
func (s *Server) sessionUser(r *http.Request, touch bool) (*User, error) {
	cookie, err := r.Cookie(cookieName)
	if err != nil || cookie.Value == "" || len(cookie.Value) > 128 {
		return nil, fail(401, "Войдите в систему")
	}
	var userID, lastSeen sql.NullInt64
	var isAdmin bool
	var fingerprint sql.NullString
	var csrf string
	hash := security.Digest(cookie.Value)
	now := time.Now().Unix()
	err = s.DB.QueryRowContext(r.Context(), "SELECT user_id,is_admin,admin_fingerprint,csrf_token,last_seen_at FROM sessions WHERE token_hash=? AND expires_at>?",
		hash, now).Scan(&userID, &isAdmin, &fingerprint, &csrf, &lastSeen)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(401, "Сессия завершена. Войдите снова")
	}
	if err != nil {
		return nil, err
	}
	// «Последняя активность» in the sessions list; written at most once a minute.
	if touch && (!lastSeen.Valid || now-lastSeen.Int64 >= 60) {
		if _, err := s.DB.ExecContext(r.Context(), "UPDATE sessions SET last_seen_at=?,ip=? WHERE token_hash=?", now, clientIP(r), hash); err != nil {
			return nil, err
		}
	}
	if isAdmin {
		if !security.Equal(fingerprint.String, s.adminFingerprint()) {
			return nil, fail(401, "Настройки администратора изменены. Войдите снова")
		}
		return &User{ID: 0, Username: s.Settings.AdminUsername, DisplayName: "Администратор", Role: "admin", CSRFToken: csrf}, nil
	}
	user := &User{Role: "user", CSRFToken: csrf}
	err = s.DB.QueryRowContext(r.Context(), "SELECT id,username,display_name FROM users WHERE id=?", userID.Int64).Scan(&user.ID, &user.Username, &user.DisplayName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(401, "Пользователь удалён")
	}
	return user, err
}

// originCheck requires the Origin of this site on state-changing cookie requests. Browsers send it
// with every POST, PATCH and DELETE, so a request without it is not from the panel; scripts use API tokens.
func (s *Server) originCheck(r *http.Request) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return &apiError{Status: 403, Detail: "Нет заголовка Origin. Для скриптов используйте токен API", Code: "origin_required"}
	}
	if !s.sameSite(r, origin) {
		return fail(403, "Запрос с другого сайта запрещён")
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return fail(403, "Запрос с другого сайта запрещён")
	}
	return nil
}

// writeUser authorizes a state-changing request: session, same origin and CSRF token —
// or a write API token, which is not an ambient credential and needs no CSRF token.
func (s *Server) writeUser(r *http.Request) (*User, error) {
	if hasBearer(r) {
		return s.tokenUser(r, "write")
	}
	user, err := s.currentUser(r)
	if err != nil {
		return nil, err
	}
	if err := s.originCheck(r); err != nil {
		return nil, err
	}
	token := r.Header.Get("X-CSRF-Token")
	if token == "" || !security.Equal(token, user.CSRFToken) {
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
	f, err := readForm(r, "username", "password", "code")
	if err != nil {
		return err
	}
	f.require("username", "password")
	username := f.text("username", textRule{trim: true, min: 1, max: 64})
	password := f.text("password", textRule{min: 1, max: 128})
	code := f.text("code", textRule{trim: true, max: 12})
	if f.isNull("username") || f.isNull("password") {
		f.add("", "Укажите логин и пароль", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	if err := s.originCheck(r); err != nil {
		return err
	}
	now := time.Now().Unix()
	// Both buckets prevent changing the username or IP from trivially bypassing a limit.
	keys := []string{security.Digest("ip:" + clientIP(r)), security.Digest("user:" + strings.ToLower(*username))}
	var storedID int64
	var storedName, storedDisplay, storedHash string
	found := false
	err = s.DB.Write(func(tx *sql.Tx) error {
		if err := limitAttempts(tx, keys, now); err != nil {
			return err
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
	if !security.VerifyPassword(*password, encoded) || !(isAdmin || found) {
		s.alertLockout(r, strings.ToLower(*username), keys[1])
		return fail(401, "Неверный логин или пароль")
	}
	if isAdmin {
		if err := s.checkSecondFactor(code); err != nil {
			return err
		}
	} else if security.NeedsRehash(storedHash) {
		// Upgrade a scrypt (or weaker Argon2id) hash now that the password is known.
		if _, err := s.DB.Exec("UPDATE users SET password_hash=? WHERE id=? AND password_hash=?", security.HashPassword(*password), storedID, storedHash); err != nil {
			return err
		}
	}
	token, csrf := security.RandomToken(32), security.RandomToken(32)
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
		if _, err := tx.Exec(`INSERT INTO sessions(token_hash,user_id,is_admin,admin_fingerprint,csrf_token,expires_at,created_at,last_seen_at,user_agent,ip)
			VALUES(?,?,?,?,?,?,?,?,?,?)`, security.Digest(token), sessionUser, isAdmin, fingerprint, csrf, now+int64(maxAge), now, now,
			nullable(userAgent(r)), clientIP(r)); err != nil {
			return err
		}
		return audit.Record(tx, *username, "login", "session")
	})
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, MaxAge: maxAge, Path: "/", HttpOnly: true, // #nosec G124 -- Secure follows COOKIE_SECURE: false only for local HTTP
		Secure: s.Settings.CookieSecure, SameSite: http.SameSiteStrictMode})
	s.alertSignIn(r, storedID, isAdmin)
	return writeJSON(w, 200, user)
}

// limitAttempts refuses after 10 failures in 5 minutes per key and counts this attempt;
// a successful sign-in clears the user's bucket afterwards.
func limitAttempts(tx *sql.Tx, keys []string, now int64) error {
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
	return nil
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, user)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	if _, err := panelOnly(s.writeUser(r)); err != nil {
		return err
	}
	cookie, _ := r.Cookie(cookieName)
	if _, err := s.DB.Exec("DELETE FROM sessions WHERE token_hash=?", security.Digest(cookie.Value)); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", MaxAge: -1, Path: "/", HttpOnly: true, // #nosec G124 -- Secure follows COOKIE_SECURE: false only for local HTTP
		Secure: s.Settings.CookieSecure, SameSite: http.SameSiteStrictMode})
	return noContent(w)
}

func (s *Server) appSettings(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	channels, err := s.channelNames()
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{
		"timezone": s.Settings.Timezone, "today": schedule.FormatDate(s.Today()), "telegram_enabled": s.Settings.TelegramEnabled,
		"team_chat": s.Settings.TelegramEnabled && s.Settings.TelegramChatID != "", "bot_username": s.BotUsername(),
		"reminder_days": 3, "reminder_interval_seconds": s.Settings.ReminderInterval,
		"support_telegram": s.Settings.SupportTelegram, "support_email": s.Settings.SupportEmail,
		"channels": channels, "overdue_reminders": s.Settings.OverdueReminders, "sanctions_screening": s.Settings.OFACEnabled, "key_idle_days": s.Settings.KeyIdleDays,
		"security": map[string]bool{"encryption": security.Enabled(), "login_alerts": s.Settings.LoginAlerts && s.notifier != nil,
			"paid_linked_only": s.Settings.PaidLinkedOnly},
	})
}
