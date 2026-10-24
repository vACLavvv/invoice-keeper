package app

import (
	"fmt"
	"testing"
	"time"

	"invoice-keeper/internal/app/schedule"
)

func TestNotificationFeed(t *testing.T) {
	e := setup(t) // today 2026-01-28
	admin := e.client()
	admin.signIn()
	admin.createPayment(map[string]any{"title": "Сервер", "first_due_date": "2026-01-25"}) // overdue
	admin.createPayment(map[string]any{"title": "Аренда", "first_due_date": "2026-01-30"}) // due in 2 days
	admin.createPayment(map[string]any{"title": "Домен", "first_due_date": "2026-02-20"})  // too far
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")

	feed := admin.get("/api/v1/notifications").object(t)
	items := feed["items"].([]any)
	expect(t, "overdue and due only", len(items), 2)
	first := items[0].(map[string]any)
	expect(t, "overdue first", first["kind"], any("overdue"))
	expect(t, "unread", feed["unread_count"], any(2.0))

	// The user pays: news for the admin, not for the user.
	period := int64(first["occurrence_id"].(float64))
	expect(t, "pay", user.patch(fmt.Sprintf("/api/v1/payment-occurrences/%d", period), map[string]any{"paid": true}).status, 200)
	feed = admin.get("/api/v1/notifications").object(t)
	expect(t, "payment by someone else", feed["items"].([]any)[1].(map[string]any)["kind"], any("paid"))
	expect(t, "paid by", feed["items"].([]any)[1].(map[string]any)["paid_by"], any("alex"))
	expect(t, "own payment is not news", len(user.get("/api/v1/notifications").object(t)["items"].([]any)), 1)

	due := feed["items"].([]any)[0].(map[string]any)["id"].(string)
	read := admin.post("/api/v1/notifications/read", map[string]any{"ids": []string{due}})
	expect(t, "marked", read.object(t)["unread_count"], any(1.0))
	expect(t, "read marks are personal", user.get("/api/v1/notifications").object(t)["unread_count"], any(1.0))
	expect(t, "all", admin.post("/api/v1/notifications/read", map[string]any{"all": true}).object(t)["unread_count"], any(0.0))
	expect(t, "unread again", admin.post("/api/v1/notifications/read", map[string]any{"ids": []string{due}, "read": false}).object(t)["unread_count"], any(1.0))
	expect(t, "nothing to mark", admin.post("/api/v1/notifications/read", map[string]any{}).status, 422)

	// When a due period becomes overdue it is a new, unread notification.
	admin.post("/api/v1/notifications/read", map[string]any{"all": true})
	e.clock.Set(schedule.Civil(2026, 1, 31))
	expect(t, "overdue is new", admin.get("/api/v1/notifications").object(t)["unread_count"], any(1.0))
}

func TestAuditPageFilters(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	for i := range 5 {
		admin.createPayment(map[string]any{"title": fmt.Sprintf("Платёж %d", i)})
	}
	page := admin.get("/api/v1/audit-log/page?page_size=2&action=recurring.create").object(t)
	expect(t, "filtered total", page["total"], any(5.0))
	expect(t, "pages", page["pages"], any(3.0))
	expect(t, "page size", len(page["items"].([]any)), 2)
	snapshot := int64(page["snapshot_id"].(float64))

	admin.createPayment(map[string]any{"title": "Новый"})
	next := admin.get(fmt.Sprintf("/api/v1/audit-log/page?page_size=2&page=3&action=recurring.create&snapshot_id=%d", snapshot)).object(t)
	expect(t, "snapshot keeps pages stable", next["total"], any(5.0))
	expect(t, "last page", len(next["items"].([]any)), 1)
	expect(t, "actors listed", next["actors"].([]any)[0], any("admin"))

	// Entries carry the real time, not the test clock.
	today := time.Now().In(e.settings.Location()).Format("2006-01-02")
	expect(t, "today", admin.get("/api/v1/audit-log/page?from_date=" + today + "&to_date=" + today).object(t)["total"].(float64) > 0, true)
	expect(t, "other day", admin.get("/api/v1/audit-log/page?from_date=2026-01-20&to_date=2026-01-21").object(t)["total"], any(0.0))
	expect(t, "search", admin.get("/api/v1/audit-log/page?search=recurring.cr").object(t)["total"], any(6.0))
	expect(t, "wildcards are literal", admin.get("/api/v1/audit-log/page?search=%25_%25").object(t)["total"], any(0.0))
	expect(t, "bad size", admin.get("/api/v1/audit-log/page?page_size=500").status, 422)
}
