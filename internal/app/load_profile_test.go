package app

// Opt-in diagnostic workload, deliberately excluded from the ordinary test run.
// It uses its own temporary SQLite file, loopback HTTP server and fake transport.
// No .env is read, no production database is used, and no message leaves localhost.
//
// INVOICE_LOAD_SIZES=10000,50000 INVOICE_LOAD_OUTPUT="$PWD/output/load-profile.json" \
//   go test ./internal/app -run '^TestLoadProfile$' -count=1 -timeout=10m -v

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	invoicekeeper "invoice-keeper"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

type loadMetric struct {
	Operation      string  `json:"operation"`
	Requests       int     `json:"requests"`
	Concurrency    int     `json:"concurrency"`
	Errors         int     `json:"errors"`
	P50MS          float64 `json:"p50_ms"`
	P95MS          float64 `json:"p95_ms"`
	MaxMS          float64 `json:"max_ms"`
	WallMS         float64 `json:"wall_ms"`
	RequestsPerSec float64 `json:"requests_per_second"`
	ResponseBytes  int64   `json:"mean_response_bytes"`
}

type loadQueue struct {
	FakeDelayMS      int     `json:"fake_transport_delay_ms"`
	Passes           int     `json:"passes"`
	Sent             int64   `json:"sent"`
	Pending          int     `json:"remaining_pending"`
	WallMS           float64 `json:"wall_ms"`
	FirstDeliveryMS  float64 `json:"first_delivery_ms"`
	LastDeliveryMS   float64 `json:"last_delivery_ms"`
	MidSendWriteMS   float64 `json:"concurrent_api_write_ms"`
	MidSendWriteCode int     `json:"concurrent_api_write_status"`
}

type loadDataset struct {
	Schedules            int          `json:"schedules"`
	StoredOccurrences    int          `json:"stored_occurrences"`
	VisibleOccurrences   int          `json:"visible_occurrences"`
	InitialMaterializeMS float64      `json:"initial_materialize_ms"`
	Metrics              []loadMetric `json:"api"`
	WarmMaterialize      loadMetric   `json:"warm_materialize"`
	Queue                loadQueue    `json:"queue"`
	BaselineHeapMiB      float64      `json:"baseline_go_heap_mib"`
	SampledPeakHeapMiB   float64      `json:"sampled_peak_go_heap_mib"`
	GoAllocationsMiB     float64      `json:"total_allocated_during_profile_mib"`
}

type loadReport struct {
	StartedAt   string        `json:"started_at_utc"`
	Revision    string        `json:"git_revision"`
	DirtyFiles  string        `json:"git_worktree_status"`
	Go          string        `json:"go_version"`
	OS          string        `json:"os"`
	Arch        string        `json:"arch"`
	CPUs        int           `json:"logical_cpus"`
	GOMAXPROCS  int           `json:"gomaxprocs"`
	Description string        `json:"description"`
	Limitations []string      `json:"limitations"`
	Datasets    []loadDataset `json:"datasets"`
}

