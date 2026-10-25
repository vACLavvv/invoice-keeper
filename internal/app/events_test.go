package app

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

type streamFrame struct{ event, id, data string }

func openEventStream(t *testing.T, c *client, lastID string) (<-chan streamFrame, func()) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	request, _ := http.NewRequestWithContext(ctx, "GET", c.e.http.URL+"/api/v1/events", nil)
	request.Header.Set("Origin", c.e.http.URL)
	if lastID != "" {
		request.Header.Set("Last-Event-ID", lastID)
	}
	response, err := c.http.Do(request)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	if response.StatusCode != 200 {
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		cancel()
		t.Fatalf("event stream: %d %s", response.StatusCode, body)
	}
	if !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") || response.Header.Get("X-Accel-Buffering") != "no" {
		response.Body.Close()
		cancel()
		t.Fatal("missing stream headers")
	}
	frames := make(chan streamFrame, 32)
	go func() {
		defer close(frames)
		defer response.Body.Close()
		scanner := bufio.NewScanner(response.Body)
		frame := streamFrame{}
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				if frame.event != "" {
					select {
					case frames <- frame:
					case <-ctx.Done():
						return
					}
				}
				frame = streamFrame{}
			} else if value, ok := strings.CutPrefix(line, "event: "); ok {
				frame.event = value
			} else if value, ok := strings.CutPrefix(line, "id: "); ok {
				frame.id = value
			} else if value, ok := strings.CutPrefix(line, "data: "); ok {
				frame.data = value
			}
		}
	}()
	return frames, func() { cancel(); response.Body.Close() }
}

func nextEvent(t *testing.T, frames <-chan streamFrame, kind string) streamFrame {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for {
		select {
		case frame, ok := <-frames:
			if !ok {
				t.Fatal("stream closed before " + kind)
			}
			if frame.event == kind {
				return frame
			}
		case <-deadline.C:
			t.Fatal("timed out waiting for " + kind)
		}
	}
}

func TestEventsCookieAuthorizationAndLimits(t *testing.T) {
	e := setup(t)
	admin := e.client()
	expect(t, "anonymous", admin.get("/api/v1/events").status, 401)
	admin.signIn()
	reader := e.keyClient(admin.createToken("read", 30))
	expect(t, "API token", reader.get("/api/v1/events").status, 403)
	expect(t, "URL token rejected", admin.get("/api/v1/events?token=secret").status, 422)
	expect(t, "foreign origin", admin.do("GET", "/api/v1/events", nil, "Origin", "https://foreign.example").status, 403)
	expect(t, "cross-site request", admin.do("GET", "/api/v1/events", nil, "Sec-Fetch-Site", "cross-site").status, 403)
	for range eventSessionLimit {
		frames, closeStream := openEventStream(t, admin, "")
		defer closeStream()
		nextEvent(t, frames, "ready")
	}
	expect(t, "per-session cap", admin.get("/api/v1/events").status, 429)
	expect(t, "active gauge", e.server.events.active(), eventSessionLimit)
	var slots []func()
	streams := newEventStreams()
	for i := range eventGlobalLimit {
		release, ok := streams.reserve(fmt.Sprint(i))
		if !ok {
			t.Fatal("early global cap")
		}
		slots = append(slots, release)
	}
	if _, ok := streams.reserve("overflow"); ok {
		t.Fatal("global cap ignored")
	}
	slots[0]()
	slots[0]()
	release, ok := streams.reserve("replacement")
	if !ok {
		t.Fatal("slot not released")
	}
	release()
	for _, release := range slots {
		release()
	}
	if streams.active() != 0 {
		t.Fatal("leaked stream reservations")
	}
}

