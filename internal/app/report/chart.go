// Package report renders payment reports locally. It never sends financial data
// to a chart service and uses the bundled Go fonts for Cyrillic labels.
package report

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
	"golang.org/x/image/vector"
)

const Width, Height = 1080, 1560

type Category struct {
	Name          string
	Planned, Paid int64
}

type Data struct {
	Month, Currency, Today string
	Planned, Paid          int64
	Categories             []Category
	GeneratedAt            time.Time
	Timezone               string
	Revision               uint64
	Cacheable              bool
}

type fontSet struct{ regular, bold *opentype.Font }

var fonts = sync.OnceValues(func() (fontSet, error) {
	regular, err := opentype.Parse(goregular.TTF)
	if err != nil {
		return fontSet{}, err
	}
	bold, err := opentype.Parse(gobold.TTF)
	return fontSet{regular, bold}, err
})

// TopCategories groups everything beyond the first five into one exact total.
// Ordering is stable, so a refreshed report does not jump when totals tie.
func TopCategories(items []Category) []Category {
	items = append([]Category(nil), items...)
	sort.Slice(items, func(i, j int) bool {
		if items[i].Planned != items[j].Planned {
			return items[i].Planned > items[j].Planned
		}
		return items[i].Name < items[j].Name
	})
	if len(items) <= 5 {
		return items
	}
	other := Category{Name: fmt.Sprintf("Остальные категории (%d)", len(items)-5)}
	for _, c := range items[5:] {
		other.Planned += c.Planned
		other.Paid += c.Paid
	}
	return append(items[:5], other)
}

// Money keeps integer cents all the way to the label; chart geometry alone uses floats.
func Money(cents int64) string {
	whole := strconv.FormatInt(cents/100, 10)
	var groups []string
	for len(whole) > 3 {
		groups = append([]string{whole[len(whole)-3:]}, groups...)
		whole = whole[:len(whole)-3]
	}
	groups = append([]string{whole}, groups...)
	result := strings.Join(groups, " ")
	if cents%100 != 0 {
		result += fmt.Sprintf(",%02d", cents%100)
	}
	return result
}

var monthNames = []string{"Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"}

func MonthLabel(month string) string {
	d, err := time.Parse("2006-01", month)
	if err != nil {
		return month
	}
	return fmt.Sprintf("%s %d", monthNames[int(d.Month())-1], d.Year())
}

func clean(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return ' '
		}
		return r
	}, value)
}

