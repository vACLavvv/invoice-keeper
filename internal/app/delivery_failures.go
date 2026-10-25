package app

import (
	"database/sql"
	"errors"
	"net/http"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/store"
)

// Failed is a confirmed rejection/exhausted safe retry; uncertain may already
// have reached its recipient and deliberately offers no requeue button.
type deliveryFailure struct {
	Queue        string `json:"queue"`
	OccurrenceID int64  `json:"occurrence_id"`
	Kind         string `json:"kind"`
	Channel      string `json:"channel"`
	Title        string `json:"title"`
	DueDate      string `json:"due_date"`
	State        string `json:"state"`
	Error        string `json:"error"`
	Attempts     int    `json:"attempts"`
	AttemptedAt  *int64 `json:"attempted_at"`
	RetryAfter   int64  `json:"retry_after"`
	CanRetry     bool   `json:"can_retry"`
	FailureToken string `json:"failure_token"`
	ContactID    *int64 `json:"contact_id,omitempty"`
	recipient    string
}

const failuresSQL = `SELECT 'reminders' AS queue,m.occurrence_id,'due' AS kind,'telegram' AS channel,r.title,o.due_date,
m.state,COALESCE(m.error,'') AS error,m.attempts,m.attempted_at,m.retry_after,COALESCE(m.claim_token,'') AS failure_token,NULL AS contact_id,'' AS recipient
FROM reminders m JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
WHERE m.state IN ('failed','uncertain')
UNION ALL
SELECT 'deliveries',d.occurrence_id,d.kind,d.channel,r.title,o.due_date,
d.state,COALESCE(d.error,''),d.attempts,d.attempted_at,d.retry_after,COALESCE(d.claim_token,''),NULL,COALESCE(d.recipient,'')
FROM deliveries d JOIN payment_occurrences o ON o.id=d.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
WHERE d.state IN ('failed','uncertain')
UNION ALL
SELECT 'email_verification',0,'verification','email','Подтверждение почты: '||COALESCE(u.display_name,'Администратор'),'',
e.welcome_state,COALESCE(e.error,''),e.attempts,e.attempted_at,e.retry_after,COALESCE(e.claim_token,''),e.id,''
FROM email_contacts e LEFT JOIN users u ON u.id=e.user_id WHERE e.welcome_state IN ('failed','uncertain') AND e.verified_at IS NULL`

func (s *Server) deliveryFailures(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	q := &queryParams{values: r.URL.Query()}
	state := q.choice("state", "failed", "uncertain")
	page, size := q.integer("page", 1, 1, 1000000), q.integer("page_size", 25, 1, 100)
	if err := q.err(); err != nil {
		return err
	}
	result := struct {
		pageResult[deliveryFailure]
		Counts struct {
			Failed    int `json:"failed"`
			Uncertain int `json:"uncertain"`
		} `json:"counts"`
	}{pageResult: pageResult[deliveryFailure]{Items: []deliveryFailure{}, Page: page, PageSize: size}}
	err := s.readSnapshot(r.Context(), func(q store.Querier) error {
		if err := q.QueryRow("SELECT COALESCE(SUM(state='failed'),0),COALESCE(SUM(state='uncertain'),0) FROM ("+failuresSQL+")").Scan(&result.Counts.Failed, &result.Counts.Uncertain); err != nil {
			return err
		}
		where, args := "", []any{}
		result.Total = result.Counts.Failed + result.Counts.Uncertain
		if state != "" {
			where, args = " WHERE state=?", []any{state}
			result.Total = result.Counts.Failed
			if state == "uncertain" {
				result.Total = result.Counts.Uncertain
			}
		}
		result.Pages = pageCount(result.Total, size)
		rows, err := q.Query("SELECT * FROM ("+failuresSQL+")"+where+" ORDER BY COALESCE(attempted_at,0) DESC,queue,occurrence_id,kind,channel,contact_id LIMIT ? OFFSET ?", append(args, size, (page-1)*size)...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var item deliveryFailure
			if err := rows.Scan(&item.Queue, &item.OccurrenceID, &item.Kind, &item.Channel, &item.Title, &item.DueDate, &item.State, &item.Error, &item.Attempts, &item.AttemptedAt, &item.RetryAfter, &item.FailureToken, &item.ContactID, &item.recipient); err != nil {
				rows.Close()
				return err
			}
			result.Items = append(result.Items, item)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for i := range result.Items {
			item := &result.Items[i]
			if item.State == "failed" {
				item.CanRetry, err = s.Worker.CanRetryFailed(q, item.Queue, item.OccurrenceID, item.Kind, item.Channel, item.recipient)
				if err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}

func (s *Server) retryDeliveryFailure(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	f, err := readForm(r, "queue", "occurrence_id", "kind", "channel", "failure_token")
	if err != nil {
		return err
	}
	f.require("queue", "occurrence_id", "failure_token")
	queue := f.text("queue", textRule{min: 1, max: 32})
	id := f.integer("occurrence_id")
	kind := f.text("kind", textRule{min: 1, max: 20})
	channel := f.text("channel", textRule{min: 1, max: 120})
	token := f.text("failure_token", textRule{max: 128})
	if queue == nil || (*queue != "reminders" && *queue != "deliveries") {
		f.add("queue", "Неизвестная очередь", "value_error")
	}
	if id == nil || *id <= 0 {
		f.add("occurrence_id", "Ожидается ID платежа", "value_error")
	}
	if token == nil {
		f.add("failure_token", "Ожидается ключ попытки", "value_error")
	}
	if queue != nil && *queue == "deliveries" && (kind == nil || (*kind != "due" && *kind != "overdue") || channel == nil) {
		f.add("channel", "Укажите канал и вид напоминания", "value_error")
	}
	if err := f.err(); err != nil {
		return err
	}
	k, c := "due", "telegram"
	if *queue == "deliveries" {
		k, c = *kind, *channel
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		if err := s.Worker.RetryFailed(tx, *queue, *id, k, c, *token); err != nil {
			return err
		}
		return audit.Record(tx, admin.Username, "delivery.retry", *queue+":"+itoa(*id)+":"+k+":"+c)
	})
	if errors.Is(err, notify.ErrNotRetryable) || errors.Is(err, notify.ErrRecipientUnavailable) {
		return fail(409, err.Error())
	}
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return noContent(w)
}
