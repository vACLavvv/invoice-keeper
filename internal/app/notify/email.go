package notify

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"html"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"net/url"
	"strings"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/security"
)

// VerificationMessage contains no password or payment details. The secret lives in the URL
// fragment, so loading the landing page does not put it in access logs or a Referer header.
func VerificationMessage(s *config.Settings, to, name, link string) []byte {
	var body bytes.Buffer
	multi := multipart.NewWriter(&body)
	plain := "Здравствуйте, " + name + "!\n\nДля вас подключают уведомления Invoice Keeper. Подтвердите адрес электронной почты:\n" + link + "\n\nПосле подтверждения сюда будут приходить напоминания по назначенным вам платежам. Ссылка действует 24 часа. Если вы не ожидали письмо, просто проигнорируйте его."
	markup := `<html lang="ru"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#172023"><main style="max-width:520px;margin:32px auto;padding:32px;background:white;border-radius:16px"><p style="font-weight:bold">Invoice Keeper</p><h1 style="font-size:26px">Подтвердите почту</h1><p>Здравствуйте, ` + html.EscapeString(name) + `!</p><p>Подтвердите этот адрес, чтобы получать напоминания по назначенным вам платежам.</p><p style="margin:28px 0"><a href="` + html.EscapeString(link) + `" style="display:inline-block;padding:14px 22px;background:#1f493d;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Подтвердить почту</a></p><p style="color:#626c70;font-size:14px">Ссылка действует 24 часа. Если вы не ожидали письмо, просто проигнорируйте его.</p><p style="font-size:12px;word-break:break-all">Если кнопка не открывается: <a href="` + html.EscapeString(link) + `">` + html.EscapeString(link) + `</a></p></main></body></html>`
	for _, part := range []struct{ kind, text string }{{"text/plain", plain}, {"text/html", markup}} {
		writer, _ := multi.CreatePart(textproto.MIMEHeader{"Content-Type": {part.kind + "; charset=UTF-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
		qp := quotedprintable.NewWriter(writer)
		qp.Write([]byte(strings.ReplaceAll(part.text, "\n", "\r\n")))
		qp.Close()
	}
	multi.Close()
	headers := []string{"From: " + s.SMTPFrom, "To: " + to,
		"Subject: " + mime.BEncoding.Encode("UTF-8", "Добро пожаловать в Invoice Keeper — подтвердите почту"),
		"Date: " + time.Now().Format(time.RFC1123Z), "Message-ID: <verify-" + security.Digest(link)[:24] + "@invoice-keeper>",
		"MIME-Version: 1.0", "Content-Type: multipart/alternative; boundary=" + multi.Boundary()}
	return append([]byte(strings.Join(headers, "\r\n")+"\r\n\r\n"), body.Bytes()...)
}

func VerificationSender(s *config.Settings) func(string, string, string) SendResult {
	return func(to, name, link string) SendResult {
		settings := *s
		settings.SMTPTo = []string{to}
		err := sendMail(&settings, VerificationMessage(&settings, to, name, link))
		if err == nil {
			return SendResult{State: "sent"}
		}
		if errors.Is(err, errBeforeData) {
			return SendResult{State: "pending", Error: "Не удалось отправить письмо. Проверьте настройки SMTP.", RetryDelay: 300}
		}
		return SendResult{State: "uncertain", Error: "Результат отправки неизвестен. Проверьте почту перед повторной отправкой."}
	}
}

func (w *ReminderWorker) sendEmailVerifications() (bool, error) {
	if w.Settings.SMTPHost == "" || w.Settings.PublicBaseURL == "" || w.VerificationSender == nil {
		return false, nil
	}
	now := time.Now().Unix()
	if _, err := w.DB.Exec(`UPDATE email_contacts SET welcome_state='uncertain',token_secret='',error='Отправка прервана; проверьте почту перед повтором'
		WHERE welcome_state='sending' AND attempted_at<?`, now-300); err != nil {
		return false, err
	}
	if _, err := w.DB.Exec(`UPDATE email_contacts SET welcome_state='expired',token_secret='' WHERE verified_at IS NULL AND expires_at<=? AND welcome_state IN ('pending','sent')`, now); err != nil {
		return false, err
	}
	for range 10 {
		if w.stopped() {
			return false, nil
		}
		var id int64
		var to, name, secret, hash string
		var attempts int
		claim := security.RandomToken(24)
		found := false
		err := w.DB.Write(func(tx *sql.Tx) error {
			retry, err := transportRetryAt(tx, "email")
			if err != nil || retry > time.Now().Unix() {
				return err
			}
			err = tx.QueryRow(`SELECT e.id,e.email,COALESCE(u.display_name,'Администратор'),e.token_secret,e.token_hash,e.attempts
				FROM email_contacts e LEFT JOIN users u ON u.id=e.user_id
				WHERE e.verified_at IS NULL AND e.welcome_state='pending' AND e.retry_after<=? AND e.expires_at>? ORDER BY e.id LIMIT 1`, now, now).
				Scan(&id, &to, &name, &secret, &hash, &attempts)
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			found = true
			_, err = tx.Exec("UPDATE email_contacts SET welcome_state='sending',attempts=attempts+1,attempted_at=?,claim_token=? WHERE id=?", now, claim, id)
			return err
		})
		if err != nil || !found {
			return false, err
		}
		code, err := security.DecryptText("email_contacts.token_secret", secret)
		if err != nil {
			return false, err
		}
		link := w.Settings.PublicBaseURL + "/confirm-email#token=" + url.QueryEscape(code)
		// Re-check the same generation immediately before starting SMTP. A changed
		// address, confirmation, expiry or explicit resend invalidates this claim.
		maySend := false
		err = w.DB.Write(func(tx *sql.Tx) error {
			if w.stopped() {
				_, err := tx.Exec("UPDATE email_contacts SET welcome_state='pending' WHERE id=? AND token_hash=? AND claim_token=? AND welcome_state='sending'", id, hash, claim)
				return err
			}
			retry, err := transportRetryAt(tx, "email")
			if err != nil {
				return err
			}
			if retry > time.Now().Unix() {
				_, err = tx.Exec("UPDATE email_contacts SET welcome_state='pending',retry_after=MAX(retry_after,?) WHERE id=? AND token_hash=? AND claim_token=? AND welcome_state='sending'", retry, id, hash, claim)
				return err
			}
			if _, err := tx.Exec(`UPDATE email_contacts SET welcome_state='expired',token_secret='' WHERE id=? AND token_hash=? AND claim_token=?
				AND welcome_state='sending' AND verified_at IS NULL AND expires_at<=?`, id, hash, claim, time.Now().Unix()); err != nil {
				return err
			}
			return tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM email_contacts WHERE id=? AND token_hash=? AND claim_token=?
				AND email=? AND verified_at IS NULL AND welcome_state='sending' AND expires_at>?)`, id, hash, claim, to, time.Now().Unix()).Scan(&maySend)
		})
		if err != nil {
			return false, err
		}
		if !maySend {
			continue
		}
		result := w.sendWith(func(ReminderRow) SendResult { return w.VerificationSender(to, name, link) }, ReminderRow{})
		state := result.State
		delay := RetryDelay(attempts+1, result.RetryDelay)
		if state == "pending" && attempts+1 >= MaxDeliveryAttempts {
			state = "failed"
		}
		keepSecret := ""
		if state == "pending" {
			keepSecret = secret
		}
		err = w.DB.Write(func(tx *sql.Tx) error {
			if result.State == "pending" {
				if err := w.deferTransport(tx, "email", delay); err != nil {
					return err
				}
			}
			_, err := tx.Exec(`UPDATE email_contacts SET welcome_state=?,token_secret=?,retry_after=?,error=?
				WHERE id=? AND token_hash=? AND claim_token=? AND welcome_state='sending' AND verified_at IS NULL`,
				state, keepSecret, nextRetryAt(state, delay), nullable(result.Error), id, hash, claim)
			return err
		})
		if err != nil {
			return false, err
		}
	}
	return true, nil
}

// A recipient is eligible only while it still owns this assignment, is confirmed and has
// notifications enabled. The administrator receives payments without an assignee.
const emailRecipient = `e.verified_at IS NOT NULL AND e.enabled=1 AND
	((r.assignee_id IS NOT NULL AND e.user_id=r.assignee_id) OR (r.assignee_id IS NULL AND e.is_admin=1))`

func (w *ReminderWorker) enqueuePersonalEmail(tx *sql.Tx, today time.Time) error {
	if w.Channels["email"] == nil {
		return nil
	}
	// The optional shared inbox already receives the broadcast for this period. Do not send
	// it another copy when its owner also enables personal email.
	shared := []string{}
	for _, value := range w.Settings.SMTPTo {
		if address, err := mail.ParseAddress(value); err == nil {
			at := strings.LastIndexByte(address.Address, '@')
			if at > 0 {
				shared = append(shared, address.Address[:at]+"@"+strings.ToLower(address.Address[at+1:]))
			}
		}
	}
	sharedJSON, _ := json.Marshal(shared)
	const withoutShared = ` AND NOT EXISTS (SELECT 1 FROM json_each(?) WHERE value=e.email)`
	// Cancel old recipients before inserting new ones. Sent/uncertain deliveries are never reset.
	if _, err := tx.Exec(`UPDATE deliveries SET state='cancelled' WHERE state='pending' AND channel LIKE 'email:%'
		AND NOT EXISTS (SELECT 1 FROM email_contacts e JOIN payment_occurrences o ON o.id=deliveries.occurrence_id
		JOIN recurring_payments r ON r.id=o.recurring_payment_id
		WHERE deliveries.channel='email:'||e.id AND deliveries.recipient=e.email AND `+emailRecipient+withoutShared+`)`, string(sharedJSON)); err != nil {
		return err
	}
	for _, kind := range []string{"due", "overdue"} {
		if kind == "overdue" && !w.Settings.OverdueReminders {
			continue
		}
		from, to := today, today.AddDate(0, 0, 3)
		if kind == "overdue" {
			from, to = today.AddDate(0, 0, -overdueWindow), today.AddDate(0, 0, -1)
		}
		_, err := tx.Exec(`INSERT INTO deliveries(occurrence_id,kind,channel,recipient,state)
			SELECT o.id,?,'email:'||e.id,e.email,'pending' FROM payment_occurrences o
			JOIN recurring_payments r ON r.id=o.recurring_payment_id JOIN email_contacts e ON `+emailRecipient+withoutShared+`
			WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL AND o.due_date>=? AND o.due_date<=?
			ON CONFLICT(occurrence_id,kind,channel) DO UPDATE SET recipient=excluded.recipient,state='pending',attempts=0,retry_after=0,error=NULL
			WHERE deliveries.state='cancelled'`, kind, string(sharedJSON), from.Format("2006-01-02"), to.Format("2006-01-02"))
		if err != nil {
			return err
		}
	}
	return nil
}
