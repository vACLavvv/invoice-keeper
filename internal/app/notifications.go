package app

// The personal notification feed: overdue periods, periods due within three days and payments
// recently marked by someone else. Read marks are per user and live on the server.

import (
	"database/sql"
	"net/http"
	"sort"
	"strings"

	"invoice-keeper/internal/app/schedule"
)

type notification struct {
	ID           string  `json:"id"`
	Kind         string  `json:"kind"` // overdue | due | paid
	OccurrenceID int64   `json:"occurrence_id"`
	Title        string  `json:"title"`
	Amount       string  `json:"amount"`
	Currency     string  `json:"currency"`
	DueDate      string  `json:"due_date"`
	PaidAt       *string `json:"paid_at"`
	PaidBy       *string `json:"paid_by"`
	Read         bool    `json:"read"`
}

// Notifications look ahead this many days and back this many for payments.
const (
	noticeAheadDays = 3
	noticePaidDays  = 7
)

func readerKey(user *User) string {
	if user.Role == "admin" {
		return "admin"
	}
	return "user:" + itoa(user.ID)
}

func (s *Server) loadNotifications(tx *sql.Tx, user *User) ([]notification, int, error) {
	today := s.Today()
	if err := schedule.Materialize(tx, today); err != nil {
		return nil, 0, err
	}
	rows, err := tx.Query(occurrenceSelect+" WHERE r.active=1 AND ((o.paid_at IS NULL AND o.due_date<=?) OR o.paid_at>=?)",
		schedule.FormatDate(today.AddDate(0, 0, noticeAheadDays)), schedule.FormatDate(today.AddDate(0, 0, -noticePaidDays)))
	if err != nil {
		return nil, 0, err
	}
	var items []notification
	for rows.Next() {
		o, err := scanOccurrence(rows, today)
		if err != nil {
			rows.Close()
			return nil, 0, err
		}
		n := notification{OccurrenceID: o.ID, Title: o.Title, Amount: o.Amount, Currency: o.Currency, DueDate: o.DueDate, PaidAt: o.PaidAt}
		switch {
		case o.PaidAt != nil:
			// Your own marks are not news to you.
			if o.UpdatedBy != nil && strings.EqualFold(*o.UpdatedBy, user.Username) {
				continue
			}
			n.Kind, n.PaidBy, n.ID = "paid", o.UpdatedBy, "paid-"+itoa(o.ID)+"-"+*o.PaidAt
		case o.Status == "overdue":
			n.Kind, n.ID = "overdue", "overdue-"+itoa(o.ID)
		default:
			n.Kind, n.ID = "due", "due-"+itoa(o.ID)
		}
		items = append(items, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	read := map[string]bool{}
	marks, err := tx.Query("SELECT item FROM notification_reads WHERE reader=?", readerKey(user))
	if err != nil {
		return nil, 0, err
	}
	for marks.Next() {
		var id string
		if err := marks.Scan(&id); err != nil {
			marks.Close()
			return nil, 0, err
		}
		read[id] = true
	}
	marks.Close()
	unread := 0
	rank := map[string]int{"overdue": 0, "due": 1, "paid": 2}
	for i := range items {
		items[i].Read = read[items[i].ID]
		if !items[i].Read {
			unread++
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if rank[a.Kind] != rank[b.Kind] {
			return rank[a.Kind] < rank[b.Kind]
		}
		if a.Kind == "paid" {
			return *a.PaidAt > *b.PaidAt
		}
		return a.DueDate < b.DueDate
	})
	if items == nil {
		items = []notification{}
	}
	return items, unread, nil
}

func (s *Server) notificationList(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	var items []notification
	var unread int
	err = s.DB.Write(func(tx *sql.Tx) error {
		items, unread, err = s.loadNotifications(tx, user)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{"items": items, "unread_count": unread})
}

// notificationRead marks (personal, so not audited) the given items (or all current ones) read or unread for this user.
func (s *Server) notificationRead(w http.ResponseWriter, r *http.Request) error {
	user, err := s.writeUser(r)
	if err != nil {
		return err
	}
	f, err := readForm(r, "ids", "all", "read")
	if err != nil {
		return err
	}
	all, read := f.boolean("all"), f.boolean("read")
	var ids []string
	if f.has("ids") {
		if err := f.decode("ids", &ids); err != nil || len(ids) > 200 {
			f.add("ids", "Ожидается список до 200 идентификаторов", "value_error")
		}
	}
	if !f.has("ids") && (all == nil || !*all) {
		f.add("ids", "Укажите ids или all=true", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	markRead := read == nil || *read
	var unread int
	err = s.DB.Write(func(tx *sql.Tx) error {
		if all != nil && *all {
			current, _, err := s.loadNotifications(tx, user)
			if err != nil {
				return err
			}
			for _, n := range current {
				ids = append(ids, n.ID)
			}
		}
		for _, id := range ids {
			query := "INSERT OR IGNORE INTO notification_reads(reader,item,read_at) VALUES(?,?,?)"
			args := []any{readerKey(user), id, schedule.Timestamp()}
			if !markRead {
				query, args = "DELETE FROM notification_reads WHERE reader=? AND item=?", args[:2]
			}
			if _, err := tx.Exec(query, args...); err != nil {
				return err
			}
		}
		// Marks for periods outside the feed window are no longer needed.
		if _, err := tx.Exec("DELETE FROM notification_reads WHERE read_at<?", schedule.FormatDate(s.Today().AddDate(0, -2, 0))); err != nil {
			return err
		}
		_, unread, err = s.loadNotifications(tx, user)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]int{"unread_count": unread})
}
