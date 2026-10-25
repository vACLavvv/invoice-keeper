package app

// CSV: export of periods with the list filters (opens in Excel as is: «;», decimal comma, BOM),
// and import of recurring payments with a dry run that shows every row's errors and warnings.

import (
	"bytes"
	"database/sql"
	"encoding/csv"
	"io"
	"mime"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

var statusLabels = map[string]string{"paid": "Оплачено", "unpaid": "К оплате", "overdue": "Просрочено"}
var frequencyLabels = map[string]string{"monthly": "Ежемесячно", "quarterly": "Ежеквартально", "yearly": "Ежегодно", "once": "Разово"}

// cell neutralises spreadsheet formulas: a value starting with = + - @ is read as text.
func cell(value string) string {
	if value != "" && strings.ContainsRune("=+-@\t\r", rune(value[0])) {
		return "'" + value
	}
	return value
}

func excelMoney(amount string) string { return strings.Replace(amount, ".", ",", 1) }

func writeCSV(w http.ResponseWriter, filename string, rows [][]string) error {
	var buffer bytes.Buffer
	buffer.WriteString("\uFEFF") // Excel detects UTF-8 by the BOM
	writer := csv.NewWriter(&buffer)
	writer.Comma = ';'
	writer.UseCRLF = true
	if err := writer.WriteAll(rows); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	_, err := w.Write(buffer.Bytes())
	return err
}

func (s *Server) occurrencesExport(w http.ResponseWriter, r *http.Request) error {
	user, err := s.currentUser(r)
	if err != nil {
		return err
	}
	filter, err := occurrenceQuery(r, user)
	if err != nil {
		return err
	}
	if err := s.ensureMaterialized(); err != nil {
		return err
	}
	return s.spoolOccurrenceResponse(w, r, "text/csv; charset=utf-8", "invoice-keeper-"+schedule.FormatDate(s.Today())+".csv", func(out io.Writer) error {
		if _, err := io.WriteString(out, "\uFEFF"); err != nil {
			return err
		}
		writer := csv.NewWriter(out)
		writer.Comma = ';'
		writer.UseCRLF = true
		if err := writer.Write([]string{"Название", "Категория", "Ответственный", "Сумма", "Валюта", "Срок", "Статус", "Дата оплаты", "Просрочка, дн.", "Периодичность"}); err != nil {
			return err
		}
		err := s.readSnapshot(r.Context(), func(q store.Querier) error {
			return s.eachOccurrence(q, filter, func(o Occurrence) error {
				if err := r.Context().Err(); err != nil {
					return err
				}
				category, assignee, paid := "", "", ""
				if o.Category != nil {
					category = *o.Category
				}
				if o.Assignee != nil {
					assignee = o.Assignee.DisplayName
				}
				if o.PaidAt != nil {
					paid = schedule.FullDate(*o.PaidAt)
				}
				return writer.Write([]string{cell(o.Title), cell(category), cell(assignee), excelMoney(o.Amount), o.Currency, schedule.FullDate(o.DueDate), statusLabels[o.Status], paid, itoa(int64(o.DaysOverdue)), frequencyLabels[o.Frequency]})
			})
		})
		if err != nil {
			return err
		}
		writer.Flush()
		return writer.Error()
	})
}

func (s *Server) importTemplate(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	return writeCSV(w, "invoice-keeper-import.csv", [][]string{
		{"Название", "Сумма", "Валюта", "Первая оплата", "Периодичность", "Категория"},
		{"Аренда офиса", "45000,00", "RUB", "31.01.2027", "ежемесячно", "Аренда"},
		{"Облачный сервер", "24", "USD", "15.02.2027", "ежемесячно", "IT"},
		{"Домен", "1490", "RUB", "03.03.2027", "ежегодно", "IT"},
	})
}

var importHeaders = map[string][]string{
	"title":          {"название", "наименование", "платёж", "платеж", "title", "name"},
	"amount":         {"сумма", "стоимость", "amount", "price"},
	"currency":       {"валюта", "currency"},
	"first_due_date": {"первая оплата", "дата первой оплаты", "дата", "срок", "first_due_date", "date", "due_date"},
	"frequency":      {"периодичность", "период", "frequency", "period"},
	"category":       {"категория", "category"},
}

func importColumn(header string) string {
	header = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(header, "\uFEFF")))
	for field, names := range importHeaders {
		if slices.Contains(names, header) {
			return field
		}
	}
	return ""
}

