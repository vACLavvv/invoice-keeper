package app

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

// todoText is the plain-text/MAX preview. Totals cover the entire section,
// while the message contains at most ten rows and a link to the rest.
func (s *Server) todoText(onlyOverdue bool) (string, error) {
	if err := s.ensureMaterialized(); err != nil {
		return "", err
	}
	today := s.Today()
	where, args := messengerWhere(onlyOverdue, today)
	var total int
	var totals map[string]int64
	var items []bot.PaymentItem
	err := s.readSnapshot(context.Background(), func(q store.Querier) error {
		var err error
		total, totals, err = messengerTotals(q, where, args)
		if err != nil {
			return err
		}
		items, err = messengerRows(q, where, args, today, 10, 0)
		return err
	})
	if err != nil {
		return "", err
	}
	if total == 0 {
		if onlyOverdue {
			return "Просроченных платежей нет ✅", nil
		}
		return "В ближайшие 7 дней платить нечего, просрочек нет ✅", nil
	}
	var text strings.Builder
	previous := ""
	for _, item := range items {
		if item.Status != previous {
			if previous != "" {
				text.WriteString("\n")
			}
			if item.Status == "overdue" {
				text.WriteString("🔴 Просрочено\n")
			} else {
				text.WriteString("🟡 В ближайшие 7 дней\n")
			}
			previous = item.Status
		}
		due, _ := schedule.ParseDate(item.DueDate)
		days := int(due.Sub(today).Hours() / 24)
		when := ""
		if days < 0 {
			when = fmt.Sprintf("%d дн. назад", -days)
		} else {
			when = map[int]string{0: "сегодня", 1: "завтра"}[days]
			if when == "" {
				when = fmt.Sprintf("через %d дн.", days)
			}
		}
		title := []rune(strings.Join(strings.Fields(item.Title), " "))
		if len(title) > 80 {
			title = append(title[:79], '…')
		}
		fmt.Fprintf(&text, "• %s — %s %s, срок %s, %s\n", string(title), item.Amount, item.Currency, schedule.ShortDate(item.DueDate), when)
	}
	fmt.Fprintf(&text, "\nИтого по всем %d платежам: %s", total, messengerTotalText(totals))
	if total > len(items) {
		fmt.Fprintf(&text, "\nПоказано %d из %d. Остальные платежи — в панели.", len(items), total)
		if s.Settings.PublicBaseURL != "" {
			fmt.Fprintf(&text, "\n%s/payments", s.Settings.PublicBaseURL)
		} else {
			text.WriteString("\nОткройте раздел «К оплате» в Invoice Keeper.")
		}
	}
	return text.String(), nil
}

// markPaidFromMessenger records «✅ Оплачено» pressed under a reminder: paid today by actor.
// already reports a period that was marked before (the button is pressed twice or in two chats).
func (s *Server) markPaidFromMessenger(id int64, actor string) (already bool, err error) {
	today := schedule.FormatDate(s.Today())
	err = s.DB.Write(func(tx *sql.Tx) error {
		current, err := s.findOccurrence(tx, id)
		if err != nil {
			return err
		}
		if current.PaidAt != nil {
			already = true
			return nil
		}
		if _, err := tx.Exec("UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=?", today, actor, schedule.Timestamp(), id); err != nil {
			return err
		}
		return audit.Record(tx, actor, "occurrence.paid", id)
	})
	if err == nil && !already {
		s.Worker.Kick()
	}
	return already, err
}
