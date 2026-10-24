package notify

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"invoice-keeper/internal/app/config"
)

// Notifier sends a plain-text message to a Telegram chat.
type Notifier func(chatID int64, text string)

// TelegramNotifier posts with the bot token; errors are logged without the token or the response.
func TelegramNotifier(s *config.Settings, baseURL string) Notifier {
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
