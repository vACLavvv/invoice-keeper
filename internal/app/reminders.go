package app

// Persistent outbox. Ambiguous delivery is never automatically retried.

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

type ReminderRow struct {
	OccurrenceID int64
	Title        string
	AmountCents  int64
	Currency     string
	DueDate      string
}

type SendResult struct {
	State      string // sent | pending (safe to retry) | uncertain (never retried)
	Error      string
	MessageID  string
	RetryDelay int
}

type Sender func(ReminderRow) SendResult

func reminderText(row ReminderRow) string {
	return fmt.Sprintf("🔔 Пора запланировать оплату\n\n%s\nСумма: %s %s\nСрок: %s\n\nInvoice Keeper · отметьте оплату в панели",
		row.Title, money(row.AmountCents), row.Currency, row.DueDate)
}

// TelegramSender posts plain text (no parse_mode, so titles cannot inject markup).
func TelegramSender(s *Settings, baseURL string) Sender {
	if baseURL == "" {
		baseURL = "https://api.telegram.org"
	}
	client := &http.Client{
		Timeout:       8 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return func(row ReminderRow) SendResult {
		body, _ := json.Marshal(map[string]string{"chat_id": s.TelegramChatID, "text": reminderText(row)})
		response, err := client.Post(baseURL+"/bot"+s.TelegramBotToken+"/sendMessage", "application/json", bytes.NewReader(body))
		// Never persist err, the response or the URL: each can expose the bot token.
		if err != nil {
			if isConnectError(err) {
				return SendResult{State: "pending", Error: "Соединение не установлено", RetryDelay: 60}
			}
			return SendResult{State: "uncertain", Error: "Неизвестен результат отправки; автоматический повтор остановлен"}
		}
		defer response.Body.Close()
		var result struct {
			OK     bool `json:"ok"`
			Result struct {
				MessageID int64 `json:"message_id"`
			} `json:"result"`
			Parameters struct {
				RetryAfter int `json:"retry_after"`
			} `json:"parameters"`
		}
		if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
			return SendResult{State: "uncertain", Error: "Неоднозначный ответ Telegram"}
		}
		if response.StatusCode == 200 && result.OK && result.Result.MessageID != 0 {
			return SendResult{State: "sent", MessageID: itoa(result.Result.MessageID)}
		}
		if response.StatusCode == 429 && !result.OK {
			delay := result.Parameters.RetryAfter
			if delay == 0 {
				delay = 60
			}
			return SendResult{State: "pending", Error: "Telegram ограничил частоту запросов", RetryDelay: max(1, delay)}
		}
		return SendResult{State: "uncertain", Error: fmt.Sprintf("Telegram отклонил запрос (HTTP %d); проверьте настройки", response.StatusCode)}
	}
}

// isConnectError reports failures where the request certainly never reached Telegram.
func isConnectError(err error) bool {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}
	var opErr *net.OpError
	return errors.As(err, &opErr) && opErr.Op == "dial" && !opErr.Timeout()
}

type ReminderWorker struct {
	DB       *DB
	Settings *Settings
	Sender   Sender
	Today    func() time.Time

	mu      sync.Mutex
	running bool
	rerun   bool
	kicks   sync.WaitGroup
	stop    chan struct{}
	done    chan struct{}
}

func NewReminderWorker(db *DB, s *Settings, sender Sender, today func() time.Time) *ReminderWorker {
	if sender == nil {
		sender = TelegramSender(s, "")
	}
	if today == nil {
		today = func() time.Time { return localToday(s) }
	}
	return &ReminderWorker{DB: db, Settings: s, Sender: sender, Today: today}
}

// Tick runs one pass. A request that arrives while a pass is running schedules one more pass
// instead of being dropped, so a payment created mid-pass is still reminded immediately.
func (w *ReminderWorker) Tick() {
	w.mu.Lock()
	if w.running {
		w.rerun = true
		w.mu.Unlock()
		return
	}
	w.running = true
	w.mu.Unlock()
	for {
		if err := w.tick(); err != nil {
			log.Printf("Не удалось выполнить фоновую проверку платежей: %v", err)
		}
		w.mu.Lock()
		if !w.rerun {
			w.running = false
			w.mu.Unlock()
			return
		}
		w.rerun = false
		w.mu.Unlock()
	}
}

// Kick starts a pass in the background (after a payment is created or changed).
func (w *ReminderWorker) Kick() {
	w.kicks.Add(1)
	go func() {
		defer w.kicks.Done()
		w.Tick()
	}()
}

// Wait blocks until passes started by Kick finish.
func (w *ReminderWorker) Wait() { w.kicks.Wait() }

const eligible = `SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
WHERE r.active=1 AND o.paid_at IS NULL AND o.due_date<=?`

