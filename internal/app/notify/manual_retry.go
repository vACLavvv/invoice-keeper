package notify

import (
	"database/sql"
	"errors"
	"invoice-keeper/internal/app/store"
	"strings"
)

var ErrNotRetryable = errors.New("Попытка уже изменилась или её нельзя безопасно повторить")
var ErrRecipientUnavailable = errors.New("Платёж уже закрыт или получатель больше недоступен")

func (w *ReminderWorker) CanRetryFailed(q store.Querier, queue string, id int64, kind, channel, recipient string) (bool, error) {
	if queue == "reminders" {
		if !w.Settings.TelegramEnabled || w.Settings.TelegramChatID == "" || w.Sender == nil {
			return false, nil
		}
		return stillPayable(q, id)
	}
	if queue != "deliveries" {
		return false, nil
	}
	sender, _ := w.senderFor(channel)
	if sender == nil {
		return false, nil
	}
	if !strings.HasPrefix(channel, "telegram:") && !strings.HasPrefix(channel, "email:") {
		available := false
		for _, candidate := range w.broadcastChannels()[channel] {
			if candidate == kind {
				available = true
			}
		}
		if !available {
			return false, nil
		}
	}
	return w.deliveryEligible(q, ReminderRow{OccurrenceID: id, Kind: kind, EmailTo: recipient}, channel)
}

// RetryFailed is called by an authenticated administrator in the transaction
// that appends its audit event. The expected token fences a stale screen/double
// click even if the first retry already failed again. Uncertain is never reset.
func (w *ReminderWorker) RetryFailed(tx *sql.Tx, queue string, id int64, kind, channel, expected string) error {
	if queue == "reminders" {
		if !w.Settings.TelegramEnabled || w.Settings.TelegramChatID == "" || w.Sender == nil {
			return ErrRecipientUnavailable
		}
		eligible, err := stillPayable(tx, id)
		if err != nil {
			return err
		}
		if !eligible {
			return ErrRecipientUnavailable
		}
		retry, err := transportRetryAt(tx, "telegram")
		if err != nil {
			return err
		}
		result, err := tx.Exec(`UPDATE reminders SET state='pending',attempts=0,attempted_at=NULL,retry_after=?,error=NULL,
			claim_token=NULL,dispatch_started_at=NULL WHERE occurrence_id=? AND state='failed' AND COALESCE(claim_token,'')=?`, retry, id, expected)
		return checkRetried(result, err)
	}
	if queue != "deliveries" {
		return ErrNotRetryable
	}
	var recipient string
	if err := tx.QueryRow("SELECT COALESCE(recipient,'') FROM deliveries WHERE occurrence_id=? AND kind=? AND channel=? AND state='failed' AND COALESCE(claim_token,'')=?", id, kind, channel, expected).Scan(&recipient); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotRetryable
		}
		return err
	}
	eligible, err := w.CanRetryFailed(tx, queue, id, kind, channel, recipient)
	if err != nil {
		return err
	}
	if !eligible {
		return ErrRecipientUnavailable
	}
	retry, err := transportRetryAt(tx, w.transportRoute(channel))
	if err != nil {
		return err
	}
	result, err := tx.Exec(`UPDATE deliveries SET state='pending',attempts=0,attempted_at=NULL,retry_after=?,error=NULL,
		claim_token=NULL,dispatch_started_at=NULL WHERE occurrence_id=? AND kind=? AND channel=? AND state='failed' AND COALESCE(claim_token,'')=?`, retry, id, kind, channel, expected)
	return checkRetried(result, err)
}

func checkRetried(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrNotRetryable
	}
	return nil
}
