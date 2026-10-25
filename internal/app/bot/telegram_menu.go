package bot

import (
	"fmt"
	"html"
	"strconv"
	"strings"
)

func (b *Telegram) navigation() [][]map[string]string {
	rows := [][]map[string]string{{{"text": "📅 Ближайшие платежи", "callback_data": "nav:todo:0"}, {"text": "⚠️ Просрочки", "callback_data": "nav:overdue:0"}}, {{"text": "Главное меню", "callback_data": "nav:menu"}}}
	if b.settings.PublicBaseURL != "" {
		rows = append(rows, []map[string]string{{"text": "Открыть панель ↗", "url": b.settings.PublicBaseURL + "/payments"}})
	}
	return rows
}

func (b *Telegram) menu(chatID int64, messageID int64) error {
	return b.screen(chatID, messageID, "<b>AezaKeeper</b>\nПлатежи команды под контролем.\n\n📅 Ближайшие — неоплаченные за 7 дней и просрочки.\n⚠️ Просрочки — то, что уже требует внимания.\n\nВыберите раздел кнопкой ниже.", b.navigation())
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
	for i, o := range p.Items {
		label := "К оплате"
		if o.Status == "overdue" {
			label = "Просрочено"
		}
		title := []rune(o.Title)
		if len(title) > 100 {
			title = append(title[:99], '…')
		}
		fmt.Fprintf(&text, "\n<b>%d. %s</b>\n%s %s · %s\nСрок: %s\n", p.Page*5+i+1, html.EscapeString(string(title)), o.Amount, o.Currency, label, o.DueDate)
		buttons = append(buttons, []map[string]string{{"text": fmt.Sprintf("✓ Оплачено · %d", p.Page*5+i+1), "callback_data": "paid:" + itoa(o.ID)}})
	}
	if p.Total > 0 {
		fmt.Fprintf(&text, "\n<b>Всего в разделе:</b> %s\nСтраница %d из %d · платежей: %d", p.Totals, p.Page+1, p.Pages, p.Total)
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
	buttons = append(buttons, b.navigation()...)
	text.WriteString("\n\n«Оплачено» фиксирует сегодняшнюю дату только у выбранного периода. Исправить её можно в панели.")
	return b.screen(chatID, messageID, text.String(), buttons)
}

func (b *Telegram) navigate(c *Callback) error {
	parts := strings.Split(c.Data, ":")
	if len(parts) == 2 && parts[1] == "menu" {
		return b.menu(c.Message.Chat.ID, c.Message.MessageID)
	}
	if len(parts) != 3 || (parts[1] != "todo" && parts[1] != "overdue") {
		return nil
	}
	page, err := strconv.Atoi(parts[2])
	if err != nil || page < 0 || page > 100000 {
		return nil
	}
	return b.payments(c.Message.Chat.ID, c.Message.MessageID, parts[1] == "overdue", page)
}
