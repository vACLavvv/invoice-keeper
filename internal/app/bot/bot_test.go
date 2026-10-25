package bot

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/report"
	"invoice-keeper/internal/app/store"
)

type stubBackend struct{}

func (stubBackend) PaymentPage(bool, int) (PaymentPage, error) { return PaymentPage{Pages: 1}, nil }
func (stubBackend) MonthlyReport(context.Context, string, string) (report.Data, error) {
	return report.Data{}, nil
}

func (stubBackend) Today() time.Time                                 { return time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC) }
func (stubBackend) TodoText(bool) (string, error)                    { return "", nil }
func (stubBackend) MarkPaid(int64, string) (bool, error)             { return false, ErrNotFound }
func (stubBackend) LinkTelegram(string, User, int64) (string, error) { return "", &UserError{"нет"} }
func (stubBackend) IsLinkedChat(int64) bool                          { return false }
func (stubBackend) PanelName(int64) (string, bool)                   { return "", false }
func (stubBackend) SetBotUsername(string)                            {}

// blockingAPI answers every method at once except the long poll, which hangs until the request is cancelled.
func blockingAPI(t *testing.T, longPoll string) *httptest.Server {
	released := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, longPoll) {
			select {
			case <-r.Context().Done():
			case <-released: // a failed test must not hang in Close
			}
			return
		}
		w.Write([]byte(`{"ok":true,"result":{"username":"test_bot"}}`))
	}))
	t.Cleanup(func() {
		close(released)
		server.Close()
	})
	return server
}

func testDB(t *testing.T) *store.DB {
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "bot.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func stopsQuickly(t *testing.T, name string, run func(context.Context)) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		run(ctx)
		close(done)
	}()
	time.Sleep(200 * time.Millisecond) // the long poll is in flight
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("%s did not stop: the long poll was not aborted", name)
	}
}

func TestTelegramStopsDuringLongPoll(t *testing.T) {
	api := blockingAPI(t, "/getUpdates")
	settings := &config.Settings{TelegramBotToken: "t"}
	stopsQuickly(t, "Telegram bot", NewTelegram(settings, testDB(t), stubBackend{}, api.URL).Run)
}

func TestMaxStopsDuringLongPoll(t *testing.T) {
	api := blockingAPI(t, "/updates")
	settings := &config.Settings{MaxBotToken: "t", MaxChatID: "-1", MaxAPIURL: api.URL}
	stopsQuickly(t, "MAX bot", NewMax(settings, testDB(t), stubBackend{}, nil).Run)
}

func TestBotsWithoutTokenReturnAtOnce(t *testing.T) {
	stopsQuickly(t, "Telegram bot without a token", NewTelegram(&config.Settings{}, testDB(t), stubBackend{}, "").Run)
	stopsQuickly(t, "MAX bot without a token", NewMax(&config.Settings{}, testDB(t), stubBackend{}, nil).Run)
}
