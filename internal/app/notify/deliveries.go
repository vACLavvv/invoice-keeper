package notify

// Deliveries: a second persistent outbox for the overdue reminder and the extra channels
// (MAX, email, webhook). The Telegram «due» reminders keep their own table (reminders.go);
// everything else is one row per period, kind and channel, so each message goes out once.
// Like the Telegram outbox, a delivery with an unknown result is never retried automatically.

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
)

// MaxDeliveryAttempts stops retrying a certainly-undelivered message (no connection, server busy).
const MaxDeliveryAttempts = 5

// overdueWindow: an overdue reminder is sent for periods that became overdue within the last week,
// so enabling the feature (or a payment entered backdated) does not flood the chat with old debts.
const overdueWindow = 7

const unpaidActive = `FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL`

// broadcast channels send every reminder of a kind; personal Telegram chats are added separately.
func (w *ReminderWorker) broadcastChannels() map[string][]string {
	channels := map[string][]string{}
	if w.Settings.TelegramEnabled && w.Settings.TelegramChatID != "" && w.Settings.OverdueReminders {
		channels["telegram"] = []string{"overdue"} // «due» goes through the reminders table
	}
	for _, name := range []string{"max", "email", "webhook"} {
		if w.Channels[name] == nil {
			continue
		}
		channels[name] = []string{"due"}
		if w.Settings.OverdueReminders {
			channels[name] = append(channels[name], "overdue")
		}
	}
	return channels
}

func (w *ReminderWorker) enqueueDeliveries(tx *sql.Tx, today time.Time) error {
	windows := map[string][]any{
		"due":     {"o.due_date>=? AND o.due_date<=?", schedule.FormatDate(today), schedule.FormatDate(today.AddDate(0, 0, 3))},
		"overdue": {"o.due_date>=? AND o.due_date<?", schedule.FormatDate(today.AddDate(0, 0, -overdueWindow)), schedule.FormatDate(today)},
	}
	for channel, kinds := range w.broadcastChannels() {
		for _, kind := range kinds {
			window := windows[kind]
			if _, err := tx.Exec("INSERT OR IGNORE INTO deliveries(occurrence_id,kind,channel,state) SELECT o.id,?,?,'pending' "+ // #nosec G202 -- window clauses are constants, values are parameters
				unpaidActive+" AND "+window[0].(string), append([]any{kind, channel}, window[1:]...)...); err != nil {
				return err
			}
		}
	}
	if w.Settings.TelegramEnabled && w.Settings.OverdueReminders {
		// The same people as personal «due» reminders: the assignee, and the admin for assigned payments
		// (or for all of them when there is no team chat).
		window := windows["overdue"]
		// #nosec G202 -- the window clause is a constant, values are parameters
		if _, err := tx.Exec(`INSERT OR IGNORE INTO deliveries(occurrence_id,kind,channel,state)
			SELECT o.id,'overdue','telegram:'||t.chat_id,'pending' FROM payment_occurrences o
			JOIN recurring_payments r ON r.id=o.recurring_payment_id
			JOIN telegram_links t ON (t.user_id IS NOT NULL AND t.user_id=r.assignee_id) OR (t.is_admin=1 AND (r.assignee_id IS NOT NULL OR ?))
			WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL AND `+window[0].(string),
			append([]any{w.Settings.TelegramChatID == ""}, window[1:]...)...); err != nil {
			return err
		}
	}
	now := time.Now().Unix()
	for _, st := range []stmt{
		{"UPDATE deliveries SET state='uncertain',error='Отправка прервана; автоматический повтор остановлен' WHERE state='sending' AND attempted_at<?", []any{now - 300}},
		{`UPDATE deliveries SET state='cancelled' WHERE state='pending' AND occurrence_id IN
			(SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.paid_at IS NOT NULL OR r.active=0 OR r.removed_at IS NOT NULL OR o.removed_at IS NOT NULL)`, nil},
	} {
		if _, err := tx.Exec(st.query, st.args...); err != nil {
			return err
		}
	}
	return nil
}

// senderFor picks the transport of a delivery channel; nil when the channel is not configured now.
func (w *ReminderWorker) senderFor(channel string) (Sender, string) {
	if channel == "telegram" || strings.HasPrefix(channel, "telegram:") {
		if !w.Settings.TelegramEnabled {
			return nil, ""
		}
		return w.Sender, strings.TrimPrefix(strings.TrimPrefix(channel, "telegram"), ":")
	}
	return w.Channels[channel], ""
}

