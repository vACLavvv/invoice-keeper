package app

import (
	"database/sql"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"testing"
	"unicode/utf16"

	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/schedule"
)

func TestMessengerLargeListKeepsExactTotalsAndBoundedPages(t *testing.T) {
	e := setup(t)
	e.settings.PublicBaseURL = "https://keeper.example"
	backend := e.server.BotBackend()
	var expected []bot.PaymentItem
	totals := map[string]int64{}
	overdueTotals := map[string]int64{}
	var overdue []bot.PaymentItem
	dates := []string{"2026-02-15", "2026-01-20", "2026-01-28", "2026-02-04", "2026-02-05"}
	err := e.db.Write(func(tx *sql.Tx) error {
		for i := 1; i <= 1000; i++ {
			title := fmt.Sprintf("Платёж %04d", i)
			if i == 1 {
				title = strings.Repeat("😀", 160) + "\nПодробности"
			}
			cents := int64(100 + i%37)
			currency, date := currencies[i%3], dates[i%len(dates)]
			if _, err := tx.Exec("INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,frequency,next_index,created_at) VALUES(?,?,?,?,?,1,'once',1,?)", i, title, cents, currency, date, schedule.Timestamp()); err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,?,?)", i, i, date, cents, currency); err != nil {
				return err
			}
			if i%11 == 0 || i%13 == 0 || i%17 == 0 || i%19 == 0 || date > "2026-02-04" {
				continue
			}
			item := bot.PaymentItem{ID: int64(i), Title: title, Amount: schedule.Money(cents), Currency: currency, DueDate: date, Status: "unpaid"}
			if date < "2026-01-28" {
				item.Status = "overdue"
				overdue = append(overdue, item)
				overdueTotals[currency] += cents
			}
			expected = append(expected, item)
			totals[currency] += cents
		}
		for _, query := range []string{
			"UPDATE payment_occurrences SET paid_at='2026-01-27' WHERE recurring_payment_id%11=0",
			"UPDATE recurring_payments SET active=0 WHERE id%13=0",
			"UPDATE recurring_payments SET removed_at='2026-01-27T00:00:00Z' WHERE id%17=0",
			"UPDATE payment_occurrences SET removed_at='2026-01-27T00:00:00Z' WHERE recurring_payment_id%19=0",
		} {
			if _, err := tx.Exec(query); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Slice(expected, func(i, j int) bool {
		if expected[i].DueDate != expected[j].DueDate {
			return expected[i].DueDate < expected[j].DueDate
		}
		return expected[i].ID < expected[j].ID
	})
	totalText := func(amounts map[string]int64) string {
		return fmt.Sprintf("%d.%02d RUB · %d.%02d USD · %d.%02d EUR", amounts["RUB"]/100, amounts["RUB"]%100, amounts["USD"]/100, amounts["USD"]%100, amounts["EUR"]/100, amounts["EUR"]%100)
	}
	for _, onlyOverdue := range []bool{false, true} {
		items, sums := expected, totals
		if onlyOverdue {
			items, sums = overdue, overdueTotals
		}
		pages := len(items)
		var got []bot.PaymentItem
		for p := 0; p < pages; p++ {
			page, err := backend.PaymentPage(onlyOverdue, p)
			if err != nil {
				t.Fatal(err)
			}
			expect(t, "total includes hidden pages", page.Total, len(items))
			expect(t, "total amounts", page.Totals, totalText(sums))
			expect(t, "page", page.Page, p)
			expect(t, "pages", page.Pages, pages)
			if len(page.Items) != 1 {
				t.Fatal("unbounded bot page")
			}
			got = append(got, page.Items...)
		}
		if !reflect.DeepEqual(got, items) {
			t.Fatal("page traversal lost order, visibility, amount or date")
		}
		last, err := backend.PaymentPage(onlyOverdue, 1_000_000)
		if err != nil {
			t.Fatal(err)
		}
		expect(t, "page beyond end clamps", last.Page, pages-1)
		if !reflect.DeepEqual(last.Items, items[pages-1:]) {
			t.Fatal("last page differs")
		}
		first, err := backend.PaymentPage(onlyOverdue, -1)
		if err != nil {
			t.Fatal(err)
		}
		expect(t, "negative page clamps", first.Page, 0)
		text, err := backend.TodoText(onlyOverdue)
		if err != nil {
			t.Fatal(err)
		}
		expect(t, "plain preview bound", strings.Count(text, "• "), 10)
		for _, want := range []string{totalText(sums), fmt.Sprintf("Показано 10 из %d", len(items)), "https://keeper.example/payments", "…"} {
			if !strings.Contains(text, want) {
				t.Fatalf("preview missing %q", want)
			}
		}
		if len(utf16.Encode([]rune(text))) > 4096 {
			t.Fatal("plain preview exceeds messenger limit")
		}
	}
	paid := expected[0]
	already, err := backend.MarkPaid(paid.ID, "telegram-test")
	if err != nil || already {
		t.Fatalf("mark visible payment: already=%v err=%v", already, err)
	}
	e.server.Worker.Wait()
	page, err := backend.PaymentPage(false, 0)
	if err != nil {
		t.Fatal(err)
	}
	totals[paid.Currency] -= int64(100 + paid.ID%37)
	expect(t, "paid removed from count", page.Total, len(expected)-1)
	expect(t, "paid removed from exact sums", page.Totals, totalText(totals))
}

func TestMessengerEmptyPagesAndPreview(t *testing.T) {
	e := setup(t)
	for _, onlyOverdue := range []bool{false, true} {
		for _, requestedPage := range []int{-1, 0, 1000000} {
			page, err := e.server.BotBackend().PaymentPage(onlyOverdue, requestedPage)
			if err != nil {
				t.Fatal(err)
			}
			expect(t, "empty total", page.Total, 0)
			expect(t, "empty pages", page.Pages, 1)
			expect(t, "empty page", page.Page, 0)
			expect(t, "empty items", len(page.Items), 0)
			expect(t, "empty sums", page.Totals, "")
		}
		text, err := e.server.todoText(onlyOverdue)
		if err != nil || !strings.Contains(text, "нет ✅") {
			t.Fatalf("empty preview: %q, %v", text, err)
		}
	}
}
