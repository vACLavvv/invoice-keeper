package app

import (
	"net/http"
	"strings"
)

// channelNames is what the panel shows in «Помощь» and the journal.
func (s *Server) channelNames() map[string]bool {
	return map[string]bool{
		"telegram": s.Settings.TelegramEnabled, "max": s.Worker.Channels["max"] != nil,
		"email": s.Worker.Channels["email"] != nil, "webhook": s.Worker.Channels["webhook"] != nil,
	}
}

func (s *Server) deliveriesList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query(`SELECT d.occurrence_id,d.kind,d.channel,d.state,d.attempts,d.attempted_at,d.sent_at,d.error,r.title,o.due_date,d.recipient
		FROM deliveries d JOIN payment_occurrences o ON o.id=d.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
		ORDER BY COALESCE(d.attempted_at,0) DESC, o.due_date DESC LIMIT 200`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type delivery struct {
		OccurrenceID int64   `json:"occurrence_id"`
		Kind         string  `json:"kind"`
		Channel      string  `json:"channel"`
		State        string  `json:"state"`
		Attempts     int     `json:"attempts"`
		AttemptedAt  *int64  `json:"attempted_at"`
		SentAt       *string `json:"sent_at"`
		Error        *string `json:"error"`
		Title        string  `json:"title"`
		DueDate      string  `json:"due_date"`
		Recipient    *string `json:"recipient"`
	}
	items := []delivery{}
	for rows.Next() {
		var d delivery
		if err := rows.Scan(&d.OccurrenceID, &d.Kind, &d.Channel, &d.State, &d.Attempts, &d.AttemptedAt, &d.SentAt, &d.Error, &d.Title, &d.DueDate, &d.Recipient); err != nil {
			return err
		}
		// A personal chat id is nobody else's business: the journal shows only that it was a private chat.
		if strings.HasPrefix(d.Channel, "telegram:") {
			d.Channel = "telegram_personal"
		}
		if strings.HasPrefix(d.Channel, "email:") {
			d.Channel = "email_personal"
		}
		items = append(items, d)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}
