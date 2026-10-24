package app

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
	"time"

	"golang.org/x/text/encoding/charmap"
)

func dates(items []map[string]any, payment any) string {
	var out []string
	for _, o := range items {
		if payment == nil || o["recurring_payment_id"] == payment {
			out = append(out, o["due_date"].(string))
		}
	}
	return strings.Join(out, ",")
}

func TestQuarterlyAndYearlyPeriods(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	quarterly := c.createPayment(map[string]any{"title": "Квартал", "frequency": "quarterly", "first_due_date": "2026-01-31"})
	yearly := c.createPayment(map[string]any{"title": "Домен", "frequency": "yearly", "first_due_date": "2026-01-31"})
	leap := c.createPayment(map[string]any{"title": "Високосный", "frequency": "yearly", "first_due_date": "2028-02-29"})
	expect(t, "frequency stored", yearly["frequency"], any("yearly"))
	e.clock.Set(civil(2026, 5, 2))
	items := c.get("/api/v1/payment-occurrences").list(t)
	expect(t, "quarterly keeps the 31st", dates(items, quarterly["id"]), "2026-01-31,2026-04-30,2026-07-31")
	expect(t, "next yearly date is visible", dates(items, yearly["id"]), "2026-01-31,2027-01-31")
	e.clock.Set(civil(2028, 3, 1))
	items = c.get("/api/v1/payment-occurrences").list(t)
	expect(t, "29 Feb → 28 Feb", dates(items, leap["id"]), "2028-02-29,2029-02-28")
	expect(t, "bad frequency", c.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31", "frequency": "weekly"}).status, 422)
}

func TestPauseSkipsPeriodsAndResumeRestarts(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	payment := admin.createPayment(nil) // 31 Jan, today 28 Jan
	path := "/api/v1/recurring-payments/" + id(payment)

	paused := admin.post(path+"/pause", map[string]any{"until": "2026-03-15"})
	expect(t, "pause", paused.status, 200)
	info := paused.object(t)["paused"].(map[string]any)
	expect(t, "pause window", info["from"].(string)+"…"+info["until"].(string), "2026-01-28…2026-03-15")
	expect(t, "double pause", admin.post(path+"/pause", nil).status, 409)
	expect(t, "periods inside the pause removed", len(admin.get("/api/v1/payment-occurrences").list(t)), 0)

	e.clock.Set(civil(2026, 4, 1))
	items := admin.get("/api/v1/payment-occurrences").list(t)
	expect(t, "after the pause", dates(items, nil), "2026-03-31,2026-04-30,2026-05-31")
	expect(t, "nothing overdue for skipped months", items[0]["status"], any("overdue"))

	// An open pause until resumed: the skipped month never becomes a debt.
	open := admin.createPayment(map[string]any{"title": "Сервер", "first_due_date": "2026-04-10"})
	openPath := "/api/v1/recurring-payments/" + id(open)
	admin.post(openPath+"/pause", nil)
	e.clock.Set(civil(2026, 5, 20))
	expect(t, "still paused", dates(admin.get("/api/v1/payment-occurrences").list(t), open["id"]), "")
	resumed := admin.post(openPath+"/resume", nil)
	expect(t, "resume", resumed.status, 200)
	expect(t, "not paused", resumed.object(t)["paused"], nil)
	expect(t, "periods from today on", dates(admin.get("/api/v1/payment-occurrences").list(t), open["id"]), "2026-06-10")
	expect(t, "resume twice", admin.post(openPath+"/resume", nil).status, 409)

	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	expect(t, "user cannot pause", user.post(openPath+"/pause", nil).status, 403)
}

func TestCategoryAssigneeAndEditing(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	alex := admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"}).object(t)
	rent := admin.createPayment(map[string]any{"title": "Аренда", "category": "Офис", "assignee_id": alex["id"]})
	admin.createPayment(map[string]any{"title": "Сервер", "category": "IT", "currency": "USD"})
	admin.createPayment(map[string]any{"title": "Прочее"})
	expect(t, "assignee shown", rent["assignee"].(map[string]any)["display_name"], any("Алексей"))
	expect(t, "unknown assignee", admin.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31", "assignee_id": 999}).status, 422)

	january := "/api/v1/payment-occurrences?to_date=2026-01-31&"
	expect(t, "by category, case-insensitive", len(admin.get(january+"category=it").list(t)), 1)
	expect(t, "Cyrillic category", len(admin.get(january+"category=%D0%BE%D1%84%D0%B8%D1%81").list(t)), 1)
	expect(t, "without category", admin.get(january + "category=-").list(t)[0]["title"], any("Прочее"))
	user := e.client()
	user.signIn("alex", "User-password123!")
	mine := user.get(january + "assignee=me").list(t)
	expect(t, "only mine", len(mine), 1)
	expect(t, "mine is rent", mine[0]["title"], any("Аренда"))
	expect(t, "unassigned", len(admin.get(january+"assignee=-").list(t)), 2)
	expect(t, "user cannot edit", user.patch("/api/v1/recurring-payments/"+id(rent), map[string]any{"title": "x"}).status, 403)

	edited := admin.patch("/api/v1/recurring-payments/"+id(rent), map[string]any{"title": "Аренда офиса", "amount": "200", "category": nil, "assignee_id": nil}).object(t)
	expect(t, "title", edited["title"], any("Аренда офиса"))
	expect(t, "category cleared", edited["category"], nil)
	expect(t, "assignee cleared", edited["assignee"], nil)
	period := admin.get("/api/v1/payment-occurrences?search=офиса").list(t)[0]
	expect(t, "unpaid upcoming period gets the new amount", period["amount"], any("200.00"))
	expect(t, "empty edit", admin.patch("/api/v1/recurring-payments/"+id(rent), map[string]any{}).status, 422)
}

func TestPasswordChange(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	expect(t, "admin uses .env", admin.post("/api/v1/auth/password", map[string]any{"current_password": testPassword, "new_password": "Another-password1!"}).status, 403)
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	laptop, phone := e.client(), e.client()
	laptop.signIn("alex", "User-password123!")
	phone.signIn("alex", "User-password123!")
	expect(t, "wrong current", laptop.post("/api/v1/auth/password", map[string]any{"current_password": "nope", "new_password": "Brand-new-pass1!"}).status, 422)
	expect(t, "same as current", laptop.post("/api/v1/auth/password", map[string]any{"current_password": "User-password123!", "new_password": "User-password123!"}).status, 422)
	expect(t, "change", laptop.post("/api/v1/auth/password", map[string]any{"current_password": "User-password123!", "new_password": "Brand-new-pass1!"}).status, 204)
	expect(t, "this session stays", laptop.get("/api/v1/auth/me").status, 200)
	expect(t, "other sessions end", phone.get("/api/v1/auth/me").status, 401)
	e.client().signIn("alex", "Brand-new-pass1!")
}

func TestAdminTwoFactor(t *testing.T) {
	e := setup(t)
	now := time.Date(2026, 1, 28, 12, 0, 0, 0, time.UTC)
	e.server.Now = func() time.Time { return now }
	code := func(offset time.Duration, secret string) string {
		raw, _ := totpEncoding.DecodeString(secret)
		return totpCode(raw, now.Add(offset).Unix()/30)
	}
	admin := e.client()
	admin.signIn()
	expect(t, "off by default", admin.get("/api/v1/auth/2fa").object(t)["enabled"], any(false))
	setup := admin.post("/api/v1/auth/2fa/setup", nil).object(t)
	secret := setup["secret"].(string)
	if !strings.HasPrefix(setup["otpauth_url"].(string), "otpauth://totp/") {
		t.Fatalf("otpauth: %v", setup["otpauth_url"])
	}
	expect(t, "wrong code", admin.post("/api/v1/auth/2fa/enable", map[string]any{"code": "000000"}).status, 422)
	other := e.client()
	other.signIn()
	expect(t, "enable", admin.post("/api/v1/auth/2fa/enable", map[string]any{"code": code(0, secret)}).status, 200)
	expect(t, "sessions without 2FA end", other.get("/api/v1/auth/me").status, 401)
	expect(t, "this session stays", admin.get("/api/v1/auth/me").status, 200)

	login := func(otp string) response {
		body := map[string]any{"username": "admin", "password": testPassword}
		if otp != "" {
			body["code"] = otp
		}
		return e.client().post("/api/v1/auth/login", body)
	}
	missing := login("")
	expect(t, "code required", missing.status, 401)
	expect(t, "machine-readable", missing.object(t)["code"], any("two_factor_required"))
	expect(t, "replayed enable code", login(code(0, secret)).status, 401)
	now = now.Add(30 * time.Second)
	expect(t, "fresh code", login(code(0, secret)).status, 200)
	expect(t, "same code twice", login(code(0, secret)).status, 401)
	expect(t, "user password is not enough to disable", admin.post("/api/v1/auth/2fa/disable", map[string]any{"password": "wrong", "code": code(30*time.Second, secret)}).status, 422)
	expect(t, "disable", admin.post("/api/v1/auth/2fa/disable", map[string]any{"password": testPassword, "code": code(30*time.Second, secret)}).status, 200)
	expect(t, "plain login again", login("").status, 200)
	if err := DisableTwoFactor(e.db); err != nil {
		t.Fatal(err)
	}
}

func TestTelegramLinkAndPersonalReminders(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	expect(t, "bot not configured", admin.post("/api/v1/me/telegram/link", nil).status, 409)
	bot, tg := botFor(e)
	e.settings.TelegramChatID = "" // personal reminders only
	e.server.SetBotUsername("invoice_test_bot")
	alex := admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"}).object(t)
	user := e.client()
	user.signIn("alex", "User-password123!")

	link := user.post("/api/v1/me/telegram/link", nil)
	expect(t, "link", link.status, 201)
	url := link.object(t)["url"].(string)
	code := url[strings.Index(url, "start=")+6:]
	if !strings.HasPrefix(url, "https://t.me/invoice_test_bot?start=") {
		t.Fatalf("url: %s", url)
	}
	start := message(9001, "/start "+code)
	start.Message.Chat.Type = "private"
	start.Message.From = &tgUser{ID: 501, Username: "alex_tg"}
	bot.handle(start)
	if !strings.Contains(tg.sent("sendMessage")[0]["text"].(string), "привязан к учётной записи alex") {
		t.Fatalf("link reply: %v", tg.sent("sendMessage")[0]["text"])
	}
	me := user.get("/api/v1/me/telegram").object(t)
	expect(t, "linked", me["linked"], any(true))
	expect(t, "username", me["username"], any("alex_tg"))
	bot.handle(start)
	if !strings.Contains(tg.sent("sendMessage")[1]["text"].(string), "устарела") {
		t.Fatal("a code works once")
	}

	admin.createPayment(map[string]any{"title": "Аренда", "assignee_id": alex["id"]})
	admin.createPayment(map[string]any{"title": "Чужой платёж"})
	sent := &recorder{}
	worker := makeWorker(e, sent.sender(SendResult{State: "sent", MessageID: "1"}))
	worker.Settings.TelegramChatID = ""
	worker.Tick()
	worker.Tick()
	expect(t, "one personal reminder", sent.count(), 1)
	expect(t, "to alex", sent.rows[0].ChatID, "9001")
	expect(t, "for the assigned payment", sent.rows[0].Title, "Аренда")

	period := user.get("/api/v1/payment-occurrences?assignee=me").list(t)[0]
	press := pressPaid(9001, id(period))
	press.CallbackQuery.From = tgUser{ID: 501, Username: "alex_tg"}
	bot.handle(press)
	expect(t, "paid under the panel name", user.get("/api/v1/payment-occurrences/" + id(period)).object(t)["updated_by"], any("alex"))
	expect(t, "unlink", user.delete("/api/v1/me/telegram").status, 204)
	expect(t, "private chat no longer allowed", bot.allowed(9001), false)
}

func multipartFile(t *testing.T, name string, content []byte) (*bytes.Buffer, string) {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, _ := w.CreateFormFile("file", name)
	part.Write(content)
	w.Close()
	return &body, w.FormDataContentType()
}

func (c *client) upload(path, name string, content []byte) response {
	c.e.t.Helper()
	body, contentType := multipartFile(c.e.t, name, content)
	request, _ := http.NewRequest("POST", c.e.http.URL+path, body)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("Origin", c.e.http.URL)
	request.Header.Set("X-CSRF-Token", c.csrf)
	result, err := c.http.Do(request)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer result.Body.Close()
	data, _ := io.ReadAll(result.Body)
	return response{result.StatusCode, result.Header, data}
}

var pngBytes = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")

func TestReceipts(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	admin.createPayment(nil)
	period := admin.get("/api/v1/payment-occurrences").list(t)[0]
	path := "/api/v1/payment-occurrences/" + id(period) + "/receipts"

	expect(t, "link", admin.post(path, map[string]any{"url": "https://bank.example/receipt/1"}).status, 201)
	expect(t, "bad link", admin.post(path, map[string]any{"url": "javascript:alert(1)"}).status, 422)
	expect(t, "file", user.upload(path, "чек.png", pngBytes).status, 201)
	expect(t, "disguised file", user.upload(path, "evil.png", []byte("<script>alert(1)</script>")).status, 422)
	expect(t, "too big", user.upload(path, "big.pdf", append([]byte("%PDF-1.4\n"), make([]byte, maxReceiptBytes)...)).status, 422)

	list := user.get(path).list(t)
	expect(t, "two receipts", len(list), 2)
	expect(t, "count on period", admin.get("/api/v1/payment-occurrences/" + id(period)).object(t)["receipts"], any(2.0))
	file := list[1]
	expect(t, "detected type", file["content_type"], any("image/png"))
	download := user.get(file["download_url"].(string))
	expect(t, "download", download.status, 200)
	expect(t, "as attachment", strings.HasPrefix(download.header.Get("Content-Disposition"), "attachment"), true)
	expect(t, "same bytes", bytes.Equal(download.body, pngBytes), true)
	expect(t, "anonymous", e.client().get(file["download_url"].(string)).status, 401)

	expect(t, "not the author", user.delete("/api/v1/receipts/"+id(list[0])).status, 403)
	expect(t, "author deletes", user.delete("/api/v1/receipts/"+id(file)).status, 204)
	expect(t, "admin deletes any", admin.delete("/api/v1/receipts/"+id(list[0])).status, 204)
}

func TestBudget(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "Аренда", "amount": "100", "category": "Офис"})
	c.createPayment(map[string]any{"title": "Домен", "amount": "15", "currency": "USD", "frequency": "yearly", "first_due_date": "2026-06-01", "category": "IT"})
	first := c.get("/api/v1/payment-occurrences").list(t)[0]
	c.patch("/api/v1/payment-occurrences/"+id(first), map[string]any{"paid": true})

	var budget struct {
		Year       int
		Currencies map[string]budgetLine
		Months     []struct {
			Month      string
			Currencies map[string]budgetLine
		}
		Categories []struct {
			Category   *string
			Currencies map[string]budgetLine
		}
	}
	c.get("/api/v1/budget?year=2026").json(t, &budget)
	expect(t, "year", budget.Year, 2026)
	expect(t, "12 months of rent are planned", budget.Currencies["RUB"].Planned, "1200.00")
	expect(t, "paid", budget.Currencies["RUB"].Paid, "100.00")
	expect(t, "remaining", budget.Currencies["RUB"].Remaining, "1100.00")
	expect(t, "yearly once", budget.Currencies["USD"].Planned, "15.00")
	expect(t, "June", budget.Months[5].Currencies["USD"].Planned, "15.00")
	expect(t, "December projected", budget.Months[11].Currencies["RUB"].Planned, "100.00")
	expect(t, "categories", *budget.Categories[0].Category+"/"+*budget.Categories[1].Category, "IT/Офис")
	expect(t, "bad year", c.get("/api/v1/budget?year=1990").status, 422)
}

