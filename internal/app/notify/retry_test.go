package notify

import (
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"invoice-keeper/internal/app/config"
)

func TestRetryPolicyGrowsAndHonorsRemoteMinimum(t *testing.T) {
	for attempt := 1; attempt <= 5; attempt++ {
		base := 60 << (attempt - 1)
		for range 100 {
			delay := RetryDelay(attempt, 0)
			if delay < base || delay > base+base/4 {
				t.Fatalf("attempt %d delay %d", attempt, delay)
			}
			if RetryDelay(attempt, 7200) < 7200 {
				t.Fatal("server minimum shortened")
			}
		}
	}
	for range 100 {
		if RetryDelay(1000000, 0) > 3600 {
			t.Fatal("unbounded local backoff")
		}
	}
	if retryDeadline(math.MaxInt) == -1 || retryDeadline(math.MaxInt) < 0 {
		t.Fatal("overflowed retry deadline")
	}
}

func TestTelegramOnlyConfirmedRejectionsAreRetried(t *testing.T) {
	for _, sample := range []struct {
		code       int
		body, want string
	}{
		{500, `{"ok":false,"error_code":500}`, "pending"},
		{503, `<html>gateway error</html>`, "uncertain"},
		{500, `{}`, "uncertain"},
		{400, `{"ok":false,"error_code":400}`, "failed"},
		{403, `{"ok":false,"error_code":403}`, "failed"},
		{429, `{"ok":false,"parameters":{"retry_after":600}}`, "pending"},
	} {
		t.Run(fmt.Sprint(sample.code, sample.body), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(sample.code); fmt.Fprint(w, sample.body) }))
			defer server.Close()
			result := TelegramSender(&config.Settings{TelegramChatID: "1", TelegramBotToken: "redacted"}, server.URL)(ReminderRow{})
			expect(t, "state", result.State, sample.want)
			if sample.code == 429 && result.RetryDelay != 600 {
				t.Fatal("Retry-After lost")
			}
		})
	}
}