func TestLoadProfile(t *testing.T) {
	raw := os.Getenv("INVOICE_LOAD_SIZES")
	if raw == "" {
		t.Skip("opt-in: set INVOICE_LOAD_SIZES=10000,50000; never run against production")
	}
	report := loadReport{
		StartedAt: time.Now().UTC().Format(time.RFC3339), Revision: loadCommand("git", "rev-parse", "HEAD"), DirtyFiles: loadCommand("git", "status", "--porcelain"),
		Go: runtime.Version(), OS: runtime.GOOS, Arch: runtime.GOARCH, CPUs: runtime.NumCPU(), GOMAXPROCS: runtime.GOMAXPROCS(0),
		Description: "Isolated local diagnostic profile: monthly schedules starting August 2026, business day 2026-10-25; RUB/USD/EUR, five categories, paid history, 5% archived, 2% removed, 5% October pauses. HTTP contract validation and password hashing are excluded from measured request timings. No live external sends.",
		Limitations: []string{"Short finite samples, not a sustained capacity/SLA claim; p95 is nearest-rank on 12 requests.", "HTTP timings include loopback transport and JSON serialization, but no browser rendering or WAN latency.", "Memory is sampled Go heap for the test process (server and HTTP client together), not production RSS.", "Queue transport sleeps a controlled 20 ms per message; it does not model Telegram rate limits, SMTP or real network failures.", "Only two queue passes are measured; remaining backlog is reported, not extrapolated to a delivery-time promise."},
	}
	for _, part := range strings.Split(raw, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || n < 100 || n > 50000 {
			t.Fatalf("INVOICE_LOAD_SIZES must contain integers from 100 to 50000, got %q", part)
		}
		t.Run(strconv.Itoa(n), func(t *testing.T) { report.Datasets = append(report.Datasets, runLoadDataset(t, n)) })
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if output := os.Getenv("INVOICE_LOAD_OUTPUT"); output != "" {
		if err := os.MkdirAll(filepath.Dir(output), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(output, append(data, '\n'), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Log(string(data))
}

func runLoadDataset(t *testing.T, count int) loadDataset {
	t.Helper()
	today := func() time.Time { return schedule.Civil(2026, 10, 25) }
	settings := &config.Settings{DatabasePath: filepath.Join(t.TempDir(), "load.sqlite3"), AdminUsername: "admin", AdminPassword: testPassword, Timezone: "Europe/Moscow", RateLimitPerSecond: 10000, RateLimitBurst: 100000}
	if err := settings.Validate(); err != nil {
		t.Fatal(err)
	}
	db, err := store.OpenDB(settings.DatabasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s, err := NewServer(settings, db, invoicekeeper.Assets, Options{Today: today})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Worker.Wait()
	server := httptest.NewServer(s)
	defer server.Close()
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 90 * time.Second}
	loginBody, _ := json.Marshal(map[string]string{"username": "admin", "password": testPassword})
	request, _ := http.NewRequest("POST", server.URL+"/api/v1/auth/login", bytes.NewReader(loginBody))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", server.URL)
	login, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	var user struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.NewDecoder(login.Body).Decode(&user); err != nil || login.StatusCode != 200 {
		t.Fatalf("login status %d: %v", login.StatusCode, err)
	}
	login.Body.Close()
	call := func(method, path string, body []byte) (int, int64, error) {
		request, err := http.NewRequest(method, server.URL+path, bytes.NewReader(body))
		if err != nil {
			return 0, 0, err
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Origin", server.URL)
		request.Header.Set("X-CSRF-Token", user.CSRF)
		response, err := client.Do(request)
		if err != nil {
			return 0, 0, err
		}
		defer response.Body.Close()
		bytes, err := io.Copy(io.Discard, response.Body)
		return response.StatusCode, bytes, err
	}
	if err := db.Write(func(tx *sql.Tx) error {
		statement, err := tx.Prepare(`INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at,category)
			VALUES(?,?,?,'2026-08-28',28,?,?)`)
		if err != nil {
			return err
		}
		defer statement.Close()
		for i := range count {
			if _, err := statement.Exec(fmt.Sprintf("Load payment %06d", i+1), 10000+i%10000, currencies[i%len(currencies)], schedule.Timestamp(), fmt.Sprintf("Category %d", i%5+1)); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	result := loadDataset{Schedules: count}
	started := time.Now()
	if err := db.Write(func(tx *sql.Tx) error { return schedule.Materialize(tx, today()) }); err != nil {
		t.Fatal(err)
	}
	result.InitialMaterializeMS = loadMS(time.Since(started))
	if err := db.Write(func(tx *sql.Tx) error {
		for _, query := range []string{
			"UPDATE payment_occurrences SET paid_at=due_date WHERE due_date<'2026-10-01'",
			"UPDATE payment_occurrences SET paid_at='2026-10-25' WHERE due_date='2026-10-28' AND recurring_payment_id%4=0",
			"UPDATE recurring_payments SET active=0,deleted_at='2026-10-25T00:00:00Z' WHERE id%20=1",
			"UPDATE recurring_payments SET removed_at='2026-10-25T00:00:00Z' WHERE id%50=2",
			"INSERT INTO payment_pauses(recurring_payment_id,from_date,until_date,created_by,created_at) SELECT id,'2026-10-01','2026-10-31','load','2026-10-01T00:00:00Z' FROM recurring_payments WHERE id%20=3",
			"DELETE FROM payment_occurrences WHERE due_date='2026-10-28' AND paid_at IS NULL AND recurring_payment_id%20=3",
		} {
			if _, err := tx.Exec(query); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	db.QueryRow("SELECT COUNT(*) FROM payment_occurrences").Scan(&result.StoredOccurrences)
	db.QueryRow("SELECT COUNT(*) FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE r.removed_at IS NULL AND o.removed_at IS NULL").Scan(&result.VisibleOccurrences)
	runtime.GC()
	var startMemory runtime.MemStats
	runtime.ReadMemStats(&startMemory)
	var peak atomic.Uint64
	peak.Store(startMemory.HeapAlloc)
	stop, stopped := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(stopped)
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		for {
			var memory runtime.MemStats
			runtime.ReadMemStats(&memory)
			if current := peak.Load(); memory.HeapAlloc > current {
				peak.CompareAndSwap(current, memory.HeapAlloc)
			}
			select {
			case <-stop:
				return
			case <-ticker.C:
			}
		}
	}()
	defer func() { close(stop); <-stopped }()
	for _, endpoint := range []struct{ label, path string }{
		{"full occurrence list", "/api/v1/payment-occurrences"},
		{"month summary", "/api/v1/payments/summary?from_date=2026-10-01&to_date=2026-10-31"},
		{"year budget", "/api/v1/budget?year=2026"},
		{"occurrence page", "/api/v1/payment-occurrences/page?view=open&page_size=25"},
		{"occurrence deep page", fmt.Sprintf("/api/v1/payment-occurrences/page?view=open&page_size=25&page=%d", max(1, count/100))},
		{"recurring page", "/api/v1/recurring-payments/page?page_size=25"},
		{"overview", "/api/v1/payments/overview"},
		{"calendar month", "/api/v1/payments/calendar?month=2026-10"},
		{"calendar forecast", "/api/v1/payments/calendar?month=2027-01"},
		{"calendar day page", "/api/v1/payments/calendar/day?date=2026-10-28&page_size=25"},
		{"notification page", "/api/v1/notifications?limit=50"},
	} {
		metric := measureLoad(endpoint.label, 12, 3, func(int) (int64, error) {
			status, bytes, err := call("GET", endpoint.path, nil)
			if err == nil && status != 200 {
				err = fmt.Errorf("HTTP %d", status)
			}
			return bytes, err
		})
		result.Metrics = append(result.Metrics, metric)
		if metric.Errors > 0 {
			t.Errorf("%s: %d request errors", endpoint.label, metric.Errors)
		}
		s.Worker.Wait()
	}
	var periodID int64
	if err := db.QueryRow(`SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
		WHERE r.active=1 AND r.removed_at IS NULL AND o.due_date='2026-10-28' ORDER BY o.id LIMIT 1`).Scan(&periodID); err != nil {
		t.Fatal(err)
	}
	metric := measureLoad("mark paid API", 12, 3, func(int) (int64, error) {
		status, bytes, err := call("PATCH", "/api/v1/payment-occurrences/"+itoa(periodID), []byte(`{"paid":true}`))
		if err == nil && status != 200 {
			err = fmt.Errorf("HTTP %d", status)
		}
		return bytes, err
	})
	result.Metrics = append(result.Metrics, metric)
	if metric.Errors > 0 {
		t.Errorf("mark paid: %d request errors", metric.Errors)
	}
	s.Worker.Wait()
	result.WarmMaterialize = measureLoad("warm materialize", 6, 1, func(int) (int64, error) {
		return 0, db.Write(func(tx *sql.Tx) error { return schedule.Materialize(tx, today()) })
	})
	queueSettings := *settings
	queueSettings.TelegramEnabled, queueSettings.TelegramChatID, queueSettings.TelegramBotToken = true, "-10000000001", "test-never-used"
	var sent atomic.Int64
	var firstSent, lastSent atomic.Int64
	firstSending := make(chan struct{})
	queueStart := time.Now()
	fake := func(notify.ReminderRow) notify.SendResult {
		if sent.Load() == 0 {
			select {
			case <-firstSending:
			default:
				close(firstSending)
			}
		}
		time.Sleep(20 * time.Millisecond)
		elapsed := time.Since(queueStart).Nanoseconds()
		if sent.Add(1) == 1 {
			firstSent.Store(elapsed)
		}
		lastSent.Store(elapsed)
		return notify.SendResult{State: "sent", MessageID: "fake"}
	}
	worker := notify.NewReminderWorker(db, &queueSettings, fake, today)
	worker.Channels = map[string]notify.Sender{}
	finished := make(chan struct{})
	go func() { worker.Tick(); worker.Tick(); close(finished) }()
	select {
	case <-firstSending:
	case <-finished:
		t.Fatal("load dataset did not create an eligible reminder")
	case <-time.After(90 * time.Second):
		t.Fatal("fake queue did not start")
	}
	writeStart := time.Now()
	status, _, err := call("PATCH", "/api/v1/payment-occurrences/"+itoa(periodID), []byte(`{"paid":true}`))
	writeTime := time.Since(writeStart)
	if err != nil || status != 200 {
		t.Errorf("write during fake sends: status=%d error=%v", status, err)
	}
	<-finished
	s.Worker.Wait()
	result.Queue = loadQueue{FakeDelayMS: 20, Passes: 2, Sent: sent.Load(), WallMS: loadMS(time.Since(queueStart)), FirstDeliveryMS: loadMS(time.Duration(firstSent.Load())), LastDeliveryMS: loadMS(time.Duration(lastSent.Load())), MidSendWriteMS: loadMS(writeTime), MidSendWriteCode: status}
	db.QueryRow("SELECT COUNT(*) FROM reminders WHERE state='pending'").Scan(&result.Queue.Pending)
	var endMemory runtime.MemStats
	runtime.ReadMemStats(&endMemory)
	result.BaselineHeapMiB = float64(startMemory.HeapAlloc) / (1 << 20)
	result.SampledPeakHeapMiB = float64(peak.Load()) / (1 << 20)
	result.GoAllocationsMiB = float64(endMemory.TotalAlloc-startMemory.TotalAlloc) / (1 << 20)
	t.Logf("%d schedules / %d periods: list p95 %.1f ms, budget p95 %.1f ms, peak heap %.1f MiB, queue sent %d/pending %d", count, result.StoredOccurrences, result.Metrics[0].P95MS, result.Metrics[2].P95MS, result.SampledPeakHeapMiB, result.Queue.Sent, result.Queue.Pending)
	return result
}

func measureLoad(label string, count, concurrency int, fn func(int) (int64, error)) loadMetric {
	timings := make([]time.Duration, count)
	var failures atomic.Int64
	var responseBytes atomic.Int64
	jobs := make(chan int)
	var group sync.WaitGroup
	started := time.Now()
	for range concurrency {
		group.Go(func() {
			for index := range jobs {
				start := time.Now()
				bytes, err := fn(index)
				timings[index] = time.Since(start)
				responseBytes.Add(bytes)
				if err != nil {
					failures.Add(1)
				}
			}
		})
	}
	for index := range count {
		jobs <- index
	}
	close(jobs)
	group.Wait()
	elapsed := time.Since(started)
	sort.Slice(timings, func(i, j int) bool { return timings[i] < timings[j] })
	percentile := func(p float64) float64 { return loadMS(timings[max(0, int(math.Ceil(p*float64(count)))-1)]) }
	return loadMetric{Operation: label, Requests: count, Concurrency: concurrency, Errors: int(failures.Load()), P50MS: percentile(.5), P95MS: percentile(.95), MaxMS: loadMS(timings[count-1]), WallMS: loadMS(elapsed), RequestsPerSec: float64(count) / elapsed.Seconds(), ResponseBytes: responseBytes.Load() / int64(count)}
}

func loadMS(duration time.Duration) float64 { return float64(duration.Microseconds()) / 1000 }

func loadCommand(name string, args ...string) string {
	data, err := exec.Command(name, args...).Output()
	if err != nil {
		return "unavailable"
	}
	return strings.TrimSpace(string(data))
}