func importCurrency(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "rub", "₽", "руб", "руб.", "р.", "рубль", "рубли":
		return "RUB"
	case "usd", "$", "доллар", "доллары":
		return "USD"
	case "eur", "€", "евро":
		return "EUR"
	}
	return ""
}

func importFrequency(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "monthly", "ежемесячно", "месяц", "каждый месяц":
		return "monthly"
	case "quarterly", "ежеквартально", "квартал":
		return "quarterly"
	case "yearly", "annually", "ежегодно", "год", "каждый год":
		return "yearly"
	case "once", "one-time", "разово", "разовый", "один раз", "однократно":
		return "once"
	}
	return ""
}

func importDate(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{"02.01.2006", "2.1.2006", schedule.DateLayout} {
		if d, err := time.Parse(layout, value); err == nil {
			return d, !d.Before(schedule.Civil(2000, 1, 1)) && !d.After(schedule.Civil(2100, 12, 31))
		}
	}
	return time.Time{}, false
}

type importRow struct {
	Line         int      `json:"line"`
	Title        string   `json:"title"`
	Amount       string   `json:"amount"`
	Currency     string   `json:"currency"`
	FirstDueDate string   `json:"first_due_date"`
	Frequency    string   `json:"frequency"`
	Category     string   `json:"category"`
	Errors       []string `json:"errors"`
	Warnings     []string `json:"warnings"`

	input recurringInput
}

// decodeCSV accepts UTF-8 (with or without BOM) and Windows-1251, separated by ; , or tab.
func decodeCSV(raw []byte) ([][]string, error) {
	raw = bytes.TrimPrefix(raw, []byte("\uFEFF"))
	if !utf8.Valid(raw) {
		decoded, err := charmap.Windows1251.NewDecoder().Bytes(raw)
		if err != nil {
			return nil, err
		}
		raw = decoded
	}
	firstLine, _, _ := bytes.Cut(raw, []byte("\n"))
	delimiter := ';'
	best := bytes.Count(firstLine, []byte(";"))
	for _, candidate := range []rune{',', '\t'} {
		if n := bytes.Count(firstLine, []byte(string(candidate))); n > best {
			delimiter, best = candidate, n
		}
	}
	reader := csv.NewReader(bytes.NewReader(raw))
	reader.Comma = delimiter
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	return reader.ReadAll()
}

