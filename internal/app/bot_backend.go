package app

// botBackend gives the bots (internal/app/bot) access to payments without importing the server.

import (
	"context"
	"errors"
	"time"

	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/store"
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
	result := bot.PaymentPage{Items: []bot.PaymentItem{}}
	if err := b.s.ensureMaterialized(); err != nil {
		return result, err
	}
	today := b.s.Today()
	where, args := messengerWhere(onlyOverdue, today)
	err := b.s.readSnapshot(context.Background(), func(q store.Querier) error {
		total, totals, err := messengerTotals(q, where, args)
		if err != nil {
			return err
		}
		result.Total = total
		result.Pages = max(1, (total+4)/5)
		result.Page = min(max(page, 0), result.Pages-1)
		result.Totals = messengerTotalText(totals)
		result.Items, err = messengerRows(q, where, args, today, 5, result.Page*5)
		return err
	})
	return result, err
}
