// Package config reads the settings from the environment and .env, fills defaults and refuses
// unsafe or incomplete configuration.
package config

import (
	"bufio"
	"errors"
	"fmt"
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

	SMTPHost     string // email reminders: SMTP_HOST, SMTP_FROM and SMTP_TO are required
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
	SMTPTo       []string
	SMTPSecurity string // starttls | ssl | none

	WebhookURL    string // reminders as JSON POST, signed with HMAC-SHA256 when WebhookSecret is set
	WebhookSecret string

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
	if s.SMTPHost != "" && (s.SMTPFrom == "" || len(s.SMTPTo) == 0) {
		return errors.New("Для email-напоминаний нужны SMTP_HOST, SMTP_FROM и SMTP_TO")
	}
	if s.WebhookURL != "" && !webURL(s.WebhookURL) {
		return errors.New("WEBHOOK_URL должен начинаться с http:// или https://")
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
	var smtpTo []string
	for _, address := range strings.Split(Env("SMTP_TO", ""), ",") {
		if address = strings.TrimSpace(address); address != "" {
			smtpTo = append(smtpTo, address)
		}
	}
	s := &Settings{
		DatabasePath:       dbPath,
		AdminUsername:      Env("ADMIN_USERNAME", "admin"),
		AdminPassword:      Env("ADMIN_PASSWORD", ""),
		Timezone:           Env("APP_TIMEZONE", "Europe/Moscow"),
		SessionHours:       sessionHours,
		CookieSecure:       strings.EqualFold(Env("COOKIE_SECURE", "false"), "true"),
		TelegramEnabled:    strings.EqualFold(Env("TELEGRAM_ENABLED", "false"), "true"),
		TelegramBotToken:   Env("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:     Env("TELEGRAM_CHAT_ID", ""),
		ReminderInterval:   interval,
		SupportTelegram:    strings.TrimSpace(Env("SUPPORT_TELEGRAM", "")),
		SupportEmail:       strings.TrimSpace(Env("SUPPORT_EMAIL", "")),
		OverdueReminders:   !strings.EqualFold(Env("OVERDUE_REMINDERS", "true"), "false"),
		MaxBotToken:        strings.TrimSpace(Env("MAX_BOT_TOKEN", "")),
		MaxChatID:          strings.TrimSpace(Env("MAX_CHAT_ID", "")),
		MaxAPIURL:          strings.TrimRight(strings.TrimSpace(Env("MAX_API_URL", "")), "/"),
		MaxCAFile:          strings.TrimSpace(Env("MAX_CA_FILE", "")),
		SMTPHost:           strings.TrimSpace(Env("SMTP_HOST", "")),
		SMTPPort:           smtpPort,
		SMTPUsername:       Env("SMTP_USERNAME", ""),
		SMTPPassword:       Env("SMTP_PASSWORD", ""),
		SMTPFrom:           strings.TrimSpace(Env("SMTP_FROM", "")),
		SMTPTo:             smtpTo,
		SMTPSecurity:       strings.ToLower(strings.TrimSpace(Env("SMTP_SECURITY", ""))),
		WebhookURL:         strings.TrimSpace(Env("WEBHOOK_URL", "")),
		WebhookSecret:      Env("WEBHOOK_SECRET", ""),
		OFACEnabled:        !strings.EqualFold(Env("OFAC_ENABLED", "true"), "false"),
		OFACListURL:        strings.TrimSpace(Env("OFAC_LIST_URL", "")),
		OFACRefreshHours:   ofacHours,
		EncryptionKey:      encryptionKey,
		LoginAlerts:        !strings.EqualFold(Env("LOGIN_ALERTS", "true"), "false"),
		PaidLinkedOnly:     !strings.EqualFold(Env("TELEGRAM_PAID_LINKED_ONLY", "true"), "false"),
		KeyIdleDays:        keyIdleDays,
		RateLimitPerSecond: ratePerSecond,
		RateLimitBurst:     rateBurst,
	}
	if err := s.Validate(); err != nil {
		return nil, err
	}
	return s, nil
}

// DefaultOFACURL is the official SDN list of the U.S. Treasury (XML, redirects to cloud storage).
const DefaultOFACURL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"

func webURL(link string) bool {
	parsed, err := url.Parse(link)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}
