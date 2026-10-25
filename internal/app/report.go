package app

import (
	"context"
	"errors"
	"sort"
	"time"

	"invoice-keeper/internal/app/report"
	"invoice-keeper/internal/app/schedule"
)

// MonthlyReport shares the annual budget's calculation. It is not a bank
// balance and never converts or combines different currencies.
func (b botBackend) MonthlyReport(ctx context.Context, month, currency string) (report.Data, error) {
	from, err := time.Parse("2006-01", month)
	if err != nil || from.Year() < 2000 || from.Year() > 2100 || (currency != "RUB" && currency != "USD" && currency != "EUR") {
		return report.Data{}, errors.New("invalid report period or currency")
	}
	revision := b.s.DB.ChangeRevision()
	data, err := b.s.readBudget(ctx, from, from.AddDate(0, 1, -1))
	if err != nil {
		return report.Data{}, err
	}
	result := report.Data{
		Month: month, Currency: currency, Today: schedule.FormatDate(b.s.Today()),
		GeneratedAt: b.s.Now().In(b.s.Settings.Location()).Truncate(time.Minute),
		Timezone:    b.s.Settings.Timezone, Revision: revision,
		Cacheable: revision == b.s.DB.ChangeRevision(),
	}
	if cell := data.total[currency]; cell != nil {
		result.Planned, result.Paid = cell.planned, cell.paid
	}
	for name, book := range data.byCategory {
		cell := book[currency]
		if cell == nil || cell.planned == 0 {
			continue
		}
		if name == "" {
			name = "Без категории"
		}
		result.Categories = append(result.Categories, report.Category{Name: name, Planned: cell.planned, Paid: cell.paid})
	}
	sort.Slice(result.Categories, func(i, j int) bool { return result.Categories[i].Name < result.Categories[j].Name })
	return result, nil
}
