// Package bot runs the Telegram and MAX bots: long polling, the «✅ Оплачено» button under reminders
// and the /todo, /overdue, /chatid, /help commands. What the bots do with payments goes through
// Backend, so the package does not depend on the HTTP server.
package bot

import (
	"errors"
	"strconv"
	"time"
)

// Backend is what the bots need from the application.
type Backend interface {
	Today() time.Time
	// TodoText lists unpaid periods: overdue ones and, unless onlyOverdue, the next 7 days.
	TodoText(onlyOverdue bool) (string, error)
	// MarkPaid records «Оплачено» by actor; ErrNotFound for an unknown period.
	MarkPaid(occurrenceID int64, actor string) (already bool, err error)
	// LinkTelegram consumes a /start code; a *UserError explains a refused code to the user.
	LinkTelegram(code string, from User, chatID int64) (panelName string, err error)
	IsLinkedChat(chatID int64) bool
	// PanelName is the panel login linked to a Telegram user.
	PanelName(telegramUserID int64) (string, bool)
	SetBotUsername(name string)
}

// ErrNotFound: the period is unknown (deleted or never existed).
var ErrNotFound = errors.New("not found")

// UserError is a refusal the bot shows to the user as is.
type UserError struct{ Message string }

func (e *UserError) Error() string { return e.Message }

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
