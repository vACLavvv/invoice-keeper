package app

// Metrics use a separate scrape credential: it grants no access to the business API.
// Labels have fixed cardinality. No user, payment, address, path or token is exported.
import (
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
)

var metricBuckets = [...]float64{.01, .05, .1, .25, .5, 1, 5, 15}

type serviceMetrics struct {
	mu       sync.Mutex
	requests [6]uint64
	buckets  [8]uint64
	count    uint64
	seconds  float64
}

func (m *serviceMetrics) observe(status int, elapsed time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.requests[min(5, max(1, status/100))]++
	m.count++
	m.seconds += elapsed.Seconds()
	for i, upper := range metricBuckets {
		if elapsed.Seconds() <= upper {
			m.buckets[i]++
		}
	}
}

var serviceStarted = time.Now()

func (s *Server) prometheusMetrics(w http.ResponseWriter, r *http.Request) error {
	if s.Settings.MetricsToken == "" {
		return fail(404, "Не найдено")
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	got, want := sha256.Sum256([]byte(token)), sha256.Sum256([]byte(s.Settings.MetricsToken))
	if !ok || subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
		return fail(401, "Требуется ключ мониторинга")
	}
	// Finish database reads before writing a 200: a broken scrape must not look healthy.
	rows, err := s.DB.QueryContext(r.Context(), `SELECT 'telegram',state,count(*) FROM reminders GROUP BY state
 UNION ALL SELECT CASE WHEN channel LIKE 'email:%' THEN 'email' WHEN channel LIKE 'telegram:%' THEN 'telegram' ELSE channel END,state,count(*) FROM deliveries GROUP BY 1,2
 UNION ALL SELECT 'telegram_personal',state,count(*) FROM personal_reminders GROUP BY state
 UNION ALL SELECT 'email_verification',welcome_state,count(*) FROM email_contacts GROUP BY welcome_state`)
	if err != nil {
		return err
	}
	counts := map[string]map[string]int64{}
	for rows.Next() {
		var channel, state string
		var count int64
		if err = rows.Scan(&channel, &state, &count); err != nil {
			rows.Close()
			return err
		}
		switch channel {
		case "telegram", "telegram_personal", "email", "email_verification", "max", "webhook":
		default:
			channel = "other"
		}
		switch state {
		case "pending", "sending", "sent", "uncertain", "failed", "cancelled", "verified", "expired":
		default:
			state = "other"
		}
		if counts[channel] == nil {
			counts[channel] = map[string]int64{}
		}
		counts[channel][state] += count
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	var body strings.Builder
	metric := func(name, help, kind string, value any) {
		fmt.Fprintf(&body, "# HELP %s %s\n# TYPE %s %s\n%s %v\n", name, help, name, kind, name, value)
	}
	metric("keeper_uptime_seconds", "Seconds since this process started.", "gauge", time.Since(serviceStarted).Seconds())
	metric("keeper_database_up", "Database query completed successfully.", "gauge", 1)
	metric("keeper_sse_connections", "Currently open authenticated event streams.", "gauge", s.events.active())
	last, errors := s.Worker.Health()
	metric("keeper_scheduler_last_success_timestamp_seconds", "Last completed reminder pass (0 before first pass).", "gauge", last)
	metric("keeper_scheduler_errors_total", "Failed reminder passes.", "counter", errors)
	metric("keeper_scheduler_interval_seconds", "Configured reminder check interval.", "gauge", s.Settings.ReminderInterval)
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	metric("keeper_go_heap_bytes", "Allocated Go heap bytes.", "gauge", mem.HeapAlloc)
	metric("keeper_go_goroutines", "Current Go goroutines.", "gauge", runtime.NumGoroutine())
	if info, err := os.Stat(s.Settings.DatabasePath); err == nil {
		metric("keeper_database_file_bytes", "SQLite main database size, excluding WAL.", "gauge", info.Size())
	}
	fmt.Fprintln(&body, "# HELP keeper_deliveries Notification records by transport and state.\n# TYPE keeper_deliveries gauge")
	for _, ch := range []string{"telegram", "telegram_personal", "email", "email_verification", "max", "webhook", "other"} {
		for _, st := range []string{"pending", "sending", "sent", "uncertain", "failed", "cancelled", "verified", "expired", "other"} {
			fmt.Fprintf(&body, "keeper_deliveries{channel=%q,state=%q} %d\n", ch, st, counts[ch][st])
		}
	}
	s.metrics.mu.Lock()
	defer s.metrics.mu.Unlock()
	fmt.Fprintln(&body, "# HELP keeper_http_requests_total Requests excluding health, metrics and event streams.\n# TYPE keeper_http_requests_total counter")
	for i := 1; i <= 5; i++ {
		fmt.Fprintf(&body, "keeper_http_requests_total{status_class=%q} %d\n", fmt.Sprintf("%dxx", i), s.metrics.requests[i])
	}
	fmt.Fprintln(&body, "# HELP keeper_http_request_duration_seconds Request duration excluding probes and event streams.\n# TYPE keeper_http_request_duration_seconds histogram")
	for i, upper := range metricBuckets {
		fmt.Fprintf(&body, "keeper_http_request_duration_seconds_bucket{le=%q} %d\n", fmt.Sprint(upper), s.metrics.buckets[i])
	}
	fmt.Fprintf(&body, "keeper_http_request_duration_seconds_bucket{le=\"+Inf\"} %d\nkeeper_http_request_duration_seconds_count %d\nkeeper_http_request_duration_seconds_sum %g\n", s.metrics.count, s.metrics.count, s.metrics.seconds)
	_, err = w.Write([]byte(body.String()))
	return err
}
