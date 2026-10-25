package bot

// Telegram bot: long polling (no public HTTPS needed) for the «Оплачено» button and the commands
// /todo, /overdue, /help, /chatid. Only the configured chat (TELEGRAM_CHAT_ID) may read data or
// mark payments; /chatid and /help answer anywhere so the chat can be connected without getUpdates.

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

type Message struct {
	MessageID int64 `json:"message_id"`
	Chat      struct {
		ID    int64  `json:"id"`
		Type  string `json:"type"`
		Title string `json:"title"`
	} `json:"chat"`
	From *User  `json:"from"`
	Text string `json:"text"`
}

type Callback struct {
	ID      string   `json:"id"`
	From    User     `json:"from"`
	Message *Message `json:"message"`
	Data    string   `json:"data"`
}

type Update struct {
	UpdateID      int64     `json:"update_id"`
	Message       *Message  `json:"message"`
	CallbackQuery *Callback `json:"callback_query"`
}

// Telegram is the Telegram bot.
type Telegram struct {
	settings *config.Settings
	db       *store.DB
	backend  Backend
	baseURL  string
	client   *http.Client
	reports  reportImages
}

// NewTelegram makes the bot; baseURL replaces api.telegram.org in tests.
func NewTelegram(settings *config.Settings, db *store.DB, backend Backend, baseURL string) *Telegram {
	if baseURL == "" {
		baseURL = "https://api.telegram.org"
	}
	return &Telegram{settings: settings, db: db, backend: backend, baseURL: baseURL, client: &http.Client{Timeout: 70 * time.Second}}
}

// call invokes a Bot API method. Errors never contain the token: the request URL is not reported.
func (b *Telegram) call(method string, payload any, result any) error {
	return b.callContext(context.Background(), method, payload, result)
}

