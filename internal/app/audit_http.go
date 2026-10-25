package app

import (
	"database/sql"
	"math"
	"net/http"
	"strings"
	"time"

	"invoice-keeper/internal/app/audit"
)

func (s *Server) auditVerify(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	check, err := audit.Verify(s.DB)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, check)
}

type auditEntry struct {
	ID                 int64  `json:"id"`
	Actor              string `json:"actor"`
	Action             string `json:"action"`
	Entity             string `json:"entity"`
	CreatedAt          string `json:"created_at"`
	PaymentTitle       string `json:"payment_title,omitempty"`
	RecurringPaymentID int64  `json:"recurring_payment_id,omitempty"`
	OccurrenceID       int64  `json:"occurrence_id,omitempty"`
	DueDate            string `json:"due_date,omitempty"`
	PaymentState       string `json:"payment_state,omitempty"`
}

// This is current display context, not a change to the signed journal. Removed
// and archived rows are retained deliberately. Resolve only actions whose entity
// is a payment ID: e.g. recurring.import contains a count, user.create a user ID.
// Canonical ID comparisons also keep malformed legacy entities from resolving.
// Pausing physically removes some unpaid occurrences, whose SQLite IDs can then
// be reused. Older audit entities have no identity snapshot, so any later pause
// makes occurrence/receipt context ambiguous; leave it unresolved rather than
// attach the wrong payment. Audit IDs, unlike timestamps, strictly order events.
const auditPaymentContext = ` FROM audit_log a
LEFT JOIN payment_occurrences o ON a.action IN (
  'occurrence.paid','occurrence.unpaid','occurrence.prepaid','occurrence.create',
  'occurrence.delete','occurrence.restore','receipt.add','receipt.delete')
  AND o.id=CAST(a.entity AS INTEGER) AND CAST(o.id AS TEXT)=a.entity
  AND a.id>COALESCE((SELECT MAX(id) FROM audit_log WHERE action='recurring.pause'),0)
LEFT JOIN recurring_payments r ON r.id=CASE
  WHEN o.id IS NOT NULL THEN o.recurring_payment_id
  WHEN a.action IN ('recurring.create','recurring.update','recurring.archive',
    'recurring.pause','recurring.resume','recurring.delete','recurring.restore','wallet.sanctioned')
    AND CAST(CAST(a.entity AS INTEGER) AS TEXT)=a.entity THEN CAST(a.entity AS INTEGER)
  END`

const auditPaymentColumns = `a.id,a.actor,a.action,a.entity,a.created_at,
COALESCE(r.title,''),COALESCE(r.id,0),COALESCE(o.id,0),COALESCE(o.due_date,''),
CASE WHEN r.id IS NULL THEN ''
  WHEN r.removed_at IS NOT NULL OR o.removed_at IS NOT NULL THEN 'deleted'
  WHEN r.active=0 THEN 'archived' ELSE 'active' END`

func (e auditEntry) matches(search string) bool {
	for _, value := range []string{e.Actor, e.Action, e.Entity, e.PaymentTitle, e.DueDate} {
		if strings.Contains(strings.ToLower(value), search) {
			return true
		}
	}
	return false
}

// auditPage is the journal with filters and pages. snapshot_id (the newest id when page 1 was
// loaded) keeps later pages stable while new entries arrive.
func (s *Server) auditPage(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	q := &queryParams{values: r.URL.Query()}
	from, to := parseRange(q)
	page := q.integer("page", 1, 1, 100000)
	size := q.integer("page_size", 25, 1, 100)
	snapshot := q.integer("snapshot_id", 0, 0, math.MaxInt32)
	actor, action, search := q.values.Get("actor"), q.values.Get("action"), strings.ToLower(strings.TrimSpace(q.values.Get("search")))
	if len(actor) > 80 || len(action) > 80 {
		q.add("actor", "Максимальная длина — 80", "string_too_long")
	}
	if len([]rune(search)) > 200 {
		q.add("search", "Максимальная длина — 200", "string_too_long")
	}
	if err := q.err(); err != nil {
		return err
	}
	var clauses []string
	var args []any
	// Dates are days in APP_TIMEZONE; entries are stored with UTC timestamps.
	bound := func(day time.Time) string {
		local := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, s.Settings.Location())
		return local.UTC().Format("2006-01-02T15:04:05")
	}
	if from != nil {
		clauses, args = append(clauses, "a.created_at>=?"), append(args, bound(*from))
	}
	if to != nil {
		clauses, args = append(clauses, "a.created_at<?"), append(args, bound(to.AddDate(0, 0, 1)))
	}
	if actor != "" {
		clauses, args = append(clauses, "a.actor=?"), append(args, actor)
	}
	if action != "" {
		clauses, args = append(clauses, "a.action=?"), append(args, action)
	}
	result := struct {
		Items      []auditEntry `json:"items"`
		Total      int          `json:"total"`
		Page       int          `json:"page"`
		Pages      int          `json:"pages"`
		PageSize   int          `json:"page_size"`
		SnapshotID int64        `json:"snapshot_id"`
		Actors     []string     `json:"actors"`
		Actions    []string     `json:"actions"`
	}{Items: []auditEntry{}, Page: page, PageSize: size, Actors: []string{}, Actions: []string{}}
	err := s.DB.Write(func(tx *sql.Tx) error { // one snapshot for the count, the page and the filter lists
		if snapshot == 0 {
			if err := tx.QueryRow("SELECT COALESCE(MAX(id),0) FROM audit_log").Scan(&result.SnapshotID); err != nil {
				return err
			}
		} else {
			result.SnapshotID = int64(snapshot)
		}
		where := " WHERE " + strings.Join(append(clauses, "a.id<=?"), " AND ")
		args := append(args, result.SnapshotID)
		query := "SELECT " + auditPaymentColumns + auditPaymentContext + where + " ORDER BY a.id DESC" // #nosec G202 -- only constant SQL fragments; user values are bound through args
		offset := (page - 1) * size
		if search == "" {
			if err := tx.QueryRow("SELECT COUNT(*) FROM audit_log a"+where, args...).Scan(&result.Total); err != nil {
				return err
			}
			query += " LIMIT ? OFFSET ?"
			args = append(args, size, offset)
		}
		rows, err := tx.Query(query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var e auditEntry
			if err := rows.Scan(&e.ID, &e.Actor, &e.Action, &e.Entity, &e.CreatedAt,
				&e.PaymentTitle, &e.RecurringPaymentID, &e.OccurrenceID, &e.DueDate, &e.PaymentState); err != nil {
				return err
			}
			if search != "" {
				// SQLite LIKE/lower handles ASCII only. Stream matches in Go so
				// Cyrillic titles work too, retaining only this page in memory.
				if !e.matches(search) {
					continue
				}
				result.Total++
				if result.Total <= offset || result.Total > offset+size {
					continue
				}
			}
			result.Items = append(result.Items, e)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		result.Pages = max(1, (result.Total+size-1)/size)
		for column, list := range map[string]*[]string{"actor": &result.Actors, "action": &result.Actions} {
			values, err := tx.Query("SELECT DISTINCT " + column + " FROM audit_log ORDER BY 1") // #nosec G202 -- column is one of two constant names
			if err != nil {
				return err
			}
			for values.Next() {
				var v string
				if err := values.Scan(&v); err != nil {
					values.Close()
					return err
				}
				*list = append(*list, v)
			}
			values.Close()
		}
		return nil
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}
