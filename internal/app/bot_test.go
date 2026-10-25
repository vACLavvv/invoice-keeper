package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"invoice-keeper/internal/app/bot"
)

// fakeTelegram records Bot API calls and serves queued updates to getUpdates.
type fakeTelegram struct {
	mu      sync.Mutex
	calls   []fakeCall
	updates []bot.Update
	server  *httptest.Server
}

type fakeCall struct {
	Method string
	Body   map[string]any
}

func newFakeTelegram(t *testing.T) *fakeTelegram {
	f := &fakeTelegram{}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		if !strings.HasPrefix(r.URL.Path, "/bottest-token/") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		f.mu.Lock()
		f.calls = append(f.calls, fakeCall{method, body})
		var result any = true
		if method == "getUpdates" {
			offset := int64(body["offset"].(float64))
			pending := []bot.Update{}
			for _, u := range f.updates {
				if u.UpdateID >= offset {
					pending = append(pending, u)
				}
			}
			result = pending
		}
		f.mu.Unlock()
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": result})
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeTelegram) sent(method string) []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []map[string]any
	for _, c := range f.calls {
		if c.Method == method {
			out = append(out, c.Body)
		}
	}
	return out
}

const ourChat = -100123

func botFor(e *harness) (*bot.Telegram, *fakeTelegram) {
	e.settings.TelegramBotToken = "test-token"
	e.settings.TelegramChatID = "-100123"
	tg := newFakeTelegram(e.t)
	return bot.NewTelegram(e.settings, e.db, e.server.BotBackend(), tg.server.URL), tg
}

func message(chat int64, text string) bot.Update {
	m := &bot.Message{Text: text}
	m.Chat.ID = chat
	return bot.Update{Message: m}
}

func pressPaid(chat int64, occurrenceID string) bot.Update {
	m := &bot.Message{MessageID: 77, Text: "🔔 Пора запланировать оплату"}
	m.Chat.ID = chat
	return bot.Update{CallbackQuery: &bot.Callback{ID: "cb1", From: bot.User{Username: "alex"}, Message: m, Data: "paid:" + occurrenceID}}
}

func TestPaidButtonMarksPeriodAndEditsMessage(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	tb, tg := botFor(e)

	tb.Handle(pressPaid(ourChat, id(item)))
	e.server.Worker.Wait()
	paid := c.get("/api/v1/payment-occurrences/" + id(item)).object(t)
	expect(t, "paid today", paid["paid_at"], any("2026-01-28"))
	expect(t, "who", paid["updated_by"], any("tg:@alex"))
	expect(t, "answered", tg.sent("answerCallbackQuery")[0]["text"], any("Отмечено: оплачено"))
	edit := tg.sent("editMessageText")[0]
	if !strings.Contains(edit["text"].(string), "✅ Оплачено — @alex, 28.01") {
		t.Fatalf("message not updated: %v", edit["text"])
	}
	if _, kept := edit["reply_markup"]; kept {
		t.Fatal("button must disappear after payment")
	}
	audit := c.get("/api/v1/audit-log").list(t)
	expect(t, "audit actor", audit[0]["actor"], any("tg:@alex"))

	tb.Handle(pressPaid(ourChat, id(item)))
	expect(t, "second press", tg.sent("answerCallbackQuery")[1]["text"], any("Уже отмечено ранее"))
	tb.Handle(pressPaid(ourChat, "99999"))
	expect(t, "unknown period", tg.sent("answerCallbackQuery")[2]["text"], any("Платёж не найден"))
}

func TestForeignChatCannotUseTheBot(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	tb, tg := botFor(e)

	tb.Handle(pressPaid(555, id(item)))
	expect(t, "denied", tg.sent("answerCallbackQuery")[0]["text"], any("Нет доступа"))
	expect(t, "still unpaid", c.get("/api/v1/payment-occurrences/" + id(item)).object(t)["paid_at"], nil)
	tb.Handle(message(555, "/todo"))
	expect(t, "no data for strangers", tg.sent("sendMessage")[0]["text"], any("Этот чат не подключён к Invoice Keeper."))
	tb.Handle(message(555, "/chatid@all_invoice_keeper_bot"))
	if !strings.Contains(tg.sent("sendMessage")[1]["text"].(string), "ID этого чата: 555") {
		t.Fatal("/chatid must answer anywhere")
	}
}