func (b *Telegram) callContext(ctx context.Context, method string, payload any, result any) error {
	body, _ := json.Marshal(payload)
	request, err := http.NewRequestWithContext(ctx, "POST", b.baseURL+"/bot"+b.settings.TelegramBotToken+"/"+method, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram %s: неверный запрос", method)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := b.client.Do(request)
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

// Run polls Telegram until ctx is cancelled. Cancelling aborts the long poll at once; updates
// already received are handled to the end, so no answer is lost and the offset is saved.
func (b *Telegram) Run(ctx context.Context) {
	if b.settings.TelegramBotToken == "" {
		return
	}
	var me User
	if err := b.call("getMe", map[string]any{}, &me); err != nil {
		log.Printf("Telegram-бот: %v", err)
	} else {
		b.backend.SetBotUsername(me.Username)
	}
	// The command menu next to the input field in Telegram.
	if err := b.call("setMyCommands", map[string]any{"commands": []map[string]string{
		{"command": "menu", "description": "Платежи и действия — главное меню"},
		{"command": "todo", "description": "Что оплатить в ближайшие 7 дней"},
		{"command": "overdue", "description": "Просроченные платежи"},
		{"command": "report", "description": "Графический отчёт за месяц: RUB, USD, EUR"},
		{"command": "chatid", "description": "ID этого чата"},
		{"command": "help", "description": "Справка"},
	}}, nil); err != nil {
		log.Printf("Telegram-бот: %v", err)
	}
	for ctx.Err() == nil {
		if err := b.pollOnce(ctx, 50); err != nil && ctx.Err() == nil {
			log.Printf("Telegram-бот: %v", err)
			select {
			case <-ctx.Done():
			case <-time.After(5 * time.Second):
			}
		}
	}
}

// PollOnce fetches one batch and remembers the offset, so a restart does not replay handled updates.
func (b *Telegram) PollOnce(timeout int) error { return b.pollOnce(context.Background(), timeout) }

func (b *Telegram) pollOnce(ctx context.Context, timeout int) error {
	var offset int64
	var stored string
	if err := b.db.QueryRow("SELECT value FROM app_state WHERE key='telegram_offset'").Scan(&stored); err == nil {
		offset, _ = strconv.ParseInt(stored, 10, 64)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var updates []Update
	err := b.callContext(ctx, "getUpdates", map[string]any{"offset": offset, "timeout": timeout, "allowed_updates": []string{"message", "callback_query"}}, &updates)
	if err != nil {
		return err
	}
	for _, update := range updates {
		b.Handle(update)
		offset = update.UpdateID + 1
	}
	if len(updates) == 0 {
		return nil
	}
	_, err = b.db.Exec("INSERT INTO app_state(key,value) VALUES('telegram_offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", itoa(offset))
	return err
}

func (b *Telegram) Handle(update Update) {
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

func (b *Telegram) ourChat(id int64) bool {
	configured := strings.TrimSpace(b.settings.TelegramChatID)
	return configured != "" && configured == strconv.FormatInt(id, 10)
}

// allowed: the team chat or a private chat of a linked panel user.
func (b *Telegram) allowed(id int64) bool { return b.ourChat(id) || b.backend.IsLinkedChat(id) }

// actorName records a linked person under the panel name, anyone else by Telegram username.
func (b *Telegram) actorName(u User) string {
	if name, ok := b.backend.PanelName(u.ID); ok {
		return name
	}
	if u.Username != "" {
		return "tg:@" + u.Username
	}
	return "tg:" + u.FirstName
}

func (b *Telegram) reply(chatID int64, text string) error {
	if !b.allowed(chatID) {
		return b.call("sendMessage", map[string]any{"chat_id": chatID, "text": text}, nil)
	}
	return b.call("sendMessage", map[string]any{"chat_id": chatID, "text": text, "reply_markup": map[string]any{"inline_keyboard": b.navigation()}}, nil)
}

const botHelp = `AezaKeeper · платежи команды
Напомню за 3 дня до срока и помогу отметить оплату.

/menu — главное меню с кнопками

/todo — что оплатить в ближайшие 7 дней и что просрочено
/overdue — только просроченные
/report — графический отчёт за месяц
/chatid — ID этого чата для настройки
Под напоминанием есть кнопка «✅ Оплачено».`

func (b *Telegram) onMessage(m *Message) error {
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
			name, err := b.backend.LinkTelegram(fields[1], *m.From, m.Chat.ID)
			var userErr *UserError
			if errors.As(err, &userErr) {
				return b.reply(m.Chat.ID, userErr.Message)
			}
			if err != nil {
				return err
			}
			return b.reply(m.Chat.ID, "Готово: Telegram привязан к учётной записи "+name+" в Invoice Keeper.\n"+
				"Теперь кнопка «✅ Оплачено» работает для вас и в общем чате. Сюда будут приходить личные напоминания.\n\n"+botHelp)
		}
		if command == "/start" && m.Chat.Type == "private" && m.From != nil {
			if name, linked := b.backend.PanelName(m.From.ID); linked {
				return b.reply(m.Chat.ID, "Telegram уже привязан к учётной записи "+name+". Кнопкой «✅ Оплачено» можно пользоваться и в группе.\n\n"+botHelp)
			}
			payload := map[string]any{
				"chat_id": m.Chat.ID,
				"text": "Telegram ещё не привязан к аккаунту Invoice Keeper. Обычный /start только запускает бота.\n\n" +
					"Откройте сайт → «Аккаунт» → «Привязать Telegram» → «Открыть Telegram и привязать». Затем нажмите «Start / Запустить» и дождитесь ответа «Готово: Telegram привязан…».\n\n" +
					"После этого вы сможете отмечать оплаты в группе и в личном чате.",
			}
			if b.settings.PublicBaseURL != "" {
				payload["reply_markup"] = map[string]any{"inline_keyboard": [][]map[string]string{{{
					"text": "Открыть аккаунт на сайте", "url": b.settings.PublicBaseURL + "/account#telegram",
				}}}}
			}
			return b.call("sendMessage", payload, nil)
		}
		return b.reply(m.Chat.ID, botHelp)
	case "/menu", "/todo", "/overdue", "/report":
		if !b.allowed(m.Chat.ID) {
			return b.reply(m.Chat.ID, "Этот чат не подключён к Invoice Keeper.")
		}
		if command == "/menu" {
			return b.menu(m.Chat.ID, 0)
		}
		if command == "/report" {
			return b.reportCommand(m, fields)
		}
		return b.payments(m.Chat.ID, 0, command == "/overdue", 0)
	}
	return nil
}

// onCallback handles «✅ Оплачено»: marks the period paid today and updates the message.
func (b *Telegram) onCallback(c *Callback) error {
	answer := func(text string) error {
		return b.call("answerCallbackQuery", map[string]any{"callback_query_id": c.ID, "text": text}, nil)
	}
	if c.Message == nil || !b.allowed(c.Message.Chat.ID) {
		return answer("Нет доступа")
	}
	if strings.HasPrefix(c.Data, "report:") {
		return b.reportCallback(c)
	}
	if strings.HasPrefix(c.Data, "nav:") {
		if err := answer(""); err != nil {
			return err
		}
		return b.navigate(c)
	}
	raw, ok := strings.CutPrefix(c.Data, "paid:")
	id, err := strconv.ParseInt(raw, 10, 64)
	if !ok || err != nil || id <= 0 {
		return answer("Неизвестная кнопка")
	}
	// A team chat may include guests; only people who linked Telegram to a panel account mark payments.
	if b.settings.PaidLinkedOnly {
		if _, linked := b.backend.PanelName(c.From.ID); !linked {
			return b.call("answerCallbackQuery", map[string]any{
				"callback_query_id": c.ID,
				"text":              "Telegram ещё не привязан. На сайте: Аккаунт → Привязать Telegram → Открыть Telegram и привязать. Нажмите Start по этой ссылке. Обычного /start недостаточно.",
				"show_alert":        true,
			}, nil)
		}
	}
	actor := b.actorName(c.From)
	today := schedule.FormatDate(b.backend.Today())
	already, err := b.backend.MarkPaid(id, actor)
	if errors.Is(err, ErrNotFound) {
		return answer("Платёж не найден")
	}
	if err != nil {
		return err
	}
	if already {
		return answer("Уже отмечено ранее")
	}
	ackErr := answer("Отмечено: оплачено")
	// Replace the payment action with safe navigation. Payment is already committed even if Telegram fails.
	editErr := b.call("editMessageText", map[string]any{
		"chat_id": c.Message.Chat.ID, "message_id": c.Message.MessageID,
		"text":         c.Message.Text + fmt.Sprintf("\n\n✅ Оплачено — %s, %s", strings.TrimPrefix(actor, "tg:"), schedule.ShortDate(today)),
		"reply_markup": map[string]any{"inline_keyboard": b.navigation()},
	}, nil)
	return errors.Join(ackErr, editErr)
}