type stmt struct {
	query string
	args  []any
}

func (w *ReminderWorker) tick() error {
	today := w.Today()
	now := time.Now().Unix()
	err := w.DB.Write(func(tx *sql.Tx) error {
		if err := materialize(tx, today); err != nil {
			return err
		}
		statements := []stmt{
			{"DELETE FROM sessions WHERE expires_at<=?", []any{now}},
			{"DELETE FROM auth_attempts WHERE reset_at<=?", []any{now}},
			{"UPDATE reminders SET state='uncertain',error='Отправка прервана; автоматический повтор остановлен' WHERE state='sending' AND attempted_at<?", []any{now - 300}},
			{`UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN
				(SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.paid_at IS NOT NULL OR r.active=0)`, nil},
		}
		if w.Settings.TelegramEnabled {
			horizon := formatDate(today.AddDate(0, 0, 3))
			statements = append(statements,
				stmt{"INSERT OR IGNORE INTO reminders(occurrence_id,state) SELECT id,'pending' FROM (" + eligible + ")", []any{horizon}},
				// Cancelling payment confirmation can make an unsent reminder eligible again.
				stmt{"UPDATE reminders SET state='pending' WHERE state='cancelled' AND occurrence_id IN (" + eligible + ")", []any{horizon}},
			)
		}
		for _, st := range statements {
			if _, err := tx.Exec(st.query, st.args...); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil || !w.Settings.TelegramEnabled {
		return err
	}
	for range 20 {
		var row ReminderRow
		found := false
		err := w.DB.Write(func(tx *sql.Tx) error {
			err := tx.QueryRow(`SELECT o.id,r.title,o.amount_cents,o.currency,o.due_date FROM reminders m
				JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
				WHERE m.state='pending' AND m.retry_after<=? AND r.active=1 AND o.paid_at IS NULL
				ORDER BY o.due_date,o.id LIMIT 1`, time.Now().Unix()).Scan(&row.OccurrenceID, &row.Title, &row.AmountCents, &row.Currency, &row.DueDate)
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			found = true
			_, err = tx.Exec("UPDATE reminders SET state='sending',attempts=attempts+1,attempted_at=? WHERE occurrence_id=?", time.Now().Unix(), row.OccurrenceID)
			return err
		})
		if err != nil {
			return err
		}
		if !found {
			return nil
		}
		// The committed claim survives process death. The second transaction serializes
		// sending against payment/deletion and against other worker processes.
		var result SendResult
		err = w.DB.Write(func(tx *sql.Tx) error {
			var paid sql.NullString
			var active bool
			if err := tx.QueryRow("SELECT o.paid_at,r.active FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.id=?",
				row.OccurrenceID).Scan(&paid, &active); err != nil {
				return err
			}
			if paid.Valid || !active {
				result = SendResult{State: "cancelled"}
				_, err := tx.Exec("UPDATE reminders SET state='cancelled' WHERE occurrence_id=?", row.OccurrenceID)
				return err
			}
			result = w.send(row)
			var sentAt any
			if result.State == "sent" {
				sentAt = timestamp()
			}
			_, err := tx.Exec("UPDATE reminders SET state=?,error=?,message_id=?,sent_at=?,retry_after=? WHERE occurrence_id=?",
				result.State, nullable(result.Error), nullable(result.MessageID), sentAt, time.Now().Unix()+int64(result.RetryDelay), row.OccurrenceID)
			return err
		})
		if err != nil {
			return err
		}
		if result.State == "pending" {
			return nil
		}
	}
	return nil
}

func (w *ReminderWorker) send(row ReminderRow) (result SendResult) {
	defer func() {
		if recover() != nil {
			result = SendResult{State: "uncertain", Error: "Ошибка отправки; автоматический повтор остановлен"}
		}
	}()
	result = w.Sender(row)
	switch result.State {
	case "sent", "pending", "uncertain":
		return result
	}
	return SendResult{State: "uncertain", Error: "Ошибка отправки; автоматический повтор остановлен"}
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// Start runs passes every ReminderInterval seconds until Stop.
func (w *ReminderWorker) Start() {
	w.stop, w.done = make(chan struct{}), make(chan struct{})
	go func() {
		defer close(w.done)
		ticker := time.NewTicker(time.Duration(w.Settings.ReminderInterval) * time.Second)
		defer ticker.Stop()
		for {
			w.Tick()
			select {
			case <-w.stop:
				return
			case <-ticker.C:
			}
		}
	}()
}

func (w *ReminderWorker) Stop() {
	if w.stop != nil {
		close(w.stop)
		select {
		case <-w.done:
		case <-time.After(10 * time.Second):
		}
	}
	w.Wait()
}
