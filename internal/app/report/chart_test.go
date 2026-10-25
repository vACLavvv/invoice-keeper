package report

import (
	"bytes"
	"image/png"
	"math"
	"strings"
	"testing"
	"time"

	"golang.org/x/image/font/opentype"
)

func example() Data {
	return Data{Month: "2026-10", Currency: "RUB", Planned: 25255050, Paid: 18930000,
		Categories:  []Category{{"Офис", 12500000, 12500000}, {"Серверы", 4875000, 4250000}, {"Подписки", 3250050, 1130000}, {"Маркетинг", 2500000, 1000000}, {"Связь", 880000, 50000}, {"Обучение", 750000, 0}, {"Транспорт", 500000, 0}},
		GeneratedAt: time.Date(2026, 10, 25, 14, 42, 0, 0, time.FixedZone("MSK", 10800)), Timezone: "Europe/Moscow"}
}

func TestRenderBoundedAndEmpty(t *testing.T) {
	large := example()
	large.Planned, large.Paid = math.MaxInt64, math.MaxInt64-99
	large.Categories = []Category{{strings.Repeat("Очень длинное название ", 12), large.Planned, large.Paid}}
	empty := example()
	empty.Currency, empty.Planned, empty.Paid, empty.Categories = "EUR", 0, 0, nil
	unpaid := example()
	unpaid.Paid = 0
	for i := range unpaid.Categories {
		unpaid.Categories[i].Paid = 0
	}
	paid := example()
	paid.Paid = paid.Planned
	for i := range paid.Categories {
		paid.Categories[i].Paid = paid.Categories[i].Planned
	}
	for _, data := range []Data{example(), large, empty, unpaid, paid} {
		raw, err := Render(data)
		if err != nil {
			t.Fatal(err)
		}
		if len(raw) > 2<<20 {
			t.Fatalf("image too large: %d", len(raw))
		}
		img, err := png.Decode(bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		if img.Bounds().Dx() != Width || img.Bounds().Dy() != Height {
			t.Fatal(img.Bounds())
		}
	}
	fonts, err := fonts()
	if err != nil {
		t.Fatal(err)
	}
	face, err := opentype.NewFace(fonts.regular, &opentype.FaceOptions{Size: 24, DPI: 72})
	if err != nil {
		t.Fatal(err)
	}
	defer face.Close()
	for _, r := range "ПланОплаченоОсталосьё…" {
		if _, ok := face.GlyphAdvance(r); !ok {
			t.Errorf("missing glyph: %c", r)
		}
	}
}

func TestTopCategoriesPreservesExactTotals(t *testing.T) {
	data := example()
	before := append([]Category(nil), data.Categories...)
	items := TopCategories(data.Categories)
	if len(items) != 6 || items[5].Name != "Остальные категории (2)" || items[5].Planned != 1250000 {
		t.Fatalf("grouped: %+v", items)
	}
	var planned, paid int64
	for _, item := range items {
		planned += item.Planned
		paid += item.Paid
	}
	if planned != data.Planned || paid != data.Paid {
		t.Fatal("grouping lost money")
	}
	for i := range before {
		if before[i] != data.Categories[i] {
			t.Fatal("input mutated")
		}
	}
	if got := Money(math.MaxInt64); got != "92 233 720 368 547 758,07" {
		t.Fatal(got)
	}
	if got := Money(101); got != "1,01" {
		t.Fatal(got)
	}
}

func TestRenderRejectsInvalidData(t *testing.T) {
	for name, mutate := range map[string]func(*Data){
		"month":            func(d *Data) { d.Month = "2026-13" },
		"currency":         func(d *Data) { d.Currency = "BTC" },
		"negative":         func(d *Data) { d.Paid = -1 },
		"overpaid":         func(d *Data) { d.Paid = d.Planned + 1 },
		"missing category": func(d *Data) { d.Categories = nil },
		"overflow":         func(d *Data) { d.Categories = []Category{{"A", math.MaxInt64, 0}, {"B", 1, 0}} },
	} {
		t.Run(name, func(t *testing.T) {
			data := example()
			mutate(&data)
			if _, err := Render(data); err == nil {
				t.Fatal("accepted invalid report")
			}
		})
	}
}

func BenchmarkRenderMonthlyReport(b *testing.B) {
	data := example()
	b.ReportAllocs()
	for b.Loop() {
		if _, err := Render(data); err != nil {
			b.Fatal(err)
		}
	}
}