// deliver sends pending deliveries one by one. The claim (state 'sending') is committed before
// the network call, so a crash mid-send leaves a row that becomes 'uncertain' instead of a duplicate.
func (w *ReminderWorker) deliver() error {
	enabled := []string{}
	for channel := range w.broadcastChannels() {
		enabled = append(enabled, channel)
	}
	personal := w.Settings.TelegramEnabled && w.Settings.OverdueReminders
	if len(enabled) == 0 && !personal {
		return nil
	}
	in := "''"
	args := []any{}
	for _, channel := range enabled {
		in += ",?"
		args = append(args, channel)
	}
	for range 50 {
		if w.stopped() {
			return nil
		}
		var row ReminderRow
		var channel string
		found := false
		err := w.DB.Write(func(tx *sql.Tx) error {
			err := tx.QueryRow(`SELECT d.channel,d.kind,o.id,r.title,o.amount_cents,o.currency,o.due_date,`+reminderColumns+`
				FROM deliveries d JOIN payment_occurrences o ON o.id=d.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id`+sanctionsJoin+`
				WHERE d.state='pending' AND d.retry_after<=? AND r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL
				AND (d.channel IN (`+in+`) OR (? AND d.channel LIKE 'telegram:%'))
				ORDER BY o.due_date,o.id LIMIT 1`, append(append([]any{time.Now().Unix()}, args...), personal)...).
				Scan(&channel, &row.Kind, &row.OccurrenceID, &row.Title, &row.AmountCents, &row.Currency, &row.DueDate, &row.PaymentURL, &row.PaymentDetails,
					&row.WalletNetwork, &row.WalletAddress, &row.SanctionsMatch)
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			found = true
			if err := row.openDetails(); err != nil {
				return err
			}
			_, err = tx.Exec("UPDATE deliveries SET state='sending',attempts=attempts+1,attempted_at=? WHERE occurrence_id=? AND kind=? AND channel=?",
				time.Now().Unix(), row.OccurrenceID, row.Kind, channel)
			return err
		})
		if err != nil || !found {
			return err
		}
		sender, chat := w.senderFor(channel)
		row.ChatID = chat
		result := SendResult{State: "uncertain", Error: "Канал не настроен"}
		// Serialize the final eligibility check and sending with payment removal.
		err = w.DB.Write(func(tx *sql.Tx) error {
			eligible, err := stillPayable(tx, row.OccurrenceID)
			if err != nil {
				return err
			}
			if !eligible {
				_, err := tx.Exec("UPDATE deliveries SET state='cancelled' WHERE occurrence_id=? AND kind=? AND channel=?", row.OccurrenceID, row.Kind, channel)
				return err
			}
			if sender != nil {
				result = w.sendWith(sender, row)
			}
			var attempts int
			if err := tx.QueryRow("SELECT attempts FROM deliveries WHERE occurrence_id=? AND kind=? AND channel=?", row.OccurrenceID, row.Kind, channel).
				Scan(&attempts); err != nil {
				return err
			}
			state, sentAt, delay := result.State, any(nil), int64(result.RetryDelay)
			switch {
			case state == "sent":
				sentAt = schedule.Timestamp()
			case state == "pending" && attempts >= MaxDeliveryAttempts:
				state = "failed"
			case state == "pending":
				delay = max(delay, 60) // never again in the same pass
			}
			_, err = tx.Exec("UPDATE deliveries SET state=?,sent_at=?,error=?,retry_after=? WHERE occurrence_id=? AND kind=? AND channel=?",
				state, sentAt, nullable(result.Error), time.Now().Unix()+delay, row.OccurrenceID, row.Kind, channel)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// sendWith calls a channel transport; a panic or an unknown state counts as an unknown result.
func (w *ReminderWorker) sendWith(sender Sender, row ReminderRow) (result SendResult) {
	defer func() {
		if recover() != nil {
			result = SendResult{State: "uncertain", Error: "Ошибка отправки; автоматический повтор остановлен"}
		}
	}()
	result = sender(row)
	switch result.State {
	case "sent", "pending", "uncertain":
		return result
	}
	return SendResult{State: "uncertain", Error: "Ошибка отправки; автоматический повтор остановлен"}
}

// DefaultChannels builds the transports configured in .env.
func DefaultChannels(s *config.Settings) map[string]Sender {
	channels := map[string]Sender{}
	if s.MaxBotToken != "" {
		channels["max"] = MaxSender(s, nil)
	}
	if s.SMTPHost != "" {
		channels["email"] = EmailSender(s)
	}
	if s.WebhookURL != "" {
		channels["webhook"] = WebhookSender(s, nil)
	}
	return channels
}
