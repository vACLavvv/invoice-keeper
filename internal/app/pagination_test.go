package app

import (
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"testing"
	"time"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

func TestOccurrencePagesMatchLegacyUnicodeFilters(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for i := 0; i < 37; i++ {
		c.createPayment(map[string]any{"title": fmt.Sprintf("СЕРВЕР_%02d", i), "category": "Связь", "currency": "USD", "frequency": "once", "first_due_date": fmt.Sprintf("2026-01-%02d", 20+i%12)})
	}
	c.createPayment(map[string]any{"title": "Другой платёж", "frequency": "once", "first_due_date": "2026-01-29"})
	filters := "search=" + url.QueryEscape("сервер_") + "&category=" + url.QueryEscape("сВяЗь") + "&currency=USD&frequency=once&sort=due_desc"
	legacy := c.get("/api/v1/payment-occurrences?" + filters).arrayForPagination(t)
	expect(t, "filtered legacy", len(legacy), 37)
	var collected []any
	for page := 1; page <= 6; page++ {
		out := c.get(fmt.Sprintf("/api/v1/payment-occurrences/page?%s&page_size=7&page=%d", filters, page)).object(t)
		expect(t, "total", out["total"], any(37.0))
		expect(t, "pagecount", out["pages"], any(6.0))
		items := out["items"].([]any)
		if len(items) > 7 {
			t.Fatal("unbounded page")
		}
		collected = append(collected, items...)
	}
	for i, item := range collected {
		expect(t, "page order", item.(map[string]any)["id"], legacy[i].(map[string]any)["id"])
	}
	expect(t, "beyond end", len(c.get("/api/v1/payment-occurrences/page?page=999").object(t)["items"].([]any)), 0)
	for _, bad := range []string{"page=0", "page_size=101", "sort=unsafe", "search=" + url.QueryEscape("' OR 1=1 --")} {
		result := c.get("/api/v1/payment-occurrences/page?" + bad)
		if len(bad) > 6 && bad[:6] == "search" {
			expect(t, "SQL literal", result.object(t)["total"], any(0.0))
		} else {
			expect(t, "validation", result.status, 422)
		}
	}
}

func TestOccurrencePageViewsAndHistoryDate(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-01-20"})
	future := c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-02-05"})
	c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-01-28"})
	periods := c.get("/api/v1/payment-occurrences").arrayForPagination(t)
	var first string
	for _, p := range periods {
		v := p.(map[string]any)
		if v["recurring_payment_id"] == payment["id"] {
			first = id(v)
		}
	}
	expect(t, "mark", c.patch("/api/v1/payment-occurrences/"+first, map[string]any{"paid_at": "2025-12-31"}).status, 200)
	expect(t, "archive", c.do("DELETE", "/api/v1/recurring-payments/"+id(future), nil).status, 204)
	open := c.get("/api/v1/payment-occurrences/page?view=open").object(t)
	expect(t, "one open", open["total"], any(1.0))
	history := c.get("/api/v1/payment-occurrences/page?view=history").object(t)
	expect(t, "paid plus archive", history["total"], any(2.0))
	byPaid := c.get("/api/v1/payment-occurrences/page?view=history&history_filter=paid&date_basis=history&from_date=2025-12-01&to_date=2025-12-31").object(t)
	expect(t, "actual date", byPaid["total"], any(1.0))
	byDue := c.get("/api/v1/payment-occurrences/page?view=history&history_filter=paid&from_date=2025-12-01&to_date=2025-12-31").object(t)
	expect(t, "due month stays January", byDue["total"], any(0.0))
}

func TestRecurringPagesAndOverviewAreBounded(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	var payment map[string]any
	for i := 0; i < 14; i++ {
		payment = c.createPayment(map[string]any{"title": fmt.Sprintf("Аренда %d", i), "frequency": "once", "first_due_date": "2026-01-28", "category": "Офис"})
	}
	page := c.get("/api/v1/recurring-payments/page?page_size=5&search=" + url.QueryEscape("аренда")).object(t)
	expect(t, "recurring total", page["total"], any(14.0))
	expect(t, "recurring page", len(page["items"].([]any)), 5)
	exact := c.get("/api/v1/recurring-payments/page?payment_id=" + id(payment)).object(t)
	expect(t, "exact deep link", exact["total"], any(1.0))
	expect(t, "exact id", exact["items"].([]any)[0].(map[string]any)["id"], payment["id"])
	overview := c.get("/api/v1/payments/overview").object(t)
	counts := overview["counts"].(map[string]any)
	expect(t, "open", counts["open"], any(14.0))
	expect(t, "soon", counts["soon"], any(14.0))
	expect(t, "urgent", counts["urgent"], any(14.0))
	for _, name := range []string{"week", "all", "once"} {
		expect(t, "queue capped", len(overview["queues"].(map[string]any)[name].([]any)), 5)
	}
	expect(t, "categories", len(c.get("/api/v1/payment-categories").arrayForPagination(t)), 1)
}

func TestMaterializationCacheInvalidatesAcrossConnectionsAndDay(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-01-30"})
	if err := e.server.ensureMaterialized(); err != nil {
		t.Fatal(err)
	}
	revision := e.db.ChangeRevision()
	if err := e.db.Write(func(tx *sql.Tx) error { return schedule.Materialize(tx, e.clock.Today()) }); err != nil {
		t.Fatal(err)
	}
	expect(t, "clean materialization does not write", e.db.ChangeRevision(), revision)
	other, err := store.OpenDB(e.db.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	_, err = other.Exec("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,frequency,created_at) VALUES('external',123,'EUR','2026-01-30',30,'once',?)", schedule.Timestamp())
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "external plan materialized", len(c.get("/api/v1/payment-occurrences").arrayForPagination(t)), 2)
	if err := other.Write(func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE recurring_payments SET title='rollback'")
		if err != nil {
			return err
		}
		return errors.New("rollback")
	}); err == nil {
		t.Fatal("expected rollback")
	}
	needed, err := schedule.NeedsMaterialize(e.db, e.clock.Today())
	if err != nil || needed {
		t.Fatalf("rollback must not dirty cache: %v %v", needed, err)
	}
	e.clock.Set(schedule.Civil(2026, 2, 1))
	needed, err = schedule.NeedsMaterialize(e.db, e.clock.Today())
	if err != nil || !needed {
		t.Fatalf("new day must invalidate: %v %v", needed, err)
	}
}