func TestPlainStartExplainsLinkingWithoutGrantingAccess(t *testing.T) {
	for _, baseURL := range []string{"", "https://keeper.example"} {
		t.Run(baseURL, func(t *testing.T) {
			e := setup(t)
			e.settings.PublicBaseURL = baseURL
			tb, tg := botFor(e)
			start := message(501, "/start")
			start.Message.Chat.Type = "private"
			start.Message.From = &bot.User{ID: 501, Username: "alex_tg"}
			tb.Handle(start)
			reply := tg.sent("sendMessage")[0]
			if !strings.Contains(reply["text"].(string), "ещё не привязан") || !strings.Contains(reply["text"].(string), "Открыть Telegram и привязать") {
				t.Fatalf("plain Start must explain the missing account link: %v", reply)
			}
			if baseURL == "" {
				if _, exists := reply["reply_markup"]; exists {
					t.Fatal("do not send an account button without a configured public URL")
				}
			} else {
				markup := reply["reply_markup"].(map[string]any)
				button := markup["inline_keyboard"].([]any)[0].([]any)[0].(map[string]any)
				expect(t, "account button", button["url"], any(baseURL+"/account#telegram"))
			}
			_, linked := e.server.panelNameForTelegram(501)
			expect(t, "plain Start cannot grant access", linked, false)
		})
	}
}

func TestGroupPaidButtonRequiresPersonalLink(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	e.settings.PaidLinkedOnly = true
	tb, tg := botFor(e)
	e.server.SetBotUsername("invoice_test_bot")
	press := pressPaid(ourChat, id(item))
	press.CallbackQuery.From = bot.User{ID: 501, Username: "alex_tg"}
	tb.Handle(press)
	reply := tg.sent("answerCallbackQuery")[0]
	expect(t, "readable explanation instead of a clipped toast", reply["show_alert"], any(true))
	if !strings.Contains(reply["text"].(string), "ещё не привязан") || len([]rune(reply["text"].(string))) > 200 {
		t.Fatalf("invalid account-link alert: %v", reply)
	}
	expect(t, "unlinked user cannot pay", c.get("/api/v1/payment-occurrences/" + id(item)).object(t)["paid_at"], nil)

	link := c.post("/api/v1/me/telegram/link", nil).object(t)["url"].(string)
	code := strings.SplitN(link, "start=", 2)[1]
	start := message(501, "/start "+code)
	start.Message.Chat.Type = "private"
	start.Message.From = &press.CallbackQuery.From
	tb.Handle(start)
	expect(t, "linked in account", c.get("/api/v1/me/telegram").object(t)["linked"], any(true))
	start.Message.Text = "/start"
	tb.Handle(start)
	if !strings.Contains(tg.sent("sendMessage")[1]["text"].(string), "уже привязан") {
		t.Fatal("plain Start must confirm an existing link")
	}
	tb.Handle(press)
	paid := c.get("/api/v1/payment-occurrences/" + id(item)).object(t)
	expect(t, "group payment succeeds after personal linking", paid["paid_at"], any("2026-01-28"))
	expect(t, "recorded under the linked account", paid["updated_by"], any(e.settings.AdminUsername))
}

func TestTodoAndOverdueCommands(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "Аренда", "amount": "100.10", "first_due_date": "2026-01-20"})
	c.createPayment(map[string]any{"title": "Сервер", "amount": "24", "currency": "USD", "first_due_date": "2026-01-30"})
	c.createPayment(map[string]any{"title": "Далёкий", "amount": "5", "currency": "EUR", "first_due_date": "2026-03-15"})
	tb, tg := botFor(e)

	tb.Handle(message(ourChat, "/todo"))
	todo := tg.sent("sendMessage")[0]["text"].(string)
	for _, want := range []string{"🔴 Просрочено", "Аренда — 100.10 RUB, срок 20.01, 8 дн. назад", "🟡 В ближайшие 7 дней", "Сервер — 24.00 USD, срок 30.01, через 2 дн.", "Итого: 100.10 RUB · 24.00 USD"} {
		if !strings.Contains(todo, want) {
			t.Fatalf("/todo lacks %q:\n%s", want, todo)
		}
	}
	if strings.Contains(todo, "Далёкий") {
		t.Fatal("/todo must cover only 7 days")
	}
	tb.Handle(message(ourChat, "/overdue"))
	overdue := tg.sent("sendMessage")[1]["text"].(string)
	if !strings.Contains(overdue, "Аренда") || strings.Contains(overdue, "Сервер") {
		t.Fatalf("/overdue:\n%s", overdue)
	}
}

func TestPollingRemembersOffset(t *testing.T) {
	e := setup(t)
	tb, tg := botFor(e)
	tg.updates = []bot.Update{message(ourChat, "/help"), message(ourChat, "просто текст")}
	tg.updates[0].UpdateID, tg.updates[1].UpdateID = 41, 42
	if err := tb.PollOnce(0); err != nil {
		t.Fatal(err)
	}
	expect(t, "help answered once", len(tg.sent("sendMessage")), 1)
	// A restarted tb continues after the last handled update instead of replaying it.
	if err := bot.NewTelegram(e.settings, e.db, e.server.BotBackend(), tg.server.URL).PollOnce(0); err != nil {
		t.Fatal(err)
	}
	expect(t, "no replay", len(tg.sent("sendMessage")), 1)
	polls := tg.sent("getUpdates")
	expect(t, "offset", polls[len(polls)-1]["offset"], any(43.0))
}
