package bot

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"invoice-keeper/internal/app/report"
)

const reportCacheTTL = 20 * time.Second
const reportCacheEntries = 12
const reportMaxPNG = 2 << 20

type reportImage struct {
	png     []byte
	expires time.Time
}

// Cache images, never backend financial data. Every request reads a fresh
// consistent budget snapshot. Its content hash also detects out-of-process writes.
type reportImages struct {
	mu    sync.Mutex
	items map[[32]byte]reportImage
}

func (c *reportImages) image(ctx context.Context, data report.Data) ([]byte, error) {
	raw, err := json.Marshal(data) // month/currency/day/revision, totals, categories and generation minute
	if err != nil {
		return nil, err
	}
	key := sha256.Sum256(raw)
	c.mu.Lock()
	defer c.mu.Unlock() // serialize rendering as well; bounded CPU and memory during a burst
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	now := time.Now()
	for k, entry := range c.items {
		if !now.Before(entry.expires) {
			delete(c.items, k)
		}
	}
	if entry, ok := c.items[key]; ok && data.Cacheable {
		return entry.png, nil
	}
	png, err := report.Render(data)
	if err != nil {
		return nil, err
	}
	if len(png) > reportMaxPNG {
		return nil, errors.New("report image exceeds size limit")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if data.Cacheable {
		if c.items == nil {
			c.items = map[[32]byte]reportImage{}
		}
		if len(c.items) >= reportCacheEntries {
			var oldest [32]byte
			var expiry time.Time
			for k, entry := range c.items {
				if expiry.IsZero() || entry.expires.Before(expiry) {
					oldest, expiry = k, entry.expires
				}
			}
			delete(c.items, oldest)
		}
		c.items[key] = reportImage{png: png, expires: now.Add(reportCacheTTL)}
	}
	return png, nil
}

func validReportSelection(month, currency string) bool {
	d, err := time.Parse("2006-01", month)
	return err == nil && d.Year() >= 2000 && d.Year() <= 2100 &&
		(currency == "RUB" || currency == "USD" || currency == "EUR")
}

func (b *Telegram) reportButtons(month, currency string) [][]map[string]string {
	callback := func(m, c string) string { return "report:" + m + ":" + c }
	date, _ := time.Parse("2006-01", month)
	var pager []map[string]string
	if previous := date.AddDate(0, -1, 0).Format("2006-01"); validReportSelection(previous, currency) {
		pager = append(pager, map[string]string{"text": "← Месяц", "callback_data": callback(previous, currency)})
	}
	pager = append(pager, map[string]string{"text": "Обновить", "callback_data": callback(month, currency)})
	if next := date.AddDate(0, 1, 0).Format("2006-01"); validReportSelection(next, currency) {
		pager = append(pager, map[string]string{"text": "Месяц →", "callback_data": callback(next, currency)})
	}
	var currencies []map[string]string
	for _, c := range []string{"RUB", "USD", "EUR"} {
		label := c
		if c == currency {
			label = "✓ " + label
		}
		currencies = append(currencies, map[string]string{"text": label, "callback_data": callback(month, c)})
	}
	rows := [][]map[string]string{currencies, pager, {{"text": "← Главное меню", "callback_data": "report:menu"}}}
	if b.settings.PublicBaseURL != "" {
		rows = append(rows, []map[string]string{{"text": "Панель ↗", "url": b.settings.PublicBaseURL + "/calendar?month=" + month}})
	}
	return rows
}

func (b *Telegram) reportCommand(m *Message, fields []string) error {
	month, currency := b.backend.Today().Format("2006-01"), "RUB"
	if len(fields) > 1 {
		month = fields[1]
	}
	if len(fields) > 2 {
		currency = strings.ToUpper(fields[2])
	}
	if len(fields) > 3 || !validReportSelection(month, currency) {
		return b.reply(m.Chat.ID, "Формат: /report или /report 2026-10 USD. Валюты: RUB, USD, EUR; годы: 2000–2100.")
	}
	return b.showReport(m.Chat.ID, 0, month, currency)
}

func (b *Telegram) reportCallback(c *Callback) error {
	answer := func(text string) error {
		return b.call("answerCallbackQuery", map[string]any{"callback_query_id": c.ID, "text": text}, nil)
	}
	if c.Data == "report:menu" {
		if err := answer(""); err != nil {
			return err
		}
		return b.menu(c.Message.Chat.ID, 0)
	}
	parts := strings.Split(c.Data, ":")
	if len(parts) != 3 || !validReportSelection(parts[1], parts[2]) {
		return answer("Неизвестный месяц или валюта")
	}
	if err := answer(""); err != nil {
		return err
	}
	return b.showReport(c.Message.Chat.ID, c.Message.MessageID, parts[1], parts[2])
}

func (b *Telegram) showReport(chatID, messageID int64, month, currency string) error {
	if !b.allowed(chatID) {
		return b.reply(chatID, "Этот чат не подключён к Invoice Keeper.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, err := b.backend.MonthlyReport(ctx, month, currency)
	if err != nil {
		return errors.Join(errors.New("telegram report: budget calculation failed"), b.reply(chatID, "Не удалось рассчитать отчёт. Попробуйте ещё раз немного позже."))
	}
	png, err := b.reports.image(ctx, data)
	if err != nil {
		return errors.Join(errors.New("telegram report: image rendering failed"), b.reply(chatID, "Не удалось подготовить график. Попробуйте ещё раз немного позже."))
	}
	// A private Telegram account may have been unlinked while the report rendered.
	if !b.allowed(chatID) {
		return nil
	}
	caption := fmt.Sprintf("%s · %s\nПлан: %s\nОтмечено как оплаченное: %s\nОсталось оплатить: %s\n\nСформировано: %s (%s).\nВалюты считаем отдельно. Это план платежей, а не баланс счёта.",
		report.MonthLabel(month), currency, report.Money(data.Planned), report.Money(data.Paid), report.Money(data.Planned-data.Paid),
		data.GeneratedAt.Format("02.01.2006 15:04"), data.Timezone)
	keyboard, _ := json.Marshal(map[string]any{"inline_keyboard": b.reportButtons(month, currency)})
	fields := map[string]string{"chat_id": itoa(chatID), "reply_markup": string(keyboard)}
	method := "sendPhoto"
	if messageID == 0 {
		fields["photo"], fields["caption"] = "attach://report", caption
	} else {
		method = "editMessageMedia"
		fields["message_id"] = itoa(messageID)
		media, _ := json.Marshal(map[string]string{"type": "photo", "media": "attach://report", "caption": caption})
		fields["media"] = string(media)
	}
	if err := b.uploadReport(ctx, method, fields, png); err != nil {
		// Never retry an ambiguous upload automatically: it may already be visible.
		return errors.Join(err, b.reply(chatID, "Отправка отчёта не подтверждена. Проверьте чат перед повторным запросом."))
	}
	return nil
}

func (b *Telegram) uploadReport(ctx context.Context, method string, fields map[string]string, png []byte) error {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for name, value := range fields {
		if err := mw.WriteField(name, value); err != nil {
			return errors.New("telegram report: multipart field failed")
		}
	}
	part, err := mw.CreateFormFile("report", "report.png")
	if err != nil {
		return errors.New("telegram report: multipart file failed")
	}
	if _, err := part.Write(png); err != nil {
		return errors.New("telegram report: writing image failed")
	}
	if err := mw.Close(); err != nil {
		return errors.New("telegram report: closing image failed")
	}
	request, err := http.NewRequestWithContext(ctx, "POST", b.baseURL+"/bot"+b.settings.TelegramBotToken+"/"+method, &body)
	if err != nil {
		return errors.New("telegram report: invalid request")
	}
	request.Header.Set("Content-Type", mw.FormDataContentType())
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("telegram report: upload result unknown")
	}
	defer response.Body.Close()
	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result); err != nil {
		return errors.New("telegram report: response unreadable")
	}
	if response.StatusCode == http.StatusOK && result.OK {
		return nil
	}
	if method == "editMessageMedia" && response.StatusCode == http.StatusBadRequest && strings.Contains(result.Description, "message is not modified") {
		return nil
	}
	return errors.New("telegram report: rejected upload (HTTP " + strconv.Itoa(response.StatusCode) + ")")
}
