package app

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
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
	if s.TelegramEnabled && (s.TelegramBotToken == "" || s.TelegramChatID == "") {
		return errors.New("Для Telegram необходимы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID")
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

// LoadDotenv sets variables from the file without overriding the real environment.
func LoadDotenv(path string) error {
	file, err := os.Open(path)
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

func env(key, fallback string) string {
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

// SettingsFromEnv reads ./.env (relative to root) and the process environment.
func SettingsFromEnv(root string) (*Settings, error) {
	if err := LoadDotenv(filepath.Join(root, ".env")); err != nil {
		return nil, err
	}
	dbPath := env("DATABASE_PATH", "./data/invoice-keeper.sqlite3")
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
	s := &Settings{
		DatabasePath:     dbPath,
		AdminUsername:    env("ADMIN_USERNAME", "admin"),
		AdminPassword:    env("ADMIN_PASSWORD", ""),
		Timezone:         env("APP_TIMEZONE", "Europe/Moscow"),
		SessionHours:     sessionHours,
		CookieSecure:     strings.EqualFold(env("COOKIE_SECURE", "false"), "true"),
		TelegramEnabled:  strings.EqualFold(env("TELEGRAM_ENABLED", "false"), "true"),
		TelegramBotToken: env("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:   env("TELEGRAM_CHAT_ID", ""),
		ReminderInterval: interval,
	}
	if err := s.Validate(); err != nil {
		return nil, err
	}
	return s, nil
}
