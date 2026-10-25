package app

// The personal notification feed: overdue periods, periods due within three days and payments
// recently marked by someone else. Read marks are per user and live on the server.

import (
	"database/sql"
	"net/http"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
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

// notificationSQL selects only the small fields needed by the feed, not payment
// secrets, wallets or receipt counts. Derived IDs preserve existing read marks.
func (s *Server) notificationSQL(user *User) (string, []any) {
	day := schedule.FormatDate(s.Today())
	query := `WITH notices AS (SELECT o.id AS occurrence_id,r.title,o.amount_cents,o.currency,o.due_date,o.paid_at,o.updated_by,
 CASE WHEN o.paid_at IS NOT NULL THEN 'paid' WHEN o.due_date<? THEN 'overdue' ELSE 'due' END AS kind,
 CASE WHEN o.paid_at IS NOT NULL THEN 'paid-'||o.id||'-'||o.paid_at WHEN o.due_date<? THEN 'overdue-'||o.id ELSE 'due-'||o.id END AS id,
 MAX(COALESCE(o.updated_at,r.created_at,''),CASE WHEN o.paid_at IS NOT NULL THEN o.paid_at WHEN o.due_date<? THEN date(o.due_date,'+1 day') ELSE date(o.due_date,'-3 days') END) AS event_at
 FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
 WHERE r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND
 ((o.paid_at IS NULL AND o.due_date<=?) OR (o.paid_at>=? AND keeper_equal(COALESCE(o.updated_by,''),?)=0))) `
	return query, []any{day, day, day, schedule.FormatDate(s.Today().AddDate(0, 0, noticeAheadDays)), schedule.FormatDate(s.Today().AddDate(0, 0, -noticePaidDays)), user.Username}
}

func (s *Server) notificationRows(q store.Querier, user *User, limit, offset int, newest bool) ([]notification, error) {
	prefix, args := s.notificationSQL(user)
	query := prefix + `SELECT n.id,n.kind,n.occurrence_id,n.title,n.amount_cents,n.currency,n.due_date,n.paid_at,n.updated_by,nr.item IS NOT NULL FROM notices n LEFT JOIN notification_reads nr ON nr.reader=? AND nr.item=n.id`
	args = append(args, readerKey(user))
	if newest {
		query += " ORDER BY event_at DESC,occurrence_id DESC"
	} else {
		query += " ORDER BY CASE kind WHEN 'overdue' THEN 0 WHEN 'due' THEN 1 ELSE 2 END,CASE WHEN kind='paid' THEN paid_at END DESC,due_date,occurrence_id"
	}
	if limit > 0 {
		query += " LIMIT ? OFFSET ?"
		args = append(args, limit, offset)
	}
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []notification{}
	for rows.Next() {
		var n notification
		var cents int64
		if err := rows.Scan(&n.ID, &n.Kind, &n.OccurrenceID, &n.Title, &cents, &n.Currency, &n.DueDate, &n.PaidAt, &n.PaidBy, &n.Read); err != nil {
			return nil, err
		}
		n.Amount = schedule.Money(cents)
		if n.Kind != "paid" {
			n.PaidBy = nil
		}
		items = append(items, n)
	}
	return items, rows.Err()
}

func (s *Server) notificationCounts(q store.Querier, user *User) (total, unread int, err error) {
	prefix, args := s.notificationSQL(user)
	err = q.QueryRow(prefix+`SELECT COUNT(*),COALESCE(SUM(CASE WHEN nr.item IS NULL THEN 1 ELSE 0 END),0) FROM notices n LEFT JOIN notification_reads nr ON nr.reader=? AND nr.item=n.id`, append(args, readerKey(user))...).Scan(&total, &unread)
	return
}

func (s *Server) loadNotifications(tx *sql.Tx, user *User) ([]notification, int, error) {
	if err := schedule.Materialize(tx, s.Today()); err != nil {
		return nil, 0, err
	}
	items, err := s.notificationRows(tx, user, 0, 0, false)
	if err != nil {
		return nil, 0, err
	}
	_, unread, err := s.notificationCounts(tx, user)
	return items, unread, err
}

func (s *Server) notificationList(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	p := &queryParams{values: r.URL.Query()}
	limit, page := p.integer("limit", 0, 1, 100), p.integer("page", 1, 1, 1000000)
	if err := p.err(); err != nil {
		return err
	}
	if err := s.ensureMaterialized(); err != nil {
		return err
	}
	var items, recent []notification
	var total, unread int
	err = s.readSnapshot(r.Context(), func(q store.Querier) error {
		total, unread, err = s.notificationCounts(q, user)
		if err != nil {
			return err
		}
		items, err = s.notificationRows(q, user, limit, (page-1)*limit, false)
		if err != nil {
			return err
		}
		recent, err = s.notificationRows(q, user, 100, 0, true)
		return err
	})
	if err != nil {
		return err
	}
	size := limit
	if size == 0 {
		size = max(1, total)
	}
	return writeJSON(w, 200, map[string]any{"items": items, "unread_count": unread, "total": total, "page": page, "page_size": size, "pages": pageCount(total, size), "browser_items": recent})
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
			if err := schedule.Materialize(tx, s.Today()); err != nil {
				return err
			}
			prefix, args := s.notificationSQL(user)
			query := prefix + "INSERT OR IGNORE INTO notification_reads(reader,item,read_at) SELECT ?,id,? FROM notices" // #nosec G202 -- prefix is constant SQL; every user value is bound through args
			if markRead {
				args = append(args, readerKey(user), schedule.Timestamp())
			} else {
				query = prefix + "DELETE FROM notification_reads WHERE reader=? AND item IN (SELECT id FROM notices)"
				args = append(args, readerKey(user))
			}
			if _, err := tx.Exec(query, args...); err != nil {
				return err
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
		_, unread, err = s.notificationCounts(tx, user)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]int{"unread_count": unread})
}