func TestPaginatedReadsDoNotWaitForUnrelatedWriter(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"frequency": "once"})
	e.server.Worker.Wait()
	if err := e.server.ensureMaterialized(); err != nil {
		t.Fatal(err)
	}
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() { done <- e.db.Write(func(tx *sql.Tx) error { close(entered); <-release; return nil }) }()
	<-entered
	response := make(chan int, 1)
	go func() { response <- c.get("/api/v1/payment-occurrences/page?page_size=5").status }()
	select {
	case status := <-response:
		expect(t, "read works under unrelated write lock", status, 200)
	case <-time.After(2 * time.Second):
		close(release)
		<-done
		t.Fatal("page read waited for writer")
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestNotificationPagesDoNotHideNewBrowserEvents(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for i := 0; i < 65; i++ {
		c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-01-20", "title": fmt.Sprintf("Старый %d", i)})
	}
	c.createPayment(map[string]any{"frequency": "once", "first_due_date": "2026-01-30", "title": "Новое напоминание"})
	feed := c.get("/api/v1/notifications?limit=10").object(t)
	expect(t, "small priority page", len(feed["items"].([]any)), 10)
	expect(t, "full unread count", feed["unread_count"], any(66.0))
	expect(t, "new event reachable", feed["browser_items"].([]any)[0].(map[string]any)["title"], any("Новое напоминание"))
	expect(t, "mark all beyond current page", c.post("/api/v1/notifications/read", map[string]any{"all": true}).object(t)["unread_count"], any(0.0))
	expect(t, "unmark all", c.post("/api/v1/notifications/read", map[string]any{"all": true, "read": false}).object(t)["unread_count"], any(66.0))
}

func (r response) arrayForPagination(t *testing.T) []any {
	var values []any
	r.json(t, &values)
	return values
}
