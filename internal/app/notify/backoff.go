package notify

import (
	"database/sql"
	"strconv"
	"strings"
	"time"
)

const backoffPrefix = "notify_backoff:"

func (w *ReminderWorker) transportRoute(channel string) string {
	if channel == "telegram" || strings.HasPrefix(channel, "telegram:") {
		// Telegram does not say whether retry_after came from a chat or bot-wide
		// limit. Conservatively pause this bot's other chats as well.
		return "telegram"
	}
	if strings.HasPrefix(channel, "email:") {
		return "email"
	}
	return channel
}

func transportRetryAt(tx *sql.Tx, route string) (int64, error) {
	var retry int64
	err := tx.QueryRow("SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM app_state WHERE key=?),0)", backoffPrefix+route).Scan(&retry)
	return retry, err
}

// A 429/connect failure backs off the transport, not merely the selected row.
// Otherwise a large queue would bypass retry_after by immediately choosing its
// next payment. Persisted cooldown also covers another worker or a restart.
func (w *ReminderWorker) deferTransport(tx *sql.Tx, route string, delay int) error {
	retry := retryDeadline(delay)
	if _, err := tx.Exec(`INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE
		SET value=excluded.value WHERE CAST(app_state.value AS INTEGER)<CAST(excluded.value AS INTEGER)`, backoffPrefix+route, strconv.FormatInt(retry, 10)); err != nil {
		return err
	}
	return w.applyTransportBackoff(tx)
}

// Called after enqueue as well: new payments must inherit an existing cooldown.
// The comparisons avoid rewriting unaffected pending rows (and emitting SSE).
func (w *ReminderWorker) applyTransportBackoff(tx *sql.Tx) error {
	if _, err := tx.Exec("DELETE FROM app_state WHERE key LIKE 'notify_backoff:%' AND CAST(value AS INTEGER)<=?", time.Now().Unix()); err != nil {
		return err
	}
	var active bool
	if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM app_state WHERE key LIKE 'notify_backoff:%')").Scan(&active); err != nil || !active {
		return err
	}
	team, err := transportRetryAt(tx, w.transportRoute("telegram"))
	if err != nil {
		return err
	}
	if team > 0 {
		if _, err := tx.Exec("UPDATE reminders SET retry_after=? WHERE state='pending' AND retry_after<?", team, team); err != nil {
			return err
		}
	}
	const route = `CASE WHEN channel='telegram' OR channel LIKE 'telegram:%' THEN 'telegram' WHEN channel LIKE 'email:%' THEN 'email' ELSE channel END`
	if _, err := tx.Exec(`UPDATE deliveries SET retry_after=(SELECT CAST(value AS INTEGER) FROM app_state WHERE key='notify_backoff:'||` + route + `)
		WHERE state='pending' AND EXISTS(SELECT 1 FROM app_state WHERE key='notify_backoff:'||` + route + ` AND CAST(value AS INTEGER)>deliveries.retry_after)`); err != nil {
		return err
	}
	email, err := transportRetryAt(tx, "email")
	if err != nil {
		return err
	}
	if email > 0 {
		_, err = tx.Exec("UPDATE email_contacts SET retry_after=? WHERE welcome_state='pending' AND retry_after<?", email, email)
	}
	return err
}