func TestEventsRefreshForAPIAndTelegramPayments(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	periods := admin.get("/api/v1/payment-occurrences").list(t)
	e.server.Worker.Wait()
	frames, closeStream := openEventStream(t, admin, "")
	defer closeStream()
	ready := nextEvent(t, frames, "ready")
	before := e.db.ChangeRevision()
	admin.get("/api/v1/payment-occurrences")
	admin.get("/api/v1/payments/summary")
	admin.get("/api/v1/notifications")
	expect(t, "read/materialization does not loop", e.db.ChangeRevision(), before)
	path := "/api/v1/payment-occurrences/" + id(periods[0])
	expect(t, "pay through API", admin.patch(path, map[string]any{"paid": true}).status, 200)
	changed := nextEvent(t, frames, "changed")
	if changed.id == ready.id || strings.Contains(changed.data, "title") || strings.Contains(changed.data, "amount") {
		t.Fatal("invalid invalidation payload")
	}
	expect(t, "event sees committed data", admin.get(path).object(t)["status"], any("paid"))
	id2, _ := strconv.ParseInt(id(periods[1]), 10, 64)
	already, err := e.server.BotBackend().MarkPaid(id2, "telegram:test")
	if err != nil || already {
		t.Fatalf("bot payment: %v, %v", already, err)
	}
	nextEvent(t, frames, "changed")
	e.server.Worker.Wait()
	expect(t, "bot paid visible", admin.get("/api/v1/payment-occurrences/" + id(periods[1])).object(t)["status"], any("paid"))
	before = e.db.ChangeRevision()
	already, err = e.server.BotBackend().MarkPaid(id2, "telegram:test")
	if err != nil || !already {
		t.Fatalf("idempotent bot payment: %v, %v", already, err)
	}
	expect(t, "idempotent click no new revision", e.db.ChangeRevision(), before)
}

func TestEventsRevocationReconnectAndShutdown(t *testing.T) {
	e := setup(t)
	e.server.events.heartbeat = 10 * time.Millisecond
	admin := e.client()
	admin.signIn()
	frames, closeStream := openEventStream(t, admin, "stale-process:999")
	ready := nextEvent(t, frames, "ready")
	if ready.id == "stale-process:999" {
		t.Fatal("reconnect must synchronize current process")
	}
	closeStream()
	admin.createPayment(nil)
	e.server.Worker.Wait()
	frames, closeStream = openEventStream(t, admin, ready.id)
	defer closeStream()
	newReady := nextEvent(t, frames, "ready")
	if newReady.id == ready.id {
		t.Fatal("missed changes not reflected on reconnect")
	}
	// Logout is intentionally a direct SQL write; heartbeat must still revoke
	// the old connection even when no business event happens afterwards.
	expect(t, "logout", admin.post("/api/v1/auth/logout", nil).status, 204)
	ended := nextEvent(t, frames, "session-ended")
	if ended.data != "{}" {
		t.Fatal("revoked stream contains data")
	}
	admin.signIn()
	frames, closeAgain := openEventStream(t, admin, "")
	defer closeAgain()
	nextEvent(t, frames, "ready")
	e.http.Config.RegisterOnShutdown(e.server.CloseEvents)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := e.http.Config.Shutdown(ctx); err != nil {
		t.Fatalf("SSE delayed shutdown: %v", err)
	}
	expect(t, "shutdown releases streams", e.server.events.active(), 0)
}

func TestEventsOverrideOrdinaryWriteTimeout(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	e.http.Close()
	e.http = httptest.NewUnstartedServer(validateContract(t, e.server))
	e.http.Config.WriteTimeout = 20 * time.Millisecond
	e.server.events.heartbeat = 10 * time.Millisecond
	e.http.Start()
	frames, closeStream := openEventStream(t, admin, "")
	defer closeStream()
	nextEvent(t, frames, "ready")
	time.Sleep(80 * time.Millisecond) // exceed ordinary timeout, with idle heartbeat traffic
	// Only the stream's deadline is under test. An unrelated HTTP mutation
	// under a 20 ms deadline can expire on a busy race-test runner.
	if err := e.db.Write(func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT INTO app_state(key,value) VALUES('sse-deadline-test','one')")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	nextEvent(t, frames, "changed")
}

func TestEventsPassiveSessionAndExpiry(t *testing.T) {
	e := setup(t)
	e.server.events.heartbeat = 10 * time.Millisecond
	admin := e.client()
	admin.signIn()
	if _, err := e.db.Exec("UPDATE sessions SET last_seen_at=1"); err != nil {
		t.Fatal(err)
	}
	frames, closeStream := openEventStream(t, admin, "")
	defer closeStream()
	nextEvent(t, frames, "ready")
	if err := e.db.Write(func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT INTO app_state(key,value) VALUES('sse-passive-test','one')")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	nextEvent(t, frames, "changed")
	var lastSeen int64
	if err := e.db.QueryRow("SELECT last_seen_at FROM sessions").Scan(&lastSeen); err != nil {
		t.Fatal(err)
	}
	expect(t, "passive authentication never touches activity", lastSeen, int64(1))
	if _, err := e.db.Exec("UPDATE sessions SET expires_at=1"); err != nil {
		t.Fatal(err)
	}
	nextEvent(t, frames, "session-ended")
}
