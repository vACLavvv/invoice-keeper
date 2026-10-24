package app

// Security alerts to the account owner's linked Telegram: a message on every sign-in (device,
// address, time) and when sign-in is locked after repeated wrong passwords. A stranger's sign-in
// is noticed at once, and the owner can end the session from «Аккаунт». Alerts are best effort:
// they never block or fail the sign-in itself.

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// Notifier sends a plain-text message to a Telegram chat.
type Notifier func(chatID int64, text string)

// TelegramNotifier posts with the bot token; errors are logged without the token or the response.
func TelegramNotifier(s *Settings, baseURL string) Notifier {
	if baseURL == "" {
		baseURL = "https://api.telegram.org"
	}
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return func(chatID int64, text string) {
		body, _ := json.Marshal(map[string]any{"chat_id": chatID, "text": text})
		response, err := client.Post(baseURL+"/bot"+s.TelegramBotToken+"/sendMessage", "application/json", bytes.NewReader(body))
		if err != nil {
			log.Print("Уведомление безопасности: Telegram недоступен")
			return
		}
		response.Body.Close()
		if response.StatusCode != 200 {
			log.Printf("Уведомление безопасности: Telegram ответил HTTP %d", response.StatusCode)
		}
	}
}

// alertOwner sends text to the linked chat of a panel user (userID) or of the admin (userID 0).
func (s *Server) alertOwner(userID int64, isAdmin bool, text string) {
	if !s.Settings.LoginAlerts || s.notifier == nil {
		return
	}
	var chat int64
	query, args := "SELECT chat_id FROM telegram_links WHERE user_id=?", []any{userID}
	if isAdmin {
		query, args = "SELECT chat_id FROM telegram_links WHERE is_admin=1", nil
	}
	if err := s.DB.QueryRow(query, args...).Scan(&chat); err != nil {
		if err != sql.ErrNoRows {
			log.Printf("Уведомление безопасности: %v", err)
		}
		return
	}
	s.alerts.Add(1)
	go func() {
		defer s.alerts.Done()
		s.notifier(chat, text)
	}()
}

// WaitAlerts blocks until alerts started so far are sent (tests, shutdown).
func (s *Server) WaitAlerts() { s.alerts.Wait() }

func (s *Server) localTime() string {
	return time.Now().In(s.Settings.Location()).Format("02.01.2006 15:04")
}

func (s *Server) alertSignIn(r *http.Request, userID int64, isAdmin bool) {
	device := userAgent(r)
	if device == "" {
		device = "неизвестно"
	}
	s.alertOwner(userID, isAdmin, "🔐 Вход в Invoice Keeper\n\nУстройство: "+device+"\nАдрес: "+clientIP(r)+"\nВремя: "+s.localTime()+
		"\n\nЕсли это были не вы — откройте «Аккаунт», завершите чужие сессии и смените пароль.")
}

// alertLockout fires once per lock: when the failures for this login reach the limit.
func (s *Server) alertLockout(r *http.Request, username string, userKey string) {
	var count int64
	if err := s.DB.QueryRow("SELECT count FROM auth_attempts WHERE key=? AND reset_at>?", userKey, time.Now().Unix()).Scan(&count); err != nil || count != 10 {
		return
	}
	text := "⚠️ Много неудачных попыток входа в вашу учётную запись Invoice Keeper\n\nПоследняя с адреса: " + clientIP(r) +
		"\nВремя: " + s.localTime() + "\n\nВход по этому логину закрыт на 5 минут. Если это не вы, пароль, возможно, пытаются подобрать: " +
		"смените его на длинный и уникальный."
	if strings.EqualFold(username, s.Settings.AdminUsername) {
		s.alertOwner(0, true, text)
		return
	}
	var id int64
	if s.DB.QueryRow("SELECT id FROM users WHERE username=? COLLATE NOCASE", username).Scan(&id) == nil {
		s.alertOwner(id, false, text)
	}
}
