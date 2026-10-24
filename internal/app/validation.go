package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"invoice-keeper/internal/app/schedule"
)

// apiError is rendered as {"detail": ...}; Detail is a message or a list of field errors.
type apiError struct {
	Status int
	Detail any
	Code   string // machine-readable reason, e.g. two_factor_required
	Header http.Header
}

func (e *apiError) Error() string { return http.StatusText(e.Status) }

func fail(status int, message string) error { return &apiError{Status: status, Detail: message} }

type fieldError struct {
	Loc  []any  `json:"loc"`
	Msg  string `json:"msg"`
	Type string `json:"type"`
}

// form validates a JSON object strictly: unknown fields are rejected and values are never echoed back.
type form struct {
	values map[string]json.RawMessage
	errs   []fieldError
}

func readForm(r *http.Request, allowed ...string) (*form, error) {
	raw, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 64<<10))
	f := &form{}
	if err != nil || json.Unmarshal(raw, &f.values) != nil || f.values == nil {
		return nil, &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body"}, Msg: "Ожидается JSON-объект", Type: "json_invalid"}}}
	}
	for name := range f.values {
		if !slices.Contains(allowed, name) {
			f.add(name, "Лишнее поле", "extra_forbidden")
		}
	}
	return f, nil
}

func (f *form) add(name, msg, kind string) {
	loc := []any{"body"}
	if name != "" {
		loc = append(loc, name)
	}
	f.errs = append(f.errs, fieldError{Loc: loc, Msg: msg, Type: kind})
}

func (f *form) err() error {
	if len(f.errs) == 0 {
		return nil
	}
	return &apiError{Status: 422, Detail: f.errs}
}

func (f *form) has(name string) bool { _, ok := f.values[name]; return ok }

func (f *form) isNull(name string) bool {
	raw, ok := f.values[name]
	return ok && bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

func (f *form) require(names ...string) {
	for _, name := range names {
		if !f.has(name) {
			f.add(name, "Обязательное поле", "missing")
		}
	}
}

type textRule struct {
	trim     bool
	min, max int
	pattern  *regexp.Regexp
}

// text returns nil when the field is absent, null or invalid (the latter records an error).
func (f *form) text(name string, rule textRule) *string {
	if !f.has(name) || f.isNull(name) {
		return nil
	}
	var value string
	if json.Unmarshal(f.values[name], &value) != nil {
		f.add(name, "Ожидается строка", "string_type")
		return nil
	}
	if rule.trim {
		value = strings.TrimSpace(value)
	}
	n := utf8.RuneCountInString(value)
	switch {
	case n < rule.min:
		f.add(name, "Минимальная длина — "+strconv.Itoa(rule.min), "string_too_short")
	case n > rule.max:
		f.add(name, "Максимальная длина — "+strconv.Itoa(rule.max), "string_too_long")
	case rule.pattern != nil && !rule.pattern.MatchString(value):
		f.add(name, "Допустимы латинские буквы, цифры, точка, дефис и подчёркивание", "string_pattern_mismatch")
	default:
		return &value
	}
	return nil
}

func (f *form) boolean(name string) *bool {
	if !f.has(name) || f.isNull(name) {
		return nil
	}
	var value bool
	if json.Unmarshal(f.values[name], &value) != nil {
		f.add(name, "Ожидается true или false", "bool_type")
		return nil
	}
	return &value
}

// integer returns nil when absent or null; a non-integer records an error.
func (f *form) integer(name string) *int64 {
	if !f.has(name) || f.isNull(name) {
		return nil
	}
	var value int64
	if json.Unmarshal(f.values[name], &value) != nil {
		f.add(name, "Ожидается целое число", "int_type")
		return nil
	}
	return &value
}

func (f *form) date(name string) *time.Time {
	value := f.text(name, textRule{max: 10})
	if value == nil {
		return nil
	}
	parsed, err := schedule.ParseDate(*value)
	if err != nil {
		f.add(name, "Ожидается существующая дата YYYY-MM-DD", "date_from_datetime_parsing")
		return nil
	}
	return &parsed
}

var amountPattern = regexp.MustCompile(`^(\d{1,10})(?:\.(\d{1,2}))?$`)

// amount accepts a decimal string or JSON number: positive, at most 12 digits, 2 of them after the point.
func (f *form) amount(name string) int64 {
	raw, ok := f.values[name]
	if !ok || f.isNull(name) {
		return 0
	}
	var text string
	if json.Unmarshal(raw, &text) != nil {
		var number json.Number
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.UseNumber()
		if decoder.Decode(&number) != nil {
			f.add(name, "Ожидается десятичное число", "decimal_type")
			return 0
		}
		text = number.String()
	}
	cents, ok := parseCents(text)
	switch {
	case !ok:
		f.add(name, "Сумма — положительное число, не более 10 цифр до точки и 2 после", "decimal_parsing")
	case cents == 0:
		f.add(name, "Сумма должна быть больше нуля", "greater_than")
	default:
		return cents
	}
	return 0
}

// parseCents reads "1490", "1490.5", "1490.50" into cents.
func parseCents(text string) (int64, bool) {
	match := amountPattern.FindStringSubmatch(strings.TrimSpace(text))
	if match == nil {
		return 0, false
	}
	whole, _ := strconv.ParseInt(match[1], 10, 64)
	cents, _ := strconv.ParseInt((match[2] + "00")[:2], 10, 64)
	return whole*100 + cents, true
}

// query parameters

type queryParams struct {
	values url.Values
	errs   []fieldError
}

func (q *queryParams) add(name, msg, kind string) {
	q.errs = append(q.errs, fieldError{Loc: []any{"query", name}, Msg: msg, Type: kind})
}

func (q *queryParams) err() error {
	if len(q.errs) == 0 {
		return nil
	}
	return &apiError{Status: 422, Detail: q.errs}
}

func (q *queryParams) date(name string) *time.Time {
	value := q.values.Get(name)
	if value == "" {
		return nil
	}
	parsed, err := schedule.ParseDate(value)
	if err != nil {
		q.add(name, "Ожидается дата YYYY-MM-DD", "date_parsing")
		return nil
	}
	return &parsed
}

func (q *queryParams) choice(name string, options ...string) string {
	value := q.values.Get(name)
	if value != "" && !slices.Contains(options, value) {
		q.add(name, "Допустимые значения: "+strings.Join(options, ", "), "literal_error")
		return ""
	}
	return value
}

func (q *queryParams) boolean(name string, fallback bool) bool {
	value := strings.ToLower(q.values.Get(name))
	switch value {
	case "":
		return fallback
	case "1", "true", "yes", "on", "t", "y":
		return true
	case "0", "false", "no", "off", "f", "n":
		return false
	}
	q.add(name, "Ожидается true или false", "bool_parsing")
	return fallback
}

func pathID(r *http.Request, name string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil {
		return 0, &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"path", name}, Msg: "Ожидается целое число", Type: "int_parsing"}}}
	}
	return id, nil
}