// Render has fixed dimensions and a maximum of six rows. User labels are clipped
// by measured glyph width, so long names or large totals cannot grow the image.
func Render(data Data) ([]byte, error) {
	month, err := time.Parse("2006-01", data.Month)
	if err != nil || month.Year() < 2000 || month.Year() > 2100 || (data.Currency != "RUB" && data.Currency != "USD" && data.Currency != "EUR") {
		return nil, errors.New("invalid report period or currency")
	}
	if data.Planned < 0 || data.Paid < 0 || data.Paid > data.Planned {
		return nil, errors.New("invalid report totals")
	}
	var planned, paid int64
	for _, category := range data.Categories {
		if category.Planned < 0 || category.Paid < 0 || category.Paid > category.Planned || planned > math.MaxInt64-category.Planned || paid > math.MaxInt64-category.Paid {
			return nil, errors.New("invalid report category totals")
		}
		planned += category.Planned
		paid += category.Paid
	}
	if planned != data.Planned || paid != data.Paid {
		return nil, errors.New("report categories do not match totals")
	}
	parsedFonts, err := fonts()
	if err != nil {
		return nil, err
	}
	faces := map[string]font.Face{}
	defer func() {
		for _, face := range faces {
			face.Close()
		}
	}()
	face := func(size int, heavy bool) font.Face {
		key := fmt.Sprintf("%d-%t", size, heavy)
		if faces[key] == nil {
			f := parsedFonts.regular
			if heavy {
				f = parsedFonts.bold
			}
			faces[key], _ = opentype.NewFace(f, &opentype.FaceOptions{Size: float64(size), DPI: 72, Hinting: font.HintingFull})
		}
		return faces[key]
	}
	// Portrait layout keeps the figures readable in Telegram's phone preview.
	// One currency per image; the accent always means an explicitly paid amount.
	ink := color.RGBA{32, 34, 38, 255}
	muted := color.RGBA{76, 83, 91, 255}
	teal := color.RGBA{18, 122, 116, 255}
	track := color.RGBA{222, 234, 232, 255}
	line := color.RGBA{222, 225, 229, 255}
	img := image.NewRGBA(image.Rect(0, 0, Width, Height))
	draw.Draw(img, img.Bounds(), image.White, image.Point{}, draw.Src)
	rect := func(x, y, w, h int, c color.Color) {
		draw.Draw(img, image.Rect(x, y, x+w, y+h), &image.Uniform{c}, image.Point{}, draw.Src)
	}
	text := func(x, y int, value string, size int, heavy bool, c color.Color, maxWidth int) {
		value = clean(value)
		f := face(size, heavy)
		if maxWidth > 0 && font.MeasureString(f, value).Ceil() > maxWidth {
			runes := []rune(value)
			for len(runes) > 0 && font.MeasureString(f, string(runes)+"…").Ceil() > maxWidth {
				runes = runes[:len(runes)-1]
			}
			value = string(runes) + "…"
		}
		d := font.Drawer{Dst: img, Src: &image.Uniform{c}, Face: f, Dot: fixed.P(x, y)}
		d.DrawString(value)
	}
	fit := func(value string, size, minSize, width int) int {
		for size > minSize && font.MeasureString(face(size, true), value).Ceil() > width {
			size--
		}
		return size
	}
	right := func(x, y int, value string, size int, heavy bool, c color.Color) {
		text(x-font.MeasureString(face(size, heavy), value).Ceil(), y, value, size, heavy, c, 0)
	}
	center := func(x, y int, value string, size int, heavy bool, c color.Color) {
		text(x-font.MeasureString(face(size, heavy), value).Ceil()/2, y, value, size, heavy, c, 0)
	}

	text(56, 61, "invoicekeeper", 28, true, ink, 0)
	right(1024, 61, "Отчёт за месяц", 28, false, muted)
	text(56, 141, MonthLabel(data.Month), 54, true, ink, 790)
	roundedRect(img, 884, 94, 140, 60, 16, ink)
	center(954, 135, data.Currency, 32, true, color.White)
	rect(56, 181, 968, 2, line)

	text(56, 248, "План на месяц", 34, false, muted, 600)
	amount := Money(data.Planned)
	text(52, 333, amount, fit(amount, 74, 26, 610), true, ink, 610)
	text(56, 382, "По срокам платежей", 29, false, muted, 610)
	fraction := float64(0)
	if data.Planned > 0 {
		fraction = float64(data.Paid) / float64(data.Planned)
	}
	ring(img, 868, 316, 116, 94, 1, track)
	ring(img, 868, 316, 116, 94, fraction, teal)
	progress := "—"
	if data.Planned > 0 {
		percent := math.Round(fraction*1000) / 10
		if data.Paid < data.Planned && percent >= 100 {
			percent = 99.9
		}
		progress = strings.ReplaceAll(strconv.FormatFloat(percent, 'f', -1, 64), ".", ",") + "%"
	}
	center(868, 320, progress, fit(progress, 56, 40, 194), true, teal)
	center(868, 361, "оплачено", 27, false, muted)

	remaining := data.Planned - data.Paid
	text(56, 477, "Оплачено", 32, false, muted, 430)
	text(56, 539, Money(data.Paid), fit(Money(data.Paid), 52, 24, 438), true, teal, 438)
	rect(526, 451, 2, 98, line)
	text(570, 477, "Осталось оплатить", 32, false, muted, 454)
	text(570, 539, Money(remaining), fit(Money(remaining), 52, 24, 454), true, ink, 454)
	rect(56, 585, 968, 2, line)

	text(56, 651, "Расходы по категориям", 40, true, ink, 968)
	roundedRect(img, 56, 682, 22, 22, 6, teal)
	text(91, 704, "Оплачено", 28, false, muted, 350)
	roundedRect(img, 367, 682, 22, 22, 6, track)
	text(402, 704, "Осталось оплатить", 28, false, muted, 622)
	items := TopCategories(data.Categories)
	maxAmount := int64(0)
	for _, item := range items {
		maxAmount = max(maxAmount, item.Planned)
	}
	if len(items) == 0 || data.Planned == 0 {
		text(56, 898, "В этом месяце платежей нет", 42, true, ink, 968)
		text(56, 961, "Выберите другой месяц или валюту", 33, false, muted, 968)
		text(56, 1008, "кнопками под отчётом.", 33, false, muted, 968)
	} else {
		for i, item := range items {
			y := 776 + i*104
			amount := Money(item.Planned)
			amountSize := fit(amount, 36, 24, 420)
			amountWidth := font.MeasureString(face(amountSize, true), amount).Ceil()
			text(56, y, item.Name, 36, false, ink, min(590, 880-amountWidth-40))
			right(1024, y, amount, amountSize, true, ink)
			barWidth := int(math.Round(968 * float64(item.Planned) / float64(maxAmount)))
			paidWidth := int(math.Round(968 * float64(item.Paid) / float64(maxAmount)))
			roundedRect(img, 56, y+22, barWidth, 24, 12, track)
			roundedRect(img, 56, y+22, paidWidth, 24, 12, teal)
		}
	}
	rect(56, 1390, 968, 2, line)
	text(56, 1443, "План платежей, не баланс банковского счёта.", 28, false, muted, 968)
	stamp := data.GeneratedAt.Format("02.01.2006 · 15:04")
	text(56, 1490, stamp+" · "+data.Timezone, 27, false, muted, 968)
	var out bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// Rasterized paths provide smooth edges without a heavyweight rendering runtime.
func roundedRect(img *image.RGBA, x, y, w, h, radius int, c color.Color) {
	if w <= 0 || h <= 0 {
		return
	}
	r := float32(min(radius, w/2, h/2))
	left, top, right, bottom := float32(0), float32(0), float32(w), float32(h)
	path := vector.NewRasterizer(w, h)
	path.MoveTo(left+r, top)
	path.LineTo(right-r, top)
	path.QuadTo(right, top, right, top+r)
	path.LineTo(right, bottom-r)
	path.QuadTo(right, bottom, right-r, bottom)
	path.LineTo(left+r, bottom)
	path.QuadTo(left, bottom, left, bottom-r)
	path.LineTo(left, top+r)
	path.QuadTo(left, top, left+r, top)
	path.ClosePath()
	path.Draw(img, image.Rect(x, y, x+w, y+h), &image.Uniform{c}, image.Point{})
}

func ring(img *image.RGBA, cx, cy, outer, inner int, fraction float64, c color.Color) {
	if fraction <= 0 {
		return
	}
	fraction = min(1, fraction)
	steps := max(1, int(math.Ceil(360*fraction)))
	bounds := image.Rect(cx-outer, cy-outer, cx+outer+1, cy+outer+1)
	path := vector.NewRasterizer(bounds.Dx(), bounds.Dy())
	point := func(i, r int) (float32, float32) {
		angle := -math.Pi/2 + 2*math.Pi*fraction*float64(i)/float64(steps)
		return float32(float64(outer) + float64(r)*math.Cos(angle)), float32(float64(outer) + float64(r)*math.Sin(angle))
	}
	x, y := point(0, outer)
	path.MoveTo(x, y)
	for i := 1; i <= steps; i++ {
		x, y = point(i, outer)
		path.LineTo(x, y)
	}
	for i := steps; i >= 0; i-- {
		x, y = point(i, inner)
		path.LineTo(x, y)
	}
	path.ClosePath()
	path.Draw(img, bounds, &image.Uniform{c}, image.Point{})
}
