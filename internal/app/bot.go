package app

// Telegram bot: long polling (no public HTTPS needed) for the «Оплачено» button and the commands
// /todo, /overdue, /help, /chatid. Only the configured chat (TELEGRAM_CHAT_ID) may read data or
// mark payments; /chatid and /help answer anywhere so the chat can be connected without getUpdates.

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type tgUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

type tgMessage struct {
	MessageID int64 `json:"message_id"`
	Chat      struct {
		ID    int64  `json:"id"`
		Type  string `json:"type"`
		Title string `json:"title"`
	} `json:"chat"`
	From *tgUser `json:"from"`
	Text string  `json:"text"`
}

type tgCallback struct {
	ID      string     `json:"id"`
	From    tgUser     `json:"from"`
	Message *tgMessage `json:"message"`
	Data    string     `json:"data"`
}

type tgUpdate struct {
	UpdateID      int64       `json:"update_id"`
	Message       *tgMessage  `json:"message"`
	CallbackQuery *tgCallback `json:"callback_query"`
}

type Bot struct {
	server  *Server
	baseURL string
	client  *http.Client
	stop    chan struct{}
	done    chan struct{}
}

func NewBot(s *Server, baseURL string) *Bot {
	if baseURL == "" {
		baseURL = "https://api.telegram.org"
	}
	return &Bot{server: s, baseURL: baseURL, client: &http.Client{Timeout: 70 * time.Second}}
}

// call invokes a Bot API method. Errors never contain the token: the request URL is not reported.
func (b *Bot) call(method string, payload any, result any) error {
	body, _ := json.Marshal(payload)
	response, err := b.client.Post(b.baseURL+"/bot"+b.server.Settings.TelegramBotToken+"/"+method, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram %s: соединение не удалось", method)
	}
	defer response.Body.Close()
	var answer struct {
		OK          bool            `json:"ok"`
		Result      json.RawMessage `json:"result"`
		Description string          `json:"description"`
	}
	if err := json.NewDecoder(response.Body).Decode(&answer); err != nil {
		return fmt.Errorf("telegram %s: неожиданный ответ (HTTP %d)", method, response.StatusCode)
	}
	if !answer.OK {
		return fmt.Errorf("telegram %s: %s", method, answer.Description)
	}
	if result != nil {
		return json.Unmarshal(answer.Result, result)
	}
	return nil
}

