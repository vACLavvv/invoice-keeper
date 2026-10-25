package bot

import (
	"fmt"
	"html"
	"strconv"
	"strings"

	"invoice-keeper/internal/app/schedule"
)

func (b *Telegram) navigation() [][]map[string]string {
	rows := [][]map[string]string{{{"text": "📅 Ближайшие платежи", "callback_data": "nav:todo:0"}, {"text": "⚠️ Просрочки", "callback_data": "nav:overdue:0"}}, {{"text": "📊 Отчёт за месяц", "callback_data": "nav:report"}}, {{"text": "Главное меню", "callback_data": "nav:menu"}}}
	if b.settings.PublicBaseURL != "" {
		rows = append(rows, []map[string]string{{"text": "Открыть панель ↗", "url": b.settings.PublicBaseURL + "/payments"}})
	}
	return rows
}

func (b *Telegram) menu(chatID int64, messageID int64) error {
	return b.screen(chatID, messageID, "<b>AezaKeeper</b>\nПлатежи команды под контролем.\n\n📅 Ближайшие — неоплаченные за 7 дней и просрочки.\n⚠️ Просрочки — то, что уже требует внимания.\n📊 Отчёт — план, оплачено и категории по каждой валюте.\n\nВыберите раздел кнопкой ниже.", b.navigation())
}

func (b *Telegram) screen(chatID, messageID int64, text string, buttons [][]map[string]string) error {
	payload := map[string]any{"chat_id": chatID, "text": text, "parse_mode": "HTML", "reply_markup": map[string]any{"inline_keyboard": buttons}, "link_preview_options": map[string]bool{"is_disabled": true}}
	method := "sendMessage"
	if messageID != 0 {
		payload["message_id"] = messageID
		method = "editMessageText"
	}
	err := b.call(method, payload, nil)
	// Pressing Refresh twice is harmless; Telegram rejects an identical edit.
	if err != nil && strings.Contains(err.Error(), "message is not modified") {
		return nil
	}
	return err
}

func (b *Telegram) payments(chatID, messageID int64, onlyOverdue bool, page int) error {
	p, err := b.backend.PaymentPage(onlyOverdue, page)
	if err != nil {
		return err
	}
	heading, kind := "📅 Ближайшие платежи", "todo"
	if onlyOverdue {
		heading, kind = "⚠️ Просроченные платежи", "overdue"
	}
	var text strings.Builder
	fmt.Fprintf(&text, "<b>%s</b>\n", heading)
	buttons := [][]map[string]string{}
	if p.Total == 0 {
		text.WriteString("\nВсё спокойно: неоплаченных платежей в этом разделе нет. ✅\n")
	}
	for _, o := range p.Items {
		label := "К оплате"
		if o.Status == "overdue" {
			label = "Просрочено"
		}
		title := []rune(strings.Join(strings.Fields(o.Title), " "))
		if len(title) > 160 {
			title = append(title[:159], '…')
		}
		fmt.Fprintf(&text, "\nПлатёж %d из %d\n\n<b>%s</b>\n<b>%s %s</b>\n\nСрок: %s\n%s\n", p.Page+1, p.Total, html.EscapeString(string(title)), o.Amount, o.Currency, schedule.FullDate(o.DueDate), label)
		buttons = append(buttons, []map[string]string{{"text": "✓ Отметить оплату", "callback_data": fmt.Sprintf("paid:%d:%s:%d", o.ID, kind, p.Page)}})
	}
	if p.Total > 0 {
		fmt.Fprintf(&text, "\nВсего в разделе: %s", p.Totals)
	}
	pager := []map[string]string{}
	if p.Page > 0 {
		pager = append(pager, map[string]string{"text": "← Назад", "callback_data": fmt.Sprintf("nav:%s:%d", kind, p.Page-1)})
	}
	pager = append(pager, map[string]string{"text": "Обновить", "callback_data": fmt.Sprintf("nav:%s:%d", kind, p.Page)})
	if p.Page+1 < p.Pages {
		pager = append(pager, map[string]string{"text": "Далее →", "callback_data": fmt.Sprintf("nav:%s:%d", kind, p.Page+1)})
	}
	buttons = append(buttons, pager)
	buttons = append(buttons, []map[string]string{{"text": "← Главное меню", "callback_data": "nav:menu"}})
	if b.settings.PublicBaseURL != "" {
		buttons = append(buttons, []map[string]string{{"text": "Открыть панель", "url": b.settings.PublicBaseURL + "/payments"}})
	}
	text.WriteString("\n\n«Оплачено» фиксирует сегодняшнюю дату только у выбранного периода. Исправить её можно в панели.")
	return b.screen(chatID, messageID, text.String(), buttons)
}

func (b *Telegram) navigate(c *Callback) error {
	parts := strings.Split(c.Data, ":")
	if len(parts) == 2 && parts[1] == "report" {
		return b.showReport(c.Message.Chat.ID, 0, b.backend.Today().Format("2006-01"), "RUB")
	}
	if len(parts) == 2 && parts[1] == "menu" {
		return b.menu(c.Message.Chat.ID, c.Message.MessageID)
	}
	if len(parts) != 3 || (parts[1] != "todo" && parts[1] != "overdue") {
		return nil
	}
	page, err := strconv.Atoi(parts[2])
	if err != nil || page < 0 || page > 1000000 {
		return nil
	}
	return b.payments(c.Message.Chat.ID, c.Message.MessageID, parts[1] == "overdue", page)
}
