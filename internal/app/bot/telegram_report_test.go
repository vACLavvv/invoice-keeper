package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/report"
)

type reportBackend struct {
	stubBackend
	calls        int
	linked       bool
	beforeReturn func()
	paid         int64
}

func (b *reportBackend) IsLinkedChat(id int64) bool { return id == 42 && b.linked }
func (b *reportBackend) MonthlyReport(_ context.Context, month, currency string) (report.Data, error) {
	b.calls++
	if b.beforeReturn != nil {
		b.beforeReturn()
	}
	return report.Data{Month: month, Currency: currency, Today: "2026-01-28", Planned: 10001, Paid: b.paid,
		Categories: []report.Category{{Name: "Офис", Planned: 10001, Paid: b.paid}}, GeneratedAt: time.Date(2026, 1, 28, 12, 0, 0, 0, time.UTC), Timezone: "Europe/Moscow", Cacheable: true}, nil
}

type reportRequest struct {
	method  string
	fields  map[string]string
	image   []byte
	payload map[string]any
}
type reportAPI struct {
	mu              sync.Mutex
	requests        []reportRequest
	server          *httptest.Server
	editNotModified bool
}

func newReportAPI(t *testing.T, notModified bool) *reportAPI {
	t.Helper()
	a := &reportAPI{editNotModified: notModified}
	a.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		request := reportRequest{method: method, fields: map[string]string{}}
		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(3 << 20); err != nil {
				t.Error(err)
				w.WriteHeader(400)
				return
			}
			defer r.MultipartForm.RemoveAll()
			for k, values := range r.MultipartForm.Value {
				request.fields[k] = values[0]
			}
			file, header, err := r.FormFile("report")
			if err != nil {
				t.Error(err)
				w.WriteHeader(400)
				return
			}
			defer file.Close()
			if header.Filename != "report.png" {
				t.Error(header.Filename)
			}
			request.image, _ = io.ReadAll(file)
			if _, err := png.Decode(bytes.NewReader(request.image)); err != nil {
				t.Error(err)
			}
		} else if err := json.NewDecoder(r.Body).Decode(&request.payload); err != nil {
			t.Error(err)
		}
		a.mu.Lock()
		a.requests = append(a.requests, request)
		a.mu.Unlock()
		if method == "editMessageMedia" && a.editNotModified {
			w.WriteHeader(400)
			fmt.Fprint(w, `{"ok":false,"description":"Bad Request: message is not modified"}`)
			return
		}
		fmt.Fprint(w, `{"ok":true,"result":{"message_id":77}}`)
	}))
	t.Cleanup(a.server.Close)
	return a
}
func (a *reportAPI) snapshot() []reportRequest {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]reportRequest(nil), a.requests...)
}
func reportMessage(chat int64, text string) *Message {
	m := &Message{MessageID: 77, Text: text}
	m.Chat.ID = chat
	return m
}
func reportBot(t *testing.T, a *reportAPI, backend *reportBackend) *Telegram {
	return NewTelegram(&config.Settings{TelegramBotToken: "test-secret-token", TelegramChatID: "-100", PublicBaseURL: "https://keeper.example"}, testDB(t), backend, a.server.URL)
}

func TestReportSendsPhotoAndEditsSameMessage(t *testing.T) {
	a := newReportAPI(t, false)
	backend := &reportBackend{}
	b := reportBot(t, a, backend)
	if err := b.onMessage(reportMessage(-100, "/report 2026-12 usd")); err != nil {
		t.Fatal(err)
	}
	requests := a.snapshot()
	if len(requests) != 1 || requests[0].method != "sendPhoto" {
		t.Fatalf("requests: %+v", requests)
	}
	first := requests[0]
	if first.fields["chat_id"] != "-100" || first.fields["photo"] != "attach://report" || !strings.Contains(first.fields["caption"], "Декабрь 2026 · USD") {
		t.Fatal(first.fields)
	}
	if !strings.Contains(first.fields["reply_markup"], "report:2027-01:USD") || !strings.Contains(first.fields["reply_markup"], "/calendar?month=2026-12") {
		t.Fatal(first.fields["reply_markup"])
	}
	backend.paid = 5000
	if err := b.onCallback(&Callback{ID: "change", Message: reportMessage(-100, ""), Data: "report:2026-12:EUR"}); err != nil {
		t.Fatal(err)
	}
	requests = a.snapshot()
	if len(requests) != 3 || requests[1].method != "answerCallbackQuery" || requests[2].method != "editMessageMedia" {
		t.Fatalf("methods: %+v", requests)
	}
	if requests[2].fields["message_id"] != "77" || requests[2].fields["chat_id"] != "-100" {
		t.Fatal(requests[2].fields)
	}
	var media map[string]string
	if err := json.Unmarshal([]byte(requests[2].fields["media"]), &media); err != nil {
		t.Fatal(err)
	}
	if media["type"] != "photo" || media["media"] != "attach://report" || !strings.Contains(media["caption"], "Отмечено как оплаченное: 50") || !strings.Contains(media["caption"], "EUR") {
		t.Fatal(media)
	}
	if backend.calls != 2 || bytes.Equal(first.image, requests[2].image) {
		t.Fatal("refresh did not read current data")
	}
}