func (b *Bot) Start() {
	if b.server.Settings.TelegramBotToken == "" {
		return
	}
	b.stop, b.done = make(chan struct{}), make(chan struct{})
	go func() {
		defer close(b.done)
		var me tgUser
		if err := b.call("getMe", map[string]any{}, &me); err != nil {
			log.Printf("Telegram-бот: %v", err)
		} else {
			b.server.SetBotUsername(me.Username)
		}
		// The command menu next to the input field in Telegram.
		if err := b.call("setMyCommands", map[string]any{"commands": []map[string]string{
			{"command": "todo", "description": "Что оплатить в ближайшие 7 дней"},
			{"command": "overdue", "description": "Просроченные платежи"},
			{"command": "chatid", "description": "ID этого чата"},
			{"command": "help", "description": "Справка"},
		}}, nil); err != nil {
			log.Printf("Telegram-бот: %v", err)
		}
		for {
			if err := b.pollOnce(50); err != nil {
				log.Printf("Telegram-бот: %v", err)
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

func (b *Bot) Stop() {
	if b.stop == nil {
		return
	}
	close(b.stop)
	// A long poll may be in flight; the process is exiting anyway.
	select {
	case <-b.done:
	case <-time.After(2 * time.Second):
	}
}

// pollOnce fetches one batch and remembers the offset, so a restart does not replay handled updates.
func (b *Bot) pollOnce(timeout int) error {
	var offset int64
	var stored string
	if err := b.server.DB.QueryRow("SELECT value FROM app_state WHERE key='telegram_offset'").Scan(&stored); err == nil {
		offset, _ = strconv.ParseInt(stored, 10, 64)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var updates []tgUpdate
	err := b.call("getUpdates", map[string]any{"offset": offset, "timeout": timeout, "allowed_updates": []string{"message", "callback_query"}}, &updates)
	if err != nil {
		return err
	}
	for _, update := range updates {
		b.handle(update)
		offset = update.UpdateID + 1
	}
	if len(updates) == 0 {
		return nil
	}
	_, err = b.server.DB.Exec("INSERT INTO app_state(key,value) VALUES('telegram_offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", itoa(offset))
	return err
}

func (b *Bot) handle(update tgUpdate) {
	var err error
	switch {
	case update.CallbackQuery != nil:
		err = b.onCallback(update.CallbackQuery)
	case update.Message != nil:
		err = b.onMessage(update.Message)
	}
	if err != nil {
		log.Printf("Telegram-бот: %v", err)
	}
}

func (b *Bot) ourChat(id int64) bool {
	configured := strings.TrimSpace(b.server.Settings.TelegramChatID)
	return configured != "" && configured == strconv.FormatInt(id, 10)
}

// allowed: the team chat or a private chat of a linked panel user.
func (b *Bot) allowed(id int64) bool { return b.ourChat(id) || b.server.isLinkedChat(id) }

// actorName records a linked person under the panel name, anyone else by Telegram username.
func (b *Bot) actorName(u tgUser) string {
	if name, ok := b.server.panelNameForTelegram(u.ID); ok {
		return name
	}
	if u.Username != "" {
		return "tg:@" + u.Username
	}
	return "tg:" + u.FirstName
}

func (b *Bot) reply(chatID int64, text string) error {
	return b.call("sendMessage", map[string]any{"chat_id": chatID, "text": text}, nil)
}

const botHelp = `Invoice Keeper напоминает о регулярных платежах за 3 дня до срока.

/todo — что оплатить в ближайшие 7 дней и что просрочено
/overdue — только просроченные
/chatid — ID этого чата для настройки
Под напоминанием есть кнопка «✅ Оплачено».`

func (b *Bot) onMessage(m *tgMessage) error {
	fields := strings.Fields(m.Text)
	if len(fields) == 0 || !strings.HasPrefix(fields[0], "/") {
		return nil
	}
	command, _, _ := strings.Cut(strings.ToLower(fields[0]), "@")
	switch command {
	case "/chatid":
		log.Printf("Telegram-бот: /chatid из чата %d (%s %q)", m.Chat.ID, m.Chat.Type, m.Chat.Title)
		note := ""
		if !b.ourChat(m.Chat.ID) {
			note = "\nУкажите его в TELEGRAM_CHAT_ID на сервере, чтобы напоминания приходили сюда."
		}
		return b.reply(m.Chat.ID, fmt.Sprintf("ID этого чата: %d%s", m.Chat.ID, note))
	case "/start", "/help":
		if command == "/start" && len(fields) > 1 && m.Chat.Type == "private" && m.From != nil {
			name, err := b.server.linkTelegram(fields[1], *m.From, m.Chat.ID)
			var apiErr *apiError
			if errors.As(err, &apiErr) {
				return b.reply(m.Chat.ID, apiErr.Detail.(string))
			}
			if err != nil {
				return err
			}
			return b.reply(m.Chat.ID, "Готово: Telegram привязан к учётной записи "+name+" в Invoice Keeper.\n"+
				"Сюда будут приходить напоминания по вашим платежам с кнопкой «✅ Оплачено».\n\n"+botHelp)
		}
		return b.reply(m.Chat.ID, botHelp)
	case "/todo", "/overdue":
		if !b.allowed(m.Chat.ID) {
			return b.reply(m.Chat.ID, "Этот чат не подключён к Invoice Keeper.")
		}
		text, err := b.todo(command == "/overdue")
		if err != nil {
			return err
		}
		return b.reply(m.Chat.ID, text)
	}
	return nil
}

// todo lists unpaid periods of active payments: overdue ones and, unless onlyOverdue, the next 7 days.
func (b *Bot) todo(onlyOverdue bool) (string, error) {
	today := b.server.Today()
	until := today.AddDate(0, 0, 7)
	items, err := b.server.loadOccurrences(b.server.DB, occurrenceFilter{to: &until, includeArchived: false})
	if err != nil {
		return "", err
	}
	var overdue, soon []Occurrence
	for _, o := range items {
		switch {
		case o.Status == "overdue":
			overdue = append(overdue, o)
		case o.Status == "unpaid" && !onlyOverdue:
			soon = append(soon, o)
		}
	}
	if len(overdue) == 0 && len(soon) == 0 {
		if onlyOverdue {
			return "Просроченных платежей нет ✅", nil
		}
		return "В ближайшие 7 дней платить нечего, просрочек нет ✅", nil
	}
	var text strings.Builder
	totals := map[string]int64{}
	section := func(title string, list []Occurrence, describe func(Occurrence) string) {
		if len(list) == 0 {
			return
		}
		text.WriteString(title + "\n")
		for _, o := range list {
			fmt.Fprintf(&text, "• %s — %s %s, %s\n", o.Title, o.Amount, o.Currency, describe(o))
			totals[o.Currency] += o.amountCents
		}
		text.WriteString("\n")
	}
	section("🔴 Просрочено", overdue, func(o Occurrence) string {
		return fmt.Sprintf("срок %s, %d дн. назад", shortDate(o.DueDate), o.DaysOverdue)
	})
	section("🟡 В ближайшие 7 дней", soon, func(o Occurrence) string {
		due, _ := parseDate(o.DueDate)
		days := int(due.Sub(today).Hours() / 24)
		when := map[int]string{0: "сегодня", 1: "завтра"}[days]
		if when == "" {
			when = fmt.Sprintf("через %d дн.", days)
		}
		return fmt.Sprintf("срок %s, %s", shortDate(o.DueDate), when)
	})
	text.WriteString("Итого:")
	for _, c := range currencies {
		if totals[c] > 0 {
			fmt.Fprintf(&text, " %s %s ·", money(totals[c]), c)
		}
	}
	return strings.TrimSuffix(text.String(), " ·"), nil
}

func shortDate(iso string) string {
	if d, err := parseDate(iso); err == nil {
		return d.Format("02.01")
	}
	return iso
}

// onCallback handles «✅ Оплачено»: marks the period paid today and updates the message.
func (b *Bot) onCallback(c *tgCallback) error {
	answer := func(text string) error {
		return b.call("answerCallbackQuery", map[string]any{"callback_query_id": c.ID, "text": text}, nil)
	}
	if c.Message == nil || !b.allowed(c.Message.Chat.ID) {
		return answer("Нет доступа")
	}
	raw, ok := strings.CutPrefix(c.Data, "paid:")
	id, err := strconv.ParseInt(raw, 10, 64)
	if !ok || err != nil {
		return answer("Неизвестная кнопка")
	}
	actor := b.actorName(c.From)
	today := formatDate(b.server.Today())
	already := false
	err = b.server.DB.Write(func(tx *sql.Tx) error {
		current, err := b.server.findOccurrence(tx, id)
		if err != nil {
			return err
		}
		if current.PaidAt != nil {
			already = true
			return nil
		}
		if _, err := tx.Exec("UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=?", today, actor, timestamp(), id); err != nil {
			return err
		}
		return audit(tx, actor, "occurrence.paid", id)
	})
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.Status == 404 {
		return answer("Платёж не найден")
	}
	if err != nil {
		return err
	}
	if already {
		return answer("Уже отмечено ранее")
	}
	b.server.Worker.Kick()
	if err := answer("Отмечено: оплачено"); err != nil {
		return err
	}
	// Without reply_markup the button disappears, so nobody presses it twice.
	return b.call("editMessageText", map[string]any{
		"chat_id": c.Message.Chat.ID, "message_id": c.Message.MessageID,
		"text": c.Message.Text + fmt.Sprintf("\n\n✅ Оплачено — %s, %s", strings.TrimPrefix(actor, "tg:"), shortDate(today)),
	}, nil)
}
