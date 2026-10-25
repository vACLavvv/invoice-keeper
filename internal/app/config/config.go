// Package config reads the settings from the environment and .env, fills defaults and refuses
// unsafe or incomplete configuration.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"invoice-keeper/internal/app/security"
)

type Settings struct {
	DatabasePath     string
	AdminUsername    string
	AdminPassword    string
	Timezone         string
	SessionHours     int
	CookieSecure     bool
	PublicBaseURL    string         // PUBLIC_BASE_URL: the address users open, e.g. https://keeper.example.ru; Origin must match it
	TrustedProxies   []netip.Prefix // TRUSTED_PROXIES: reverse proxies whose X-Forwarded-For is believed
	LogRequests      bool           // one log line per request (LOG_REQUESTS); secrets are never logged
	LogFormat        string         // text | json
	MetricsToken     string         // independent read-only secret for Prometheus; empty disables /metrics
	TelegramEnabled  bool
	TelegramBotToken string
	TelegramChatID   string
	ReminderInterval int
	SupportTelegram  string // shown on the help page, e.g. @team_support
	SupportEmail     string
	OverdueReminders bool // one more message the day after an unpaid due date

	MaxBotToken string // MAX messenger: reminders to MAX_CHAT_ID with the «Оплачено» button
	MaxChatID   string
	MaxAPIURL   string
	MaxCAFile   string // extra root certificate (PEM) if the system does not trust the MAX API

	SMTPHost     string // SMTP_HOST and SMTP_FROM enable mail; SMTP_TO is an optional shared broadcast
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
	SMTPTo       []string
	SMTPSecurity string // starttls | ssl | none

	WebhookURL    string // reminders as JSON POST, signed with HMAC-SHA256 when WebhookSecret is set
	WebhookSecret string
	// WebhookAllowPrivate lets WEBHOOK_URL point to loopback or private networks (a receiver on the same server).
	WebhookAllowPrivate bool

	EncryptionKey  []byte // DATA_ENCRYPTION_KEY: encrypts secrets, receipts and payment details in the database
	LoginAlerts    bool   // Telegram message to the owner on every sign-in and on a sign-in lockout
	PaidLinkedOnly bool   // «Оплачено» in Telegram only from members who linked their account in the panel

	KeyIdleDays int // API keys and tokens unused this long stop working; 0 — never

	RateLimitPerSecond int // API requests per second per IP or token (burst RateLimitBurst)
	RateLimitBurst     int

	OFACEnabled      bool // screen payee wallets against the OFAC SDN list
	OFACListURL      string
	OFACRefreshHours int

	location *time.Location
}

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

// Validate fills defaults and rejects unsafe or incomplete configuration.
func (s *Settings) Validate() error {
	if s.MetricsToken != "" && (len(s.MetricsToken) < 32 || strings.ContainsAny(s.MetricsToken, " \r\n\t")) {
		return errors.New("METRICS_TOKEN: минимум 32 символа без пробелов")
	}
	if s.Timezone == "" {
		s.Timezone = "Europe/Moscow"
	}
	if s.SessionHours == 0 {
		s.SessionHours = 12
	}
	if s.ReminderInterval == 0 {
		s.ReminderInterval = 60
	}
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		return errors.New("Неизвестный часовой пояс APP_TIMEZONE")
	}
	s.location = loc
	n := len([]rune(s.AdminPassword))
	if !usernamePattern.MatchString(s.AdminUsername) || n < 12 || n > 128 || s.AdminPassword == "replace-with-a-long-random-password" {
		return errors.New("Задайте ADMIN_USERNAME и случайный ADMIN_PASSWORD (минимум 12 символов). Запуск: invoice-keeper bootstrap --demo")
	}
	if reason := security.WeakPasswordReason(s.AdminPassword, s.AdminUsername); reason != "" {
		return errors.New("ADMIN_PASSWORD слабый: " + reason + ". Сгенерируйте случайный, например: openssl rand -base64 24")
	}
	// Without TELEGRAM_CHAT_ID reminders go only to users who linked Telegram in the panel.
	if s.TelegramEnabled && s.TelegramBotToken == "" {
		return errors.New("Для Telegram необходим TELEGRAM_BOT_TOKEN")
	}
	if s.MaxAPIURL == "" {
		s.MaxAPIURL = "https://platform-api.max.ru"
	}
	if (s.MaxBotToken == "") != (s.MaxChatID == "") {
		return errors.New("Для MAX нужны оба параметра: MAX_BOT_TOKEN и MAX_CHAT_ID")
	}
	if s.MaxChatID != "" {
		if _, err := strconv.ParseInt(s.MaxChatID, 10, 64); err != nil {
			return errors.New("MAX_CHAT_ID должен быть числом, например -71234567890123")
		}
	}
	if s.SMTPSecurity == "" {
		s.SMTPSecurity = "starttls"
	}
	if s.SMTPSecurity != "starttls" && s.SMTPSecurity != "ssl" && s.SMTPSecurity != "none" {
		return errors.New("SMTP_SECURITY: допустимы starttls, ssl или none")
	}
	if s.SMTPPort == 0 {
		s.SMTPPort = map[string]int{"starttls": 587, "ssl": 465, "none": 25}[s.SMTPSecurity]
	}
	if s.SMTPHost != "" && s.SMTPFrom == "" {
		return errors.New("Для email-напоминаний нужны SMTP_HOST и SMTP_FROM")
	}
	if s.WebhookURL != "" && !webURL(s.WebhookURL) {
		return errors.New("WEBHOOK_URL должен начинаться с http:// или https://")
	}
	if s.PublicBaseURL != "" {
		parsed, err := url.Parse(s.PublicBaseURL)
		if err != nil || !webURL(s.PublicBaseURL) || strings.Trim(parsed.Path, "/") != "" || parsed.RawQuery != "" || parsed.User != nil {
			return errors.New("PUBLIC_BASE_URL — только схема и адрес сайта, например https://keeper.example.ru")
		}
		s.PublicBaseURL = parsed.Scheme + "://" + parsed.Host
	}
	if s.LogFormat == "" {
		s.LogFormat = "text"
	}
	if s.LogFormat != "text" && s.LogFormat != "json" {
		return errors.New("LOG_FORMAT: допустимы text или json")
	}
	if s.KeyIdleDays < 0 || s.KeyIdleDays > 3650 {
		return errors.New("KEY_IDLE_DAYS: от 0 (не отключать) до 3650")
	}
	if s.RateLimitPerSecond == 0 {
		s.RateLimitPerSecond = 20
	}
	if s.RateLimitBurst == 0 {
		s.RateLimitBurst = 120
	}
	if s.RateLimitPerSecond < 1 || s.RateLimitBurst < s.RateLimitPerSecond {
		return errors.New("RATE_LIMIT_PER_SECOND должен быть не меньше 1, а RATE_LIMIT_BURST — не меньше него")
	}
	if s.OFACListURL == "" {
		s.OFACListURL = DefaultOFACURL
	}
	if s.OFACRefreshHours == 0 {
		s.OFACRefreshHours = 24
	}
	if s.OFACRefreshHours < 1 || s.OFACRefreshHours > 720 {
		return errors.New("OFAC_REFRESH_HOURS: от 1 до 720")
	}
	if s.SessionHours < 1 || s.SessionHours > 168 || s.ReminderInterval < 10 || s.ReminderInterval > 3600 {
		return errors.New("Недопустимый срок сессии или интервал напоминаний")
	}
	return nil
}

