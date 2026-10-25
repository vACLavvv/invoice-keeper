package app

import (
	"database/sql"
	"fmt"
	"net/url"
	"testing"

	"invoice-keeper/internal/app/audit"
)

func TestAuditPaymentContextResolvesOnlyKnownEntities(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "Другой платёж"})
	payment := c.createPayment(map[string]any{"title": "Оплата сервера"})
	paymentID := int64(payment["id"].(float64))
	var occurrenceID int64
	var dueDate string
	if err := e.db.QueryRow("SELECT id,due_date FROM payment_occurrences WHERE recurring_payment_id=? ORDER BY id LIMIT 1", paymentID).Scan(&occurrenceID, &dueDate); err != nil {
		t.Fatal(err)
	}
	if occurrenceID == paymentID {
		t.Fatal("test must distinguish period IDs from payment IDs")
	}
	type sample struct {
		action, entity  string
		payment, period int64
	}
	var cases []sample
	for _, action := range []string{"recurring.create", "recurring.update", "recurring.archive", "recurring.pause", "recurring.resume", "recurring.delete", "recurring.restore", "wallet.sanctioned"} {
		cases = append(cases, sample{action, itoa(paymentID), paymentID, 0})
	}
	for _, action := range []string{"occurrence.paid", "occurrence.unpaid", "occurrence.prepaid", "occurrence.create", "occurrence.delete", "occurrence.restore", "receipt.add", "receipt.delete"} {
		cases = append(cases, sample{action, itoa(occurrenceID), paymentID, occurrenceID})
	}
	for _, action := range []string{"user.create", "user.update", "user.delete", "api_key.create", "recurring.import", "occurrence.unknown", "suggestion.create", "sanctions.update"} {
		cases = append(cases, sample{action, itoa(paymentID), 0, 0})
	}
	cases = append(cases,
		sample{"recurring.create", itoa(paymentID) + ".0", 0, 0},
		sample{"occurrence.paid", itoa(occurrenceID) + "invalid", 0, 0},
		sample{"recurring.update", "999999", 0, 0},
	)
	if err := e.db.Write(func(tx *sql.Tx) error {
		for i, test := range cases {
			if err := audit.Record(tx, fmt.Sprintf("context-%d", i), test.action, test.entity); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for i, test := range cases {
		t.Run(fmt.Sprintf("%s_%s", test.action, test.entity), func(t *testing.T) {
			var page struct{ Items []auditEntry }
			c.get(fmt.Sprintf("/api/v1/audit-log/page?actor=context-%d", i)).json(t, &page)
			expect(t, "one matching action", len(page.Items), 1)
			entry := page.Items[0]
			expect(t, "signed entity unchanged", entry.Entity, test.entity)
			expect(t, "payment", entry.RecurringPaymentID, test.payment)
			expect(t, "period", entry.OccurrenceID, test.period)
			if test.payment != 0 {
				expect(t, "title", entry.PaymentTitle, "Оплата сервера")
				expect(t, "state", entry.PaymentState, "active")
			} else {
				expect(t, "no unrelated title", entry.PaymentTitle, "")
				expect(t, "no unrelated state", entry.PaymentState, "")
			}
			if test.period != 0 {
				expect(t, "period date", entry.DueDate, dueDate)
			} else {
				expect(t, "no invented date", entry.DueDate, "")
			}
		})
	}
	expect(t, "journal intact", c.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

func TestAuditContextSurvivesRemovalArchiveAndRename(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	payment := c.createPayment(map[string]any{"title": "Исходная аренда"})
	base := "/api/v1/recurring-payments/" + id(payment)
	period := c.get("/api/v1/payment-occurrences").list(t)[0]
	periodPath := base + "/periods/" + period["due_date"].(string)
	expect(t, "pay period", c.patch("/api/v1/payment-occurrences/"+id(period), map[string]any{"paid": true}).status, 200)
	var originalHash string
	if err := e.db.QueryRow("SELECT hash FROM audit_log WHERE action='recurring.create'").Scan(&originalHash); err != nil {
		t.Fatal(err)
	}
	expect(t, "rename", c.patch(base, map[string]any{"title": "Текущая аренда"}).status, 200)
	checkContext := func(action, state string) {
		t.Helper()
		var page struct {
			Items []auditEntry
			Total int
		}
		c.get("/api/v1/audit-log/page?action="+action+"&search="+url.QueryEscape("текущая аренда")).json(t, &page)
		expect(t, "history searchable by current title", page.Total, 1)
		expect(t, "title retained", page.Items[0].PaymentTitle, "Текущая аренда")
		expect(t, "state", page.Items[0].PaymentState, state)
		if action == "occurrence.paid" {
			expect(t, "original period retained", page.Items[0].DueDate, period["due_date"].(string))
			expect(t, "period id retained", page.Items[0].OccurrenceID, int64(period["id"].(float64)))
		}
	}
	checkContext("recurring.create", "active")
	expect(t, "remove period", c.delete(periodPath).status, 204)
	checkContext("occurrence.paid", "deleted")
	checkContext("recurring.create", "active")
	expect(t, "restore period", c.post(periodPath+"/restore", nil).status, 204)
	expect(t, "archive", c.delete(base).status, 204)
	checkContext("occurrence.paid", "archived")
	checkContext("recurring.create", "archived")
	expect(t, "remove payment", c.delete(base+"?mode=delete").status, 204)
	checkContext("occurrence.paid", "deleted")
	checkContext("recurring.create", "deleted")
	expect(t, "restore payment", c.post(base+"/restore", nil).status, 204)
	checkContext("recurring.create", "archived")
	var currentHash string
	if err := e.db.QueryRow("SELECT hash FROM audit_log WHERE action='recurring.create'").Scan(&currentHash); err != nil {
		t.Fatal(err)
	}
	expect(t, "display context never rewrites historical signatures", currentHash, originalHash)
	expect(t, "journal intact", c.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

func TestAuditTitleSearchKeepsFiltersAndSnapshot(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	for i := range 5 {
		c.createPayment(map[string]any{"title": fmt.Sprintf("АРЕНДА офиса %d", i)})
	}
	path := "/api/v1/audit-log/page?page_size=2&actor=admin&action=recurring.create&search=" + url.QueryEscape("аренда")
	first := c.get(path).object(t)
	expect(t, "Unicode case insensitive title search", first["total"], any(5.0))
	expect(t, "matching pages", first["pages"], any(3.0))
	expect(t, "first page size", len(first["items"].([]any)), 2)
	c.createPayment(map[string]any{"title": "Аренда нового офиса"})
	next := c.get(path + fmt.Sprintf("&page=3&snapshot_id=%.0f", first["snapshot_id"])).object(t)
	expect(t, "snapshot keeps search results stable", next["total"], any(5.0))
	expect(t, "last page size", len(next["items"].([]any)), 1)
	expect(t, "other actor does not match titles", c.get("/api/v1/audit-log/page?actor=nobody&search=" + url.QueryEscape("аренда")).object(t)["total"], any(0.0))
	c.createPayment(map[string]any{"title": `Literal 50%_\payment`})
	expect(t, "wildcards stay literal in titles", c.get("/api/v1/audit-log/page?search=" + url.QueryEscape(`50%_\`)).object(t)["total"], any(1.0))
	expect(t, "SQL injection remains literal", c.get("/api/v1/audit-log/page?search=" + url.QueryEscape("' OR 1=1 --")).object(t)["total"], any(0.0))
}

func TestAuditDoesNotMislabelReusedOccurrenceIDsAfterPause(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	original := c.createPayment(map[string]any{"title": "Старая аренда"})
	period := c.get("/api/v1/payment-occurrences").list(t)[0]
	path := "/api/v1/payment-occurrences/" + id(period)
	expect(t, "pay original", c.patch(path, map[string]any{"paid": true}).status, 200)
	expect(t, "add receipt", c.upload(path+"/receipts", "receipt.png", pngBytes).status, 201)
	receipt := c.get(path + "/receipts").list(t)[0]
	expect(t, "remove receipt", c.delete("/api/v1/receipts/"+id(receipt)).status, 204)
	expect(t, "undo original payment", c.patch(path, map[string]any{"paid": false}).status, 200)
	expect(t, "pause removes unpaid periods", c.post("/api/v1/recurring-payments/"+id(original)+"/pause", nil).status, 200)
	expect(t, "original period no longer exists", c.get(path).status, 404)
	replacement := c.createPayment(map[string]any{"title": "Другой сервер"})
	reused := c.get(path).object(t)
	expect(t, "SQLite reused the original period ID", id(reused), id(period))
	expect(t, "ID now belongs to another payment", reused["recurring_payment_id"], replacement["id"])
	expect(t, "pay replacement", c.patch(path, map[string]any{"paid": true}).status, 200)
	var page struct{ Items []auditEntry }
	c.get("/api/v1/audit-log/page?action=occurrence.paid").json(t, &page)
	expect(t, "both original signed events retained", len(page.Items), 2)
	expect(t, "new event resolves current payment", page.Items[0].PaymentTitle, "Другой сервер")
	expect(t, "old event does not borrow replacement title", page.Items[1].PaymentTitle, "")
	expect(t, "old event does not link replacement", page.Items[1].OccurrenceID, int64(0))
	for _, action := range []string{"occurrence.unpaid", "receipt.add", "receipt.delete"} {
		var page struct{ Items []auditEntry }
		c.get("/api/v1/audit-log/page?action="+action).json(t, &page)
		expect(t, "original event retained", len(page.Items), 1)
		expect(t, "ambiguous context omitted: "+action, page.Items[0].PaymentTitle, "")
	}
	for _, title := range []string{"Старая аренда", "Другой сервер"} {
		var page struct{ Items []auditEntry }
		c.get("/api/v1/audit-log/page?action=recurring.create&search="+url.QueryEscape(title)).json(t, &page)
		expect(t, "payment-level history stays identifiable", len(page.Items), 1)
		expect(t, "payment-level title", page.Items[0].PaymentTitle, title)
	}
	expect(t, "journal intact after ID reuse", c.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}
