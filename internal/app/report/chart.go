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
)

const Width, Height = 1200, 1120

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
	bg := color.RGBA{245, 246, 248, 255}
	ink := color.RGBA{32, 35, 40, 255}
	muted := color.RGBA{76, 85, 98, 255}
	teal := color.RGBA{18, 122, 126, 255}
	track := color.RGBA{220, 229, 232, 255}
	img := image.NewRGBA(image.Rect(0, 0, Width, Height))
	draw.Draw(img, img.Bounds(), &image.Uniform{bg}, image.Point{}, draw.Src)
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

	text(48, 56, "invoicekeeper", 25, true, ink, 0)
	right(1152, 56, "ОТЧЁТ ПО ПЛАТЕЖАМ", 18, false, muted)
	text(48, 131, MonthLabel(data.Month), 48, true, ink, 900)
	rect(1030, 94, 122, 48, ink)
	text(1063, 127, data.Currency, 25, true, color.White, 0)

	remaining := data.Planned - data.Paid
	labels := []string{"План на месяц", "Отмечено как оплаченное", "Осталось оплатить"}
	values := []int64{data.Planned, data.Paid, remaining}
	for i := range values {
		x := 48 + i*376
		rect(x, 178, 352, 154, color.White)
		labelSize := 23
		if i == 1 {
			labelSize = 21
		}
		text(x+24, 220, labels[i], labelSize, false, muted, 304)
		amount := Money(values[i])
		size := fit(amount, 40, 18, 304)
		c := ink
		if i == 1 {
			c = teal
		}
		text(x+24, 285, amount, size, true, c, 304)
	}
	percent := 0
	if data.Planned > 0 {
		percent = int(math.Round(100 * float64(data.Paid) / float64(data.Planned)))
	}
	text(48, 385, "Выполнено по отметкам команды", 24, false, muted, 0)
	right(1152, 385, fmt.Sprintf("%d%%", percent), 28, true, teal)
	rect(48, 405, 1104, 16, track)
	if data.Planned > 0 {
		rect(48, 405, int(math.Round(1104*float64(data.Paid)/float64(data.Planned))), 16, teal)
	}

	text(48, 488, "План по категориям", 30, true, ink, 0)
	rect(755, 468, 14, 14, teal)
	text(778, 483, "Оплачено", 20, false, muted, 0)
	rect(917, 468, 14, 14, track)
	text(940, 483, "Осталось оплатить", 20, false, muted, 212)
	items := TopCategories(data.Categories)
	maxAmount := int64(0)
	for _, item := range items {
		maxAmount = max(maxAmount, item.Planned)
	}
	if len(items) == 0 || data.Planned == 0 {
		rect(48, 522, 1104, 436, color.White)
		text(91, 694, "В этом месяце платежей нет", 36, true, ink, 1000)
		text(91, 742, "Выберите другой месяц или валюту кнопками под отчётом.", 24, false, muted, 1000)
	} else {
		for i, item := range items {
			y := 548 + i*76
			amount := Money(item.Planned)
			amountSize := fit(amount, 24, 18, 430)
			amountWidth := font.MeasureString(face(amountSize, true), amount).Ceil()
			text(48, y, item.Name, 25, false, ink, min(740, 1080-amountWidth-30))
			right(1152, y, amount, amountSize, true, ink)
			bar := int(math.Round(1104 * float64(item.Planned) / float64(maxAmount)))
			paid := int(math.Round(1104 * float64(min(item.Paid, item.Planned)) / float64(maxAmount)))
			rect(48, y+15, bar, 14, track)
			rect(48, y+15, paid, 14, teal)
		}
	}
	rect(48, 1000, 1104, 1, track)
	text(48, 1041, "По срокам платежей. Отметки команды, без проверки банковского счёта.", 21, false, muted, 1104)
	stamp := data.GeneratedAt.Format("02.01.2006 · 15:04")
	text(48, 1080, "Сформировано "+stamp+" · "+data.Timezone, 20, false, muted, 1104)
	var out bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
