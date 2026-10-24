package app

// MAX bot: long polling GET /updates for the «✅ Оплачено» button under reminders and the commands
// /todo, /overdue, /chatid, /help. Like the Telegram bot, only the configured chat (MAX_CHAT_ID)
// may read data or mark payments; /chatid and /help answer anywhere to help with the setup.

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type maxUser struct {
	UserID    int64  `json:"user_id"`
	Name      string `json:"name"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

type maxMessage struct {
	Recipient struct {
		ChatID   int64  `json:"chat_id"`
		ChatType string `json:"chat_type"`
	} `json:"recipient"`
	Sender *maxUser `json:"sender"`
	Body   struct {
		Text string `json:"text"`
	} `json:"body"`
}

type maxUpdate struct {
	UpdateType string      `json:"update_type"`
	Message    *maxMessage `json:"message"`
	Callback   *struct {
		CallbackID string  `json:"callback_id"`
		Payload    string  `json:"payload"`
		User       maxUser `json:"user"`
	} `json:"callback"`
}

type MaxBot struct {
	server *Server
	client *http.Client
	stop   chan struct{}
	done   chan struct{}
}

func NewMaxBot(s *Server, client *http.Client) *MaxBot {
	if client == nil {
		client = maxClient(s.Settings, 45*time.Second)
	}
	return &MaxBot{server: s, client: client}
}

// call invokes a method and decodes the answer; errors never contain the token or the response body.
func (b *MaxBot) call(method, path string, payload, result any) error {
	response, err := maxCall(b.client, b.server.Settings, method, path, payload)
	if err != nil {
		return fmt.Errorf("MAX %s: соединение не удалось", strings.SplitN(path, "?", 2)[0])
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("MAX %s: HTTP %d", strings.SplitN(path, "?", 2)[0], response.StatusCode)
	}
	if result == nil {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(result)
}

func (b *MaxBot) Start() {
	if b.server.Settings.MaxBotToken == "" {
		return
	}
	b.stop, b.done = make(chan struct{}), make(chan struct{})
	go func() {
		defer close(b.done)
		for {
			if err := b.pollOnce(30); err != nil {
				log.Printf("MAX-бот: %v", err)
				select {
				case <-b.stop:
					return
				case <-time.After(5 * time.Second):
				}
			}
			select {
			case <-b.stop:
				return
			default:
			}
		}
	}()
}

func (b *MaxBot) Stop() {
	if b.stop == nil {
		return
	}
	close(b.stop)
	select {
	case <-b.done:
	case <-time.After(2 * time.Second):
	}
}

// pollOnce fetches one batch; the marker is stored so a restart does not replay handled updates.
func (b *MaxBot) pollOnce(timeout int) error {
	query := url.Values{"timeout": {strconv.Itoa(timeout)}, "types": {"message_callback,message_created"}}
	var stored string
	if err := b.server.DB.QueryRow("SELECT value FROM app_state WHERE key='max_marker'").Scan(&stored); err == nil {
		query.Set("marker", stored)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var batch struct {
		Updates []maxUpdate `json:"updates"`
		Marker  *int64      `json:"marker"`
	}
	if err := b.call("GET", "/updates?"+query.Encode(), nil, &batch); err != nil {
		return err
	}
	for _, update := range batch.Updates {
		if err := b.handle(update); err != nil {
			log.Printf("MAX-бот: %v", err)
		}
	}
	if batch.Marker == nil || itoa(*batch.Marker) == stored {
		return nil
	}
	return setState(b.server.DB, "max_marker", itoa(*batch.Marker))
}

func (b *MaxBot) ourChat(id int64) bool { return b.server.Settings.MaxChatID == itoa(id) }

func (b *MaxBot) send(chatID int64, text string) error {
	return b.call("POST", "/messages?chat_id="+itoa(chatID), map[string]any{"text": text}, nil)
}

func maxActor(u maxUser) string {
	switch {
	case u.Username != "":
		return "max:@" + u.Username
	case u.Name != "":
		return "max:" + u.Name
	case u.FirstName != "":
		return "max:" + u.FirstName
	}
	return "max:" + itoa(u.UserID)
}

const maxHelp = `Invoice Keeper напоминает о регулярных платежах за 3 дня до срока.

/todo — что оплатить в ближайшие 7 дней и что просрочено
/overdue — только просроченные
/chatid — ID этого чата для настройки
Под напоминанием есть кнопка «✅ Оплачено».`

func (b *MaxBot) handle(update maxUpdate) error {
	switch {
	case update.UpdateType == "message_callback" && update.Callback != nil:
		return b.onCallback(update)
	case update.UpdateType == "message_created" && update.Message != nil:
		return b.onMessage(update.Message)
	}
	return nil
}

func (b *MaxBot) onMessage(m *maxMessage) error {
	fields := strings.Fields(m.Body.Text)
	if len(fields) == 0 || !strings.HasPrefix(fields[0], "/") {
		return nil
	}
	chat := m.Recipient.ChatID
	switch command := strings.ToLower(fields[0]); command {
	case "/chatid":
		note := ""
		if !b.ourChat(chat) {
			note = "\nУкажите его в MAX_CHAT_ID на сервере, чтобы напоминания приходили сюда."
		}
		return b.send(chat, fmt.Sprintf("ID этого чата: %d%s", chat, note))
	case "/start", "/help":
		return b.send(chat, maxHelp)
	case "/todo", "/overdue":
		if !b.ourChat(chat) {
			return b.send(chat, "Этот чат не подключён к Invoice Keeper.")
		}
		text, err := b.server.todoText(command == "/overdue")
		if err != nil {
			return err
		}
		return b.send(chat, text)
	}
	return nil
}

// onCallback marks the period paid and replaces the message: without attachments the button
// disappears, so nobody presses it twice.
func (b *MaxBot) onCallback(update maxUpdate) error {
	callback := update.Callback
	answer := func(notification, newText string) error {
		body := map[string]any{"notification": notification}
		if newText != "" {
			body["message"] = map[string]any{"text": newText, "attachments": []any{}}
		}
		return b.call("POST", "/answers?callback_id="+url.QueryEscape(callback.CallbackID), body, nil)
	}
	if update.Message == nil || !b.ourChat(update.Message.Recipient.ChatID) {
		return answer("Нет доступа", "")
	}
	raw, ok := strings.CutPrefix(callback.Payload, "paid:")
	id, err := strconv.ParseInt(raw, 10, 64)
	if !ok || err != nil {
		return answer("Неизвестная кнопка", "")
	}
	actor := maxActor(callback.User)
	already, err := b.server.markPaidFromMessenger(id, actor)
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.Status == 404 {
		return answer("Платёж не найден", "")
	}
	if err != nil {
		return err
	}
	if already {
		return answer("Уже отмечено ранее", "")
	}
	return answer("Отмечено: оплачено", update.Message.Body.Text+
		fmt.Sprintf("\n\n✅ Оплачено — %s, %s", strings.TrimPrefix(actor, "max:"), shortDate(formatDate(b.server.Today()))))
}
