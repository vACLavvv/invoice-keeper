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
	ID        int64  `json:"id"`
	Actor     string `json:"actor"`
	Action    string `json:"action"`
	Entity    string `json:"entity"`
	CreatedAt string `json:"created_at"`
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
	actor, action, search := q.values.Get("actor"), q.values.Get("action"), strings.TrimSpace(q.values.Get("search"))
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
		clauses, args = append(clauses, "created_at>=?"), append(args, bound(*from))
	}
	if to != nil {
		clauses, args = append(clauses, "created_at<?"), append(args, bound(to.AddDate(0, 0, 1)))
	}
	if actor != "" {
		clauses, args = append(clauses, "actor=?"), append(args, actor)
	}
	if action != "" {
		clauses, args = append(clauses, "action=?"), append(args, action)
	}
	if search != "" {
		like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search) + "%"
		clauses = append(clauses, `(actor LIKE ? ESCAPE '\' OR action LIKE ? ESCAPE '\' OR entity LIKE ? ESCAPE '\')`)
		args = append(args, like, like, like)
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
		where := " WHERE " + strings.Join(append(clauses, "id<=?"), " AND ")
		args := append(args, result.SnapshotID)
		if err := tx.QueryRow("SELECT COUNT(*) FROM audit_log"+where, args...).Scan(&result.Total); err != nil {
			return err
		}
		result.Pages = max(1, (result.Total+size-1)/size)
		rows, err := tx.Query("SELECT id,actor,action,entity,created_at FROM audit_log"+where+" ORDER BY id DESC LIMIT ? OFFSET ?", // #nosec G202 -- where contains only constant predicates above; all user values are bound through args
			append(args, size, (page-1)*size)...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var e auditEntry
			if err := rows.Scan(&e.ID, &e.Actor, &e.Action, &e.Entity, &e.CreatedAt); err != nil {
				return err
			}
			result.Items = append(result.Items, e)
		}
		if err := rows.Err(); err != nil {
			return err
		}
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
