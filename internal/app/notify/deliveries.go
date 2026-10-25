package notify

// Deliveries: a persistent outbox for personal Telegram reminders, overdue reminders and
// the extra channels (MAX, email, webhook). Team Telegram «due» reminders keep their own table;
// everything else is one row per period, kind and channel, so each message goes out once.
// Like the Telegram outbox, a delivery with an unknown result is never retried automatically.

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/webhooks"
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
		if name == "email" && len(w.Settings.SMTPTo) == 0 {
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
	if err := w.enqueueWebhooks(tx, today); err != nil {
		return err
	}
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
	if err := w.enqueuePersonalEmail(tx, today); err != nil {
		return err
	}
	if err := w.enqueuePersonalTelegram(tx, today); err != nil {
		return err
	}

	now := time.Now().Unix()
	for _, st := range []stmt{
		{"UPDATE deliveries SET state='pending',claim_token=NULL,retry_after=0,error=NULL WHERE state='sending' AND claim_token IS NOT NULL AND dispatch_started_at IS NULL AND attempted_at<?", []any{now - 300}},
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

// Personal reminders go to the assignee and the administrator of assigned payments (or
// every payment without a team chat). A team destination already receives the broadcast.
const telegramRecipient = `((t.user_id IS NOT NULL AND t.user_id=r.assignee_id) OR
	(t.is_admin=1 AND (r.assignee_id IS NOT NULL OR ?))) AND CAST(t.chat_id AS TEXT)<>?`

func (w *ReminderWorker) enqueuePersonalTelegram(tx *sql.Tx, today time.Time) error {
	noTeamChat := w.Settings.TelegramChatID == ""
	// Pending recipients can become ineligible after unlinking, changing assignee or
	// configuring the same chat as the broadcast destination. Do this even while disabled.
	if _, err := tx.Exec(`UPDATE deliveries SET state='cancelled' WHERE state='pending' AND channel LIKE 'telegram:%'
		AND NOT EXISTS (SELECT 1 FROM telegram_links t JOIN payment_occurrences o ON o.id=deliveries.occurrence_id
		JOIN recurring_payments r ON r.id=o.recurring_payment_id
		WHERE deliveries.channel='telegram:'||t.chat_id AND `+telegramRecipient+`)`, noTeamChat, w.Settings.TelegramChatID); err != nil {
		return err
	}
	if !w.Settings.TelegramEnabled {
		return nil
	}
	for _, kind := range []string{"due", "overdue"} {
		if kind == "overdue" && !w.Settings.OverdueReminders {
			continue
		}
		from, to := today, today.AddDate(0, 0, 3)
		if kind == "overdue" {
			from, to = today.AddDate(0, 0, -overdueWindow), today.AddDate(0, 0, -1)
		}
		// Legacy due records include sent and ambiguous attempts. Keep them as suppression
		// records across upgrades: neither a restart nor a new queue may resend those messages.
		_, err := tx.Exec(`INSERT INTO deliveries(occurrence_id,kind,channel,state)
			SELECT o.id,?,'telegram:'||t.chat_id,'pending' FROM payment_occurrences o
			JOIN recurring_payments r ON r.id=o.recurring_payment_id JOIN telegram_links t ON `+telegramRecipient+`
			WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL AND o.due_date>=? AND o.due_date<=?
			AND (?<>'due' OR NOT EXISTS (SELECT 1 FROM personal_reminders p WHERE p.occurrence_id=o.id AND p.chat_id=t.chat_id))
			ON CONFLICT(occurrence_id,kind,channel) DO UPDATE SET state='pending',attempts=0,retry_after=0,error=NULL
			WHERE deliveries.state='cancelled'`, kind, noTeamChat, w.Settings.TelegramChatID,
			schedule.FormatDate(from), schedule.FormatDate(to), kind)
		if err != nil {
			return err
		}
	}
	return nil
}

// senderFor picks the transport of a delivery channel; nil when the channel is not configured now.
func (w *ReminderWorker) senderFor(channel string) (Sender, string) {
	if strings.HasPrefix(channel, "email:") {
		return w.Channels["email"], ""
	}
	if channel == "telegram" || strings.HasPrefix(channel, "telegram:") {
		if !w.Settings.TelegramEnabled {
			return nil, ""
		}
		return w.Sender, strings.TrimPrefix(strings.TrimPrefix(channel, "telegram"), ":")
	}
	return w.Channels[channel], ""
}

// deliver keeps only claim/preflight/finalization inside short transactions.
// A unique token fences every attempt, even if unlink/relink resets its counter.
func (w *ReminderWorker) deliver() (bool, error) {
	enabled := []string{}
	for channel := range w.broadcastChannels() {
		enabled = append(enabled, channel)
	}
	personal := w.Settings.TelegramEnabled
	personalEmail := w.Channels["email"] != nil
	if len(enabled) == 0 && !personal && !personalEmail {
		return false, nil
	}
	in := "''"
	args := []any{}
	for _, channel := range enabled {
		in += ",?"
		args = append(args, channel)
	}
	for range 50 {
		if w.stopped() {
			return false, nil
		}
		var row ReminderRow
		var channel string
		claim := security.RandomToken(24)
		found := false
		err := w.DB.Write(func(tx *sql.Tx) error {
			err := tx.QueryRow(`SELECT d.channel,d.kind,COALESCE(d.recipient,''),o.id,r.title,o.amount_cents,o.currency,o.due_date,`+reminderColumns+`
				FROM deliveries d JOIN payment_occurrences o ON o.id=d.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id`+sanctionsJoin+`
				WHERE d.state='pending' AND d.retry_after<=? AND r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL
				AND (d.channel IN (`+in+`) OR (? AND d.channel LIKE 'telegram:%' AND (d.kind='due' OR ?)) OR (? AND d.channel LIKE 'email:%'))
				ORDER BY o.due_date,o.id LIMIT 1`, append(append([]any{time.Now().Unix()}, args...), personal, w.Settings.OverdueReminders, personalEmail)...).
				Scan(&channel, &row.Kind, &row.EmailTo, &row.OccurrenceID, &row.Title, &row.AmountCents, &row.Currency, &row.DueDate, &row.PaymentURL, &row.PaymentDetails,
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
			_, err = tx.Exec("UPDATE deliveries SET state='sending',attempts=attempts+1,attempted_at=?,claim_token=?,dispatch_started_at=NULL WHERE occurrence_id=? AND kind=? AND channel=?",
				time.Now().Unix(), claim, row.OccurrenceID, row.Kind, channel)
			return err
		})
		if err != nil || !found {
			return false, err
		}
		sender, chat := w.senderFor(channel)
		row.ChatID = chat
		maySend := false
		err = w.DB.Write(func(tx *sql.Tx) error {
			var owned bool
			if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM deliveries WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=? AND dispatch_started_at IS NULL)",
				row.OccurrenceID, row.Kind, channel, claim).Scan(&owned); err != nil {
				return err
			}
			if !owned {
				return nil
			}
			retry, err := transportRetryAt(tx, w.transportRoute(channel))
			if err != nil {
				return err
			}
			if retry > time.Now().Unix() {
				_, err = tx.Exec("UPDATE deliveries SET state='pending',retry_after=MAX(retry_after,?) WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", retry, row.OccurrenceID, row.Kind, channel, claim)
				return err
			}
			eligible, err := w.deliveryEligible(tx, row, channel)
			if err != nil {
				return err
			}
			if !eligible || w.stopped() {
				state := "cancelled"
				if eligible && w.stopped() {
					state = "pending" // no external request started; safe on next launch
				}
				_, err = tx.Exec("UPDATE deliveries SET state=? WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", state, row.OccurrenceID, row.Kind, channel, claim)
				return err
			}
			_, err = tx.Exec("UPDATE deliveries SET dispatch_started_at=? WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", time.Now().Unix(), row.OccurrenceID, row.Kind, channel, claim)
			maySend = err == nil
			return err
		})
		if err != nil {
			return false, err
		}
		if !maySend {
			continue
		}
		result := SendResult{State: "uncertain", Error: "Канал не настроен"}
		if sender != nil {
			result = w.sendWith(sender, row)
		}
		err = w.DB.Write(func(tx *sql.Tx) error {
			var attempts int
			err := tx.QueryRow("SELECT attempts FROM deliveries WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", row.OccurrenceID, row.Kind, channel, claim).Scan(&attempts)
			if errors.Is(err, sql.ErrNoRows) {
				return nil // another generation or stale/expired claim owns this row
			}
			if err != nil {
				return err
			}
			state, sentAt, delay := result.State, any(nil), 0
			switch {
			case state == "sent":
				sentAt = schedule.Timestamp()
			case state == "pending":
				delay = RetryDelay(attempts, result.RetryDelay)
				if err := w.deferTransport(tx, w.transportRoute(channel), delay); err != nil {
					return err
				}
				eligible, err := w.deliveryEligible(tx, row, channel)
				if err != nil {
					return err
				}
				if !eligible {
					state = "cancelled"
				} else if attempts >= MaxDeliveryAttempts {
					state = "failed"
				}
			}
			_, err = tx.Exec("UPDATE deliveries SET state=?,sent_at=?,error=?,retry_after=? WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?",
				state, sentAt, nullable(result.Error), nextRetryAt(state, delay), row.OccurrenceID, row.Kind, channel, claim)
			return err
		})
		if err != nil {
			return false, err
		}
	}
	return true, nil
}

func (w *ReminderWorker) deliveryEligible(tx store.Querier, row ReminderRow, channel string) (bool, error) {
	if id, ok := webhooks.ParseChannel(channel); ok {
		endpoint, err := webhooks.Get(tx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil || !endpoint.EnabledFor(row.Kind) {
			return false, err
		}
		duplicate, err := webhookAlreadyDispatched(tx, endpoint, row.OccurrenceID, row.Kind)
		if err != nil || duplicate {
			return false, err
		}
		return stillPayable(tx, row.OccurrenceID)
	}
	if row.Kind == "overdue" && !w.Settings.OverdueReminders {
		return false, nil
	}
	eligible, err := stillPayable(tx, row.OccurrenceID)
	if err != nil || !eligible {
		return eligible, err
	}
	if strings.HasPrefix(channel, "telegram:") {
		var count int
		err := tx.QueryRow(`SELECT COUNT(*) FROM telegram_links t JOIN payment_occurrences o ON o.id=?
			JOIN recurring_payments r ON r.id=o.recurring_payment_id
			WHERE 'telegram:'||t.chat_id=? AND `+telegramRecipient,
			row.OccurrenceID, channel, w.Settings.TelegramChatID == "", w.Settings.TelegramChatID).Scan(&count)
		return count > 0, err
	}
	if strings.HasPrefix(channel, "email:") {
		var count int
		err := tx.QueryRow(`SELECT COUNT(*) FROM email_contacts e JOIN payment_occurrences o ON o.id=?
			JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE 'email:'||e.id=? AND e.email=? AND `+emailRecipient,
			row.OccurrenceID, channel, row.EmailTo).Scan(&count)
		return count == 1, err
	}
	return true, nil
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
	case "sent", "pending", "uncertain", "failed":
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
	// WEBHOOK_URL is imported once into webhook_endpoints by server bootstrap.
	// Explicit Channels["webhook"] transports remain available to embedded users
	// and older tests, but .env can no longer resurrect a disabled destination.
	return channels
}
