package app

import (
	"database/sql"
	"fmt"
	"strings"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
)

// todoText lists unpaid periods of active payments: overdue ones and, unless onlyOverdue, the next 7 days.
// Both messenger bots answer /todo and /overdue with it.
func (s *Server) todoText(onlyOverdue bool) (string, error) {
	today := s.Today()
	until := today.AddDate(0, 0, 7)
	items, err := s.loadOccurrences(s.DB, occurrenceFilter{to: &until, includeArchived: false})
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
		return fmt.Sprintf("срок %s, %d дн. назад", schedule.ShortDate(o.DueDate), o.DaysOverdue)
	})
	section("🟡 В ближайшие 7 дней", soon, func(o Occurrence) string {
		due, _ := schedule.ParseDate(o.DueDate)
		days := int(due.Sub(today).Hours() / 24)
		when := map[int]string{0: "сегодня", 1: "завтра"}[days]
		if when == "" {
			when = fmt.Sprintf("через %d дн.", days)
		}
		return fmt.Sprintf("срок %s, %s", schedule.ShortDate(o.DueDate), when)
	})
	text.WriteString("Итого:")
	for _, c := range currencies {
		if totals[c] > 0 {
			fmt.Fprintf(&text, " %s %s ·", schedule.Money(totals[c]), c)
		}
	}
	return strings.TrimSuffix(text.String(), " ·"), nil
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