func (s *Settings) Location() *time.Location {
	if s.location == nil {
		s.location = time.UTC
	}
	return s.location
}

// EnvFileWarning reports a .env readable by other users of the system: it holds the admin password
// and bot tokens. Windows has no such permission bits, so it is not checked there.
func EnvFileWarning(root string) string {
	if runtime.GOOS == "windows" {
		return ""
	}
	info, err := os.Stat(filepath.Join(root, ".env"))
	if err != nil || info.Mode().Perm()&0o077 == 0 {
		return ""
	}
	return fmt.Sprintf("Файл .env доступен другим пользователям системы (права %o). Выполните: chmod 600 .env", info.Mode().Perm())
}

// LoadDotenv sets variables from the file without overriding the real environment.
func LoadDotenv(path string) error {
	file, err := os.Open(path) // #nosec G304 -- the .env path is chosen by the operator
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(strings.TrimPrefix(line, "export "), "=")
		if !ok {
			continue
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
	return scanner.Err()
}

// Env returns the variable, or fallback when it is not set (an empty value counts as set).
func Env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return 0, errors.New(key + " должен быть целым числом")
	}
	return n, nil
}

// FromEnv reads ./.env (relative to root) and the process environment.
func FromEnv(root string) (*Settings, error) {
	if err := LoadDotenv(filepath.Join(root, ".env")); err != nil {
		return nil, err
	}
	dbPath := Env("DATABASE_PATH", "./data/invoice-keeper.sqlite3")
	if !filepath.IsAbs(dbPath) {
		dbPath = filepath.Join(root, dbPath)
	}
	sessionHours, err := envInt("SESSION_HOURS", 12)
	if err != nil {
		return nil, err
	}
	interval, err := envInt("REMINDER_INTERVAL_SECONDS", 60)
	if err != nil {
		return nil, err
	}
	smtpPort, err := envInt("SMTP_PORT", 0)
	if err != nil {
		return nil, err
	}
	ofacHours, err := envInt("OFAC_REFRESH_HOURS", 24)
	if err != nil {
		return nil, err
	}
	keyIdleDays, err := envInt("KEY_IDLE_DAYS", 90)
	if err != nil {
		return nil, err
	}
	ratePerSecond, err := envInt("RATE_LIMIT_PER_SECOND", 20)
	if err != nil {
		return nil, err
	}
	rateBurst, err := envInt("RATE_LIMIT_BURST", 120)
	if err != nil {
		return nil, err
	}
	encryptionKey, err := security.ParseEncryptionKey(strings.TrimSpace(Env("DATA_ENCRYPTION_KEY", "")))
	if err != nil {
		return nil, err
	}
	proxies, err := ParseProxies(Env("TRUSTED_PROXIES", ""))
	if err != nil {
		return nil, err
	}
	publicURL := strings.TrimSpace(Env("PUBLIC_BASE_URL", ""))
	// Behind HTTPS cookies are Secure unless COOKIE_SECURE says otherwise.
	cookieDefault := strconv.FormatBool(strings.HasPrefix(strings.ToLower(publicURL), "https://"))
	var smtpTo []string
	for _, address := range strings.Split(Env("SMTP_TO", ""), ",") {
		if address = strings.TrimSpace(address); address != "" {
			smtpTo = append(smtpTo, address)
		}
	}
	s := &Settings{
		DatabasePath:        dbPath,
		AdminUsername:       Env("ADMIN_USERNAME", "admin"),
		AdminPassword:       Env("ADMIN_PASSWORD", ""),
		Timezone:            Env("APP_TIMEZONE", "Europe/Moscow"),
		SessionHours:        sessionHours,
		CookieSecure:        strings.EqualFold(Env("COOKIE_SECURE", cookieDefault), "true"),
		PublicBaseURL:       publicURL,
		TrustedProxies:      proxies,
		LogRequests:         !strings.EqualFold(Env("LOG_REQUESTS", "true"), "false"),
		LogFormat:           strings.ToLower(strings.TrimSpace(Env("LOG_FORMAT", ""))),
		MetricsToken:        Env("METRICS_TOKEN", ""),
		TelegramEnabled:     strings.EqualFold(Env("TELEGRAM_ENABLED", "false"), "true"),
		TelegramBotToken:    Env("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:      Env("TELEGRAM_CHAT_ID", ""),
		ReminderInterval:    interval,
		SupportTelegram:     strings.TrimSpace(Env("SUPPORT_TELEGRAM", "")),
		SupportEmail:        strings.TrimSpace(Env("SUPPORT_EMAIL", "")),
		OverdueReminders:    !strings.EqualFold(Env("OVERDUE_REMINDERS", "true"), "false"),
		MaxBotToken:         strings.TrimSpace(Env("MAX_BOT_TOKEN", "")),
		MaxChatID:           strings.TrimSpace(Env("MAX_CHAT_ID", "")),
		MaxAPIURL:           strings.TrimRight(strings.TrimSpace(Env("MAX_API_URL", "")), "/"),
		MaxCAFile:           strings.TrimSpace(Env("MAX_CA_FILE", "")),
		SMTPHost:            strings.TrimSpace(Env("SMTP_HOST", "")),
		SMTPPort:            smtpPort,
		SMTPUsername:        Env("SMTP_USERNAME", ""),
		SMTPPassword:        Env("SMTP_PASSWORD", ""),
		SMTPFrom:            strings.TrimSpace(Env("SMTP_FROM", "")),
		SMTPTo:              smtpTo,
		SMTPSecurity:        strings.ToLower(strings.TrimSpace(Env("SMTP_SECURITY", ""))),
		WebhookURL:          strings.TrimSpace(Env("WEBHOOK_URL", "")),
		WebhookSecret:       Env("WEBHOOK_SECRET", ""),
		WebhookAllowPrivate: strings.EqualFold(Env("WEBHOOK_ALLOW_PRIVATE", "false"), "true"),
		OFACEnabled:         !strings.EqualFold(Env("OFAC_ENABLED", "true"), "false"),
		OFACListURL:         strings.TrimSpace(Env("OFAC_LIST_URL", "")),
		OFACRefreshHours:    ofacHours,
		EncryptionKey:       encryptionKey,
		LoginAlerts:         !strings.EqualFold(Env("LOGIN_ALERTS", "true"), "false"),
		PaidLinkedOnly:      !strings.EqualFold(Env("TELEGRAM_PAID_LINKED_ONLY", "true"), "false"),
		KeyIdleDays:         keyIdleDays,
		RateLimitPerSecond:  ratePerSecond,
		RateLimitBurst:      rateBurst,
	}
	if err := s.Validate(); err != nil {
		return nil, err
	}
	return s, nil
}

// DefaultOFACURL is the official SDN list of the U.S. Treasury (XML, redirects to cloud storage).
const DefaultOFACURL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"

// ParseProxies reads a comma-separated list of IP addresses and CIDR ranges.
func ParseProxies(list string) ([]netip.Prefix, error) {
	var prefixes []netip.Prefix
	for _, item := range strings.Split(list, ",") {
		if item = strings.TrimSpace(item); item == "" {
			continue
		}
		if prefix, err := netip.ParsePrefix(item); err == nil {
			prefixes = append(prefixes, prefix.Masked())
			continue
		}
		addr, err := netip.ParseAddr(item)
		if err != nil {
			return nil, fmt.Errorf("TRUSTED_PROXIES: %q — не IP-адрес и не сеть CIDR", item)
		}
		prefixes = append(prefixes, netip.PrefixFrom(addr.Unmap(), addr.Unmap().BitLen()))
	}
	return prefixes, nil
}

func webURL(link string) bool {
	parsed, err := url.Parse(link)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}
