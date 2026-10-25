package app

// botBackend gives the bots (internal/app/bot) access to payments without importing the server.

import (
	"errors"
	"fmt"
	"invoice-keeper/internal/app/schedule"
	"strings"
	"time"

	"invoice-keeper/internal/app/bot"
)

type botBackend struct{ s *Server }

// BotBackend is the Backend of the bots (main.go and the tests build them with it).
func (s *Server) BotBackend() bot.Backend { return botBackend{s} }

func (b botBackend) Today() time.Time                          { return b.s.Today() }
func (b botBackend) TodoText(onlyOverdue bool) (string, error) { return b.s.todoText(onlyOverdue) }
func (b botBackend) IsLinkedChat(chatID int64) bool            { return b.s.isLinkedChat(chatID) }
func (b botBackend) PanelName(telegramUserID int64) (string, bool) {
	return b.s.panelNameForTelegram(telegramUserID)
}
func (b botBackend) SetBotUsername(name string) { b.s.SetBotUsername(name) }

func (b botBackend) MarkPaid(id int64, actor string) (bool, error) {
	already, err := b.s.markPaidFromMessenger(id, actor)
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.Status == 404 {
		return false, bot.ErrNotFound
	}
	return already, err
}

func (b botBackend) LinkTelegram(code string, from bot.User, chatID int64) (string, error) {
	name, err := b.s.linkTelegram(code, from, chatID)
	var apiErr *apiError
	if errors.As(err, &apiErr) {
		if message, ok := apiErr.Detail.(string); ok {
			return "", &bot.UserError{Message: message}
		}
	}
	return name, err
}

// PaymentPage shares the web ledger's dates, deletion rules and separate currencies.
func (b botBackend) PaymentPage(onlyOverdue bool, page int) (bot.PaymentPage, error) {
	until := b.s.Today().AddDate(0, 0, 7)
	items, err := b.s.loadOccurrences(b.s.DB, occurrenceFilter{to: &until})
	if err != nil {
		return bot.PaymentPage{}, err
	}
	result := bot.PaymentPage{}
	totals := map[string]int64{}
	for _, o := range items {
		if o.Status != "overdue" && (onlyOverdue || o.Status != "unpaid") {
			continue
		}
		result.Items = append(result.Items, bot.PaymentItem{ID: o.ID, Title: o.Title, Amount: o.Amount, Currency: o.Currency, DueDate: o.DueDate, Status: o.Status})
		totals[o.Currency] += o.amountCents
	}
	result.Total = len(result.Items)
	result.Pages = max(1, (result.Total+4)/5)
	result.Page = min(max(page, 0), result.Pages-1)
	start := result.Page * 5
	result.Items = result.Items[start:min(start+5, result.Total)]
	var parts []string
	for _, c := range currencies {
		if totals[c] > 0 {
			parts = append(parts, fmt.Sprintf("%s %s", schedule.Money(totals[c]), c))
		}
	}
	result.Totals = strings.Join(parts, " · ")
	return result, nil
}