func (s *Server) recurringImport(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.adminWrite(r)
	if err != nil {
		return err
	}
	dryRun := r.URL.Query().Get("dry_run") != "false"
	var raw []byte
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
		if err := r.ParseMultipartForm(1 << 20); err != nil { // #nosec G120 -- the body is limited by MaxBytesReader above
			return fail(422, "Файл больше 1 МБ или повреждён")
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			return fail(422, "Прикрепите CSV-файл")
		}
		defer file.Close()
		raw, err = io.ReadAll(io.LimitReader(file, 1<<20+1))
		if err != nil {
			return err
		}
	} else {
		raw, err = io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20+1))
		if err != nil {
			return fail(422, "Файл больше 1 МБ")
		}
	}
	if len(raw) > 1<<20 {
		return fail(422, "Файл больше 1 МБ")
	}
	records, err := decodeCSV(raw)
	if err != nil || len(records) < 2 {
		return fail(422, "Не удалось прочитать CSV: нужна строка заголовков и хотя бы одна строка данных")
	}
	if len(records) > 501 {
		return fail(422, "За один раз можно загрузить до 500 строк")
	}
	columns := map[string]int{}
	for i, header := range records[0] {
		if field := importColumn(header); field != "" {
			if _, seen := columns[field]; !seen {
				columns[field] = i
			}
		}
	}
	var missing []string
	for _, field := range []string{"title", "amount", "currency", "first_due_date"} {
		if _, ok := columns[field]; !ok {
			missing = append(missing, importHeaders[field][0])
		}
	}
	if len(missing) > 0 {
		return fail(422, "Нет столбцов: "+strings.Join(missing, ", ")+". Скачайте шаблон")
	}

	existing := map[string]bool{}
	// SQLite lower() knows only ASCII, so Cyrillic titles are lowercased in Go.
	titles, err := s.DB.Query("SELECT title FROM recurring_payments WHERE active=1 AND removed_at IS NULL")
	if err != nil {
		return err
	}
	for titles.Next() {
		var t string
		titles.Scan(&t)
		existing[strings.ToLower(t)] = true
	}
	titles.Close()

	rows := []importRow{}
	inFile := map[string]int{}
	errorsCount := 0
	for n, record := range records[1:] {
		value := func(field string) string {
			if i, ok := columns[field]; ok && i < len(record) {
				return strings.TrimSpace(record[i])
			}
			return ""
		}
		if strings.Join(record, "") == "" {
			continue
		}
		row := importRow{Line: n + 2, Title: value("title"), Category: value("category"), Errors: []string{}, Warnings: []string{}}
		switch length := utf8.RuneCountInString(row.Title); {
		case length == 0:
			row.Errors = append(row.Errors, "Пустое название")
		case length > 120:
			row.Errors = append(row.Errors, "Название длиннее 120 символов")
		}
		amountText := strings.NewReplacer(" ", "", " ", "", " ", "", ",", ".").Replace(value("amount"))
		cents, ok := parseCents(amountText)
		if !ok || cents == 0 {
			row.Errors = append(row.Errors, "Сумма должна быть положительным числом, до 2 знаков после запятой")
		} else {
			row.Amount = schedule.Money(cents)
		}
		if row.Currency = importCurrency(value("currency")); row.Currency == "" {
			row.Errors = append(row.Errors, "Валюта: RUB, USD или EUR")
		}
		due, ok := importDate(value("first_due_date"))
		if ok {
			row.FirstDueDate = schedule.FormatDate(due)
		} else {
			row.Errors = append(row.Errors, "Дата: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД, с 2000 по 2100 год")
		}
		if row.Frequency = importFrequency(value("frequency")); row.Frequency == "" {
			row.Errors = append(row.Errors, "Периодичность: ежемесячно, ежеквартально или ежегодно")
		}
		if utf8.RuneCountInString(row.Category) > 40 {
			row.Errors = append(row.Errors, "Категория длиннее 40 символов")
		}
		key := strings.ToLower(row.Title)
		if existing[key] {
			row.Warnings = append(row.Warnings, "Платёж с таким названием уже есть")
		}
		if first, dup := inFile[key]; dup && key != "" {
			row.Warnings = append(row.Warnings, "Повторяет строку "+itoa(int64(first)))
		} else {
			inFile[key] = row.Line
		}
		if len(row.Errors) > 0 {
			errorsCount++
		}
		category := row.Category
		row.input = recurringInput{title: row.Title, cents: cents, currency: row.Currency, due: due, frequency: row.Frequency, category: &category}
		rows = append(rows, row)
	}
	result := map[string]any{"dry_run": dryRun, "rows": rows, "errors": errorsCount, "created": 0}
	if dryRun {
		return writeJSON(w, 200, result)
	}
	if errorsCount > 0 {
		return &apiError{Status: 422, Detail: "Исправьте ошибки в файле: ничего не импортировано"}
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		for _, row := range rows {
			if _, err := s.createRecurring(tx, admin.Username, row.input); err != nil {
				return err
			}
		}
		return audit.Record(tx, admin.Username, "recurring.import", itoa(int64(len(rows))))
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	result["created"] = len(rows)
	return writeJSON(w, 201, result)
}