func TestReportPermissionsAndValidation(t *testing.T) {
	a := newReportAPI(t, false)
	backend := &reportBackend{}
	b := reportBot(t, a, backend)
	for _, chat := range []int64{999, -200} {
		if err := b.onMessage(reportMessage(chat, "/report")); err != nil {
			t.Fatal(err)
		}
		if err := b.onCallback(&Callback{ID: "no-access", Message: reportMessage(chat, ""), Data: "report:2026-01:RUB"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := b.onCallback(&Callback{ID: "inline", Data: "report:2026-01:RUB"}); err != nil {
		t.Fatal(err)
	}
	for _, data := range []string{"report:2026-13:RUB", "report:1999-01:RUB", "report:2101-01:RUB", "report:2026-01:BTC", "report:2026-01:RUB:extra", "report:x"} {
		if err := b.onCallback(&Callback{ID: "invalid", Message: reportMessage(-100, ""), Data: data}); err != nil {
			t.Fatal(err)
		}
	}
	if err := b.onMessage(reportMessage(-100, "/report 2026-01 RUB extra")); err != nil {
		t.Fatal(err)
	}
	if backend.calls != 0 {
		t.Fatal("unauthorized or malformed request reached budget backend")
	}
	for _, request := range a.snapshot() {
		if len(request.image) != 0 {
			t.Fatal("image leaked")
		}
	}
	backend.linked = true
	if err := b.onMessage(reportMessage(42, "/report")); err != nil {
		t.Fatal(err)
	}
	if backend.calls != 1 {
		t.Fatal("linked private chat denied")
	}
	before := len(a.snapshot())
	backend.beforeReturn = func() { backend.linked = false }
	if err := b.onCallback(&Callback{ID: "unlink", Message: reportMessage(42, ""), Data: "report:2026-01:RUB"}); err != nil {
		t.Fatal(err)
	}
	if len(a.snapshot()) != before+1 {
		t.Fatal("photo sent after unlink")
	}
}

func TestReportMenuBoundaryAndUnchangedRefresh(t *testing.T) {
	a := newReportAPI(t, true)
	b := reportBot(t, a, &reportBackend{})
	for _, month := range []string{"2000-01", "2100-12"} {
		buttons, _ := json.Marshal(b.reportButtons(month, "RUB"))
		if strings.Contains(string(buttons), "1999-") || strings.Contains(string(buttons), "2101-") {
			t.Fatal(string(buttons))
		}
	}
	if err := b.onCallback(&Callback{ID: "same", Message: reportMessage(-100, ""), Data: "report:2026-01:RUB"}); err != nil {
		t.Fatal(err)
	}
	if len(a.snapshot()) != 2 {
		t.Fatal("not modified should be harmless")
	}
	if err := b.onCallback(&Callback{ID: "back", Message: reportMessage(-100, ""), Data: "report:menu"}); err != nil {
		t.Fatal(err)
	}
	requests := a.snapshot()
	if requests[len(requests)-1].method != "sendMessage" {
		t.Fatal("photo menu must open a text message")
	}
	if err := b.onCallback(&Callback{ID: "open", Message: reportMessage(-100, ""), Data: "nav:report"}); err != nil {
		t.Fatal(err)
	}
	requests = a.snapshot()
	if requests[len(requests)-1].method != "sendPhoto" {
		t.Fatal("main menu did not open report")
	}
}

func TestReportUploadDoesNotLeakTokenOrRetry(t *testing.T) {
	for _, status := range []int{400, 429, 500} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var calls int
			api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.WriteHeader(status)
				fmt.Fprint(w, `{"ok":false,"description":"test-secret-token secret server internals"}`)
			}))
			defer api.Close()
			b := NewTelegram(&config.Settings{TelegramBotToken: "test-secret-token"}, nil, &stubBackend{}, api.URL)
			err := b.uploadReport(context.Background(), "sendPhoto", map[string]string{}, []byte("png"))
			if err == nil || strings.Contains(err.Error(), "test-secret") || strings.Contains(err.Error(), "internals") || calls != 1 {
				t.Fatalf("err=%v calls=%d", err, calls)
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	b := NewTelegram(&config.Settings{TelegramBotToken: "test-secret-token"}, nil, &stubBackend{}, "https://invalid.example")
	if err := b.uploadReport(ctx, "sendPhoto", nil, nil); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal(err)
	}
}

func TestReportImageCacheRefreshAndBound(t *testing.T) {
	backend := &reportBackend{}
	data, _ := backend.MonthlyReport(context.Background(), "2026-01", "RUB")
	var cache reportImages
	first, err := cache.image(context.Background(), data)
	if err != nil {
		t.Fatal(err)
	}
	second, err := cache.image(context.Background(), data)
	if err != nil {
		t.Fatal(err)
	}
	if &first[0] != &second[0] || len(cache.items) != 1 {
		t.Fatal("unchanged image was not cached")
	}
	data.Paid = 5000
	data.Categories[0].Paid = 5000 // direct write: revision can remain unchanged
	changed, err := cache.image(context.Background(), data)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(first, changed) {
		t.Fatal("content hash failed to invalidate paid data")
	}
	for i := 0; i < reportCacheEntries+1; i++ {
		data.Revision++
		if _, err := cache.image(context.Background(), data); err != nil {
			t.Fatal(err)
		}
	}
	if len(cache.items) > reportCacheEntries {
		t.Fatal("unbounded cache")
	}
	data.Cacheable = false
	before := len(cache.items)
	if _, err := cache.image(context.Background(), data); err != nil {
		t.Fatal(err)
	}
	if len(cache.items) != before {
		t.Fatal("cached snapshot that crossed a commit")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := cache.image(ctx, data); err == nil {
		t.Fatal("ignored cancellation")
	}
}
