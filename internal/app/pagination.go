package app

import (
	"net/http"
	"sort"
	"strings"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

const occurrenceFrom = " FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id"

func (s *Server) occurrenceWhere(f occurrenceFilter) (string, []any) {
	clauses := []string{"o.removed_at IS NULL", "r.removed_at IS NULL"}
	args := []any{}
	add := func(clause string, value any) { clauses = append(clauses, clause); args = append(args, value) }
	dateColumn := "o.due_date"
	if f.dateBasis == "history" {
		dateColumn = "COALESCE(o.paid_at,o.due_date)"
	}
	if f.from != nil {
		add(dateColumn+">=?", schedule.FormatDate(*f.from))
	}
	if f.to != nil {
		add(dateColumn+"<=?", schedule.FormatDate(*f.to))
	}
	if f.currency != "" {
		add("o.currency=?", f.currency)
	}
	if !f.includeArchived {
		clauses = append(clauses, "r.active=1")
	}
	switch f.view {
	case "open":
		clauses = append(clauses, "r.active=1 AND o.paid_at IS NULL")
	case "history":
		clauses = append(clauses, "(r.active=0 OR o.paid_at IS NOT NULL)")
	}
	switch f.historyFilter {
	case "paid":
		clauses = append(clauses, "o.paid_at IS NOT NULL")
	case "archived":
		clauses = append(clauses, "r.active=0")
	}
	switch f.status {
	case "paid":
		clauses = append(clauses, "o.paid_at IS NOT NULL")
	case "unpaid":
		clauses = append(clauses, "o.paid_at IS NULL")
		add("o.due_date>=?", schedule.FormatDate(s.Today()))
	case "overdue":
		clauses = append(clauses, "o.paid_at IS NULL")
		add("o.due_date<?", schedule.FormatDate(s.Today()))
	}
	switch f.frequency {
	case "once":
		clauses = append(clauses, "r.frequency='once'")
	case "recurring":
		clauses = append(clauses, "r.frequency<>'once'")
	}
	if f.search != "" {
		clauses = append(clauses, "(keeper_contains(r.title,?)=1 OR keeper_contains(r.description,?)=1)")
		args = append(args, f.search, f.search)
	}
	if f.category == "-" {
		clauses = append(clauses, "COALESCE(r.category,'')=''")
	} else if f.category != "" {
		add("keeper_equal(r.category,?)=1", f.category)
	}
	switch f.assignee {
	case "":
	case "-":
		clauses = append(clauses, "r.assignee_id IS NULL")
	default:
		add("r.assignee_id=?", f.assignee)
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func occurrenceOrder(value string) string {
	switch value {
	case "due_desc":
		return " ORDER BY o.due_date DESC,o.id DESC"
	case "paid_desc":
		return " ORDER BY o.paid_at DESC,o.id DESC"
	default:
		return " ORDER BY o.due_date,o.id"
	}
}

type pageResult[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Pages    int `json:"pages"`
}

func pageParams(r *http.Request) (int, int, error) {
	q := &queryParams{values: r.URL.Query()}
	page, size := q.integer("page", 1, 1, 1000000), q.integer("page_size", 25, 1, 100)
	return page, size, q.err()
}
func pageCount(total, size int) int { return max(1, (total+size-1)/size) }

func (s *Server) occurrencePage(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	f, err := occurrenceQuery(r, user)
	if err != nil {
		return err
	}
	page, size, err := pageParams(r)
	if err != nil {
		return err
	}
	if err = s.ensureMaterialized(); err != nil {
		return err
	}
	result := struct {
		pageResult[Occurrence]
		Counts struct {
			All     int `json:"all"`
			Overdue int `json:"overdue"`
		} `json:"counts"`
	}{pageResult: pageResult[Occurrence]{Items: []Occurrence{}, Page: page, PageSize: size}}
	err = s.readSnapshot(r.Context(), func(q store.Querier) error {
		allFilter := f
		allFilter.status = ""
		where, args := s.occurrenceWhere(allFilter)
		if err := q.QueryRow("SELECT COUNT(*),COALESCE(SUM(CASE WHEN o.paid_at IS NULL AND o.due_date<? THEN 1 ELSE 0 END),0)"+occurrenceFrom+where, append([]any{schedule.FormatDate(s.Today())}, args...)...).Scan(&result.Counts.All, &result.Counts.Overdue); err != nil {
			return err
		}
		where, args = s.occurrenceWhere(f)
		if err := q.QueryRow("SELECT COUNT(*)"+occurrenceFrom+where, args...).Scan(&result.Total); err != nil {
			return err
		}
		result.Pages = pageCount(result.Total, size)
		result.Items, err = s.occurrenceRows(q, where+occurrenceOrder(f.sort)+" LIMIT ? OFFSET ?", append(args, size, (page-1)*size)...)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}

func (s *Server) recurringPage(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	page, size, err := pageParams(r)
	if err != nil {
		return err
	}
	p := &queryParams{values: r.URL.Query()}
	currency, status := p.choice("currency", currencies...), p.choice("status", "active", "paused", "archived")
	id := p.integer("payment_id", 0, 1, 2147483647)
	search, category := p.values.Get("search"), strings.TrimSpace(p.values.Get("category"))
	if len([]rune(search)) > 120 {
		p.add("search", "Максимальная длина — 120", "string_too_long")
	}
	if len([]rune(category)) > 40 {
		p.add("category", "Максимальная длина — 40", "string_too_long")
	}
	if err := p.err(); err != nil {
		return err
	}
	if err := s.ensureMaterialized(); err != nil {
		return err
	}
	clauses := []string{"r.removed_at IS NULL"}
	args := []any{}
	add := func(c string, v any) { clauses = append(clauses, c); args = append(args, v) }
	if id > 0 {
		add("r.id=?", id)
	}
	if currency != "" {
		add("r.currency=?", currency)
	}
	if search != "" {
		add("keeper_contains(r.title,?)=1", search)
	}
	if category == "-" {
		clauses = append(clauses, "COALESCE(r.category,'')=''")
	} else if category != "" {
		add("keeper_equal(r.category,?)=1", category)
	}
	activePause := "EXISTS(SELECT 1 FROM payment_pauses p WHERE p.recurring_payment_id=r.id AND (p.until_date IS NULL OR p.until_date>=?))"
	switch status {
	case "archived":
		clauses = append(clauses, "r.active=0")
	case "active":
		clauses = append(clauses, "r.active=1")
		add("NOT "+activePause, schedule.FormatDate(s.Today()))
	case "paused":
		clauses = append(clauses, "r.active=1")
		add(activePause, schedule.FormatDate(s.Today()))
	}
	where := " WHERE " + strings.Join(clauses, " AND ")
	result := pageResult[recurringItem]{Items: []recurringItem{}, Page: page, PageSize: size}
	err = s.readSnapshot(r.Context(), func(q store.Querier) error {
		if err := q.QueryRow("SELECT COUNT(*) FROM recurring_payments r"+where, args...).Scan(&result.Total); err != nil {
			return err
		}
		result.Pages = pageCount(result.Total, size)
		result.Items, err = s.loadRecurring(q, where+" ORDER BY r.active DESC,r.id DESC LIMIT ? OFFSET ?", append(args, size, (page-1)*size)...)
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}

func (s *Server) paymentCategories(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	rows, err := s.DB.Query("SELECT DISTINCT category FROM recurring_payments WHERE removed_at IS NULL AND category IS NOT NULL AND category<>''")
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return err
		}
		items = append(items, c)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	sort.Slice(items, func(i, j int) bool { return strings.ToLower(items[i]) < strings.ToLower(items[j]) })
	return writeJSON(w, 200, items)
}
