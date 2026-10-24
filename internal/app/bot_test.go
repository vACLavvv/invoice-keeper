package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeTelegram records Bot API calls and serves queued updates to getUpdates.
type fakeTelegram struct {
	mu      sync.Mutex
	calls   []fakeCall
	updates []tgUpdate
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
			pending := []tgUpdate{}
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

func botFor(e *harness) (*Bot, *fakeTelegram) {
	e.settings.TelegramBotToken = "test-token"
	e.settings.TelegramChatID = "-100123"
	tg := newFakeTelegram(e.t)
	return NewBot(e.server, tg.server.URL), tg
}

func message(chat int64, text string) tgUpdate {
	m := &tgMessage{Text: text}
	m.Chat.ID = chat
	return tgUpdate{Message: m}
}

func pressPaid(chat int64, occurrenceID string) tgUpdate {
	m := &tgMessage{MessageID: 77, Text: "🔔 Пора запланировать оплату"}
	m.Chat.ID = chat
	return tgUpdate{CallbackQuery: &tgCallback{ID: "cb1", From: tgUser{Username: "alex"}, Message: m, Data: "paid:" + occurrenceID}}
}

func TestPaidButtonMarksPeriodAndEditsMessage(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	bot, tg := botFor(e)

	bot.handle(pressPaid(ourChat, id(item)))
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

	bot.handle(pressPaid(ourChat, id(item)))
	expect(t, "second press", tg.sent("answerCallbackQuery")[1]["text"], any("Уже отмечено ранее"))
	bot.handle(pressPaid(ourChat, "99999"))
	expect(t, "unknown period", tg.sent("answerCallbackQuery")[2]["text"], any("Платёж не найден"))
}

func TestForeignChatCannotUseTheBot(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(nil)
	item := c.get("/api/v1/payment-occurrences").list(t)[0]
	bot, tg := botFor(e)

	bot.handle(pressPaid(555, id(item)))
	expect(t, "denied", tg.sent("answerCallbackQuery")[0]["text"], any("Нет доступа"))
	expect(t, "still unpaid", c.get("/api/v1/payment-occurrences/" + id(item)).object(t)["paid_at"], nil)
	bot.handle(message(555, "/todo"))
	expect(t, "no data for strangers", tg.sent("sendMessage")[0]["text"], any("Этот чат не подключён к Invoice Keeper."))
	bot.handle(message(555, "/chatid@all_invoice_keeper_bot"))
	if !strings.Contains(tg.sent("sendMessage")[1]["text"].(string), "ID этого чата: 555") {
		t.Fatal("/chatid must answer anywhere")
	}
}

func TestTodoAndOverdueCommands(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "Аренда", "amount": "100.10", "first_due_date": "2026-01-20"})
	c.createPayment(map[string]any{"title": "Сервер", "amount": "24", "currency": "USD", "first_due_date": "2026-01-30"})
	c.createPayment(map[string]any{"title": "Далёкий", "amount": "5", "currency": "EUR", "first_due_date": "2026-03-15"})
	bot, tg := botFor(e)

	bot.handle(message(ourChat, "/todo"))
	todo := tg.sent("sendMessage")[0]["text"].(string)
	for _, want := range []string{"🔴 Просрочено", "Аренда — 100.10 RUB, срок 20.01, 8 дн. назад", "🟡 В ближайшие 7 дней", "Сервер — 24.00 USD, срок 30.01, через 2 дн.", "Итого: 100.10 RUB · 24.00 USD"} {
		if !strings.Contains(todo, want) {
			t.Fatalf("/todo lacks %q:\n%s", want, todo)
		}
	}
	if strings.Contains(todo, "Далёкий") {
		t.Fatal("/todo must cover only 7 days")
	}
	bot.handle(message(ourChat, "/overdue"))
	overdue := tg.sent("sendMessage")[1]["text"].(string)
	if !strings.Contains(overdue, "Аренда") || strings.Contains(overdue, "Сервер") {
		t.Fatalf("/overdue:\n%s", overdue)
	}
}

func TestPollingRemembersOffset(t *testing.T) {
	e := setup(t)
	bot, tg := botFor(e)
	tg.updates = []tgUpdate{message(ourChat, "/help"), message(ourChat, "просто текст")}
	tg.updates[0].UpdateID, tg.updates[1].UpdateID = 41, 42
	if err := bot.pollOnce(0); err != nil {
		t.Fatal(err)
	}
	expect(t, "help answered once", len(tg.sent("sendMessage")), 1)
	// A restarted bot continues after the last handled update instead of replaying it.
	if err := NewBot(e.server, tg.server.URL).pollOnce(0); err != nil {
		t.Fatal(err)
	}
	expect(t, "no replay", len(tg.sent("sendMessage")), 1)
	polls := tg.sent("getUpdates")
	expect(t, "offset", polls[len(polls)-1]["offset"], any(43.0))
}

func TestReminderCarriesPaidButton(t *testing.T) {
	var body map[string]any
	telegram := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		w.Write([]byte(`{"ok":true,"result":{"message_id":5}}`))
	}))
	defer telegram.Close()
	sender := TelegramSender(&Settings{TelegramBotToken: "t", TelegramChatID: "1"}, telegram.URL)
	sender(ReminderRow{OccurrenceID: 12, Title: "Аренда", AmountCents: 100, Currency: "RUB", DueDate: "2026-01-31"})
	raw, _ := json.Marshal(body["reply_markup"])
	if !strings.Contains(string(raw), `"callback_data":"paid:12"`) || !strings.Contains(string(raw), "Оплачено") {
		t.Fatalf("keyboard: %s", raw)
	}
}