func TestCSVExport(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "=HYPERLINK(\"http://evil\")", "amount": "1490.50", "category": "IT"})
	r := c.get("/api/v1/payment-occurrences/export?currency=RUB")
	expect(t, "csv", r.header.Get("Content-Type"), "text/csv; charset=utf-8")
	text := string(r.body)
	if !strings.HasPrefix(text, "\uFEFFНазвание;Категория;") {
		t.Fatalf("header: %q", text[:40])
	}
	if !strings.Contains(text, "'=HYPERLINK") || !strings.Contains(text, ";1490,50;RUB;31.01.2026;К оплате;") {
		t.Fatalf("rows:\n%s", text)
	}
}

func TestCSVImport(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "Аренда"})
	post := func(query string, raw []byte) response {
		body, contentType := multipartFile(t, "платежи.csv", raw)
		request, _ := http.NewRequest("POST", e.http.URL+"/api/v1/recurring-payments/import"+query, body)
		request.Header.Set("Content-Type", contentType)
		request.Header.Set("Origin", e.http.URL)
		request.Header.Set("X-CSRF-Token", c.csrf)
		result, err := c.http.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer result.Body.Close()
		data, _ := io.ReadAll(result.Body)
		return response{result.StatusCode, result.Header, data}
	}
	bad := "Название;Сумма;Валюта;Первая оплата\nСервер;24;BTC;15.02.2026\nАренда;45 000,00;руб;31.01.2026\n"
	var preview struct {
		Rows   []importRow
		Errors int
	}
	post("?dry_run=true", []byte(bad)).json(t, &preview)
	expect(t, "one bad row", preview.Errors, 1)
	expect(t, "error text", preview.Rows[0].Errors[0], "Валюта: RUB, USD или EUR")
	expect(t, "duplicate warning", preview.Rows[1].Warnings[0], "Платёж с таким названием уже есть")
	expect(t, "amount parsed", preview.Rows[1].Amount, "45000.00")
	expect(t, "import refused with errors", post("?dry_run=false", []byte(bad)).status, 422)
	expect(t, "nothing imported", len(c.get("/api/v1/recurring-payments").list(t)), 1)

	good, _ := charmap.Windows1251.NewEncoder().String("title,amount,currency,date,period,category\nДомен,1490,RUB,2026-03-03,ежегодно,IT\nNotion,18,eur,01.02.2026,,\n")
	result := post("?dry_run=false", []byte(good))
	expect(t, "import", result.status, 201)
	var created map[string]any
	json.Unmarshal(result.body, &created)
	expect(t, "created", created["created"], any(2.0))
	payments := c.get("/api/v1/recurring-payments").list(t)
	expect(t, "three payments", len(payments), 3)
	expect(t, "Windows-1251 decoded", payments[1]["title"], any("Домен"))
	expect(t, "yearly", payments[1]["frequency"], any("yearly"))
	template := c.get("/api/v1/recurring-payments/import/template")
	expect(t, "template", strings.Contains(string(template.body), "Первая оплата"), true)
}
