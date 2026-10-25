package notify

import (
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/webhooks"
)

type webhookHarness struct {
	db     *store.DB
	worker *ReminderWorker
}

func newWebhookHarness(t *testing.T) *webhookHarness {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "test.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	w := NewReminderWorker(db, &config.Settings{ReminderInterval: 60}, func(ReminderRow) SendResult { return SendResult{State: "sent"} }, func() time.Time { return schedule.Civil(2026, 1, 28) })
	h := &webhookHarness{db, w}
	t.Cleanup(func() { w.Wait(); db.Close() })
	return h
}

func (h *webhookHarness) endpoint(t *testing.T, url string, due, overdue bool) int64 {
	t.Helper()
	key, err := webhooks.URLKey(url)
	if err != nil {
		t.Fatal(err)
	}
	result, err := h.db.Exec(`INSERT INTO webhook_endpoints(name,url,secret,url_key,enabled,notify_due,notify_overdue,allow_private,created_at,updated_at)
		VALUES('Test',?,?,?,1,?,?,1,'now','now')`, security.EncryptText("webhook_endpoints.url", url), security.EncryptText("webhook_endpoints.secret", "endpoint-secret"), key, due, overdue)
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func (h *webhookHarness) period(t *testing.T, date string) int64 {
	t.Helper()
	var id int64
	err := h.db.Write(func(tx *sql.Tx) error {
		result, err := tx.Exec(`INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,frequency,next_index,created_at)
			VALUES('Test',100,'RUB',?,28,'once',1,'now')`, date)
		if err != nil {
			return err
		}
		id, err = result.LastInsertId()
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,100,'RUB')", id, id, date)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func (h *webhookHarness) enqueue(t *testing.T) {
	t.Helper()
	if err := h.db.Write(func(tx *sql.Tx) error {
		if err := h.worker.enqueueDeliveries(tx, h.worker.Today()); err != nil {
			return err
		}
		return h.worker.applyTransportBackoff(tx)
	}); err != nil {
		t.Fatal(err)
	}
}

func TestWebhookDestinationsIndependentFailureAndOverduePreferences(t *testing.T) {
	h := newWebhookHarness(t)
	var failedCalls, healthyCalls atomic.Int32
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { failedCalls.Add(1); w.WriteHeader(429) }))
	defer bad.Close()
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { healthyCalls.Add(1); w.WriteHeader(204) }))
	defer good.Close()
	badID := h.endpoint(t, bad.URL, true, true)
	goodID := h.endpoint(t, good.URL, true, true)
	h.period(t, "2026-01-28")
	h.period(t, "2026-01-31")
	h.period(t, "2026-01-27")
	h.worker.Settings.WebhookURL = bad.URL // old environment must not create another transport
	h.worker.Settings.OverdueReminders = false
	if DefaultChannels(h.worker.Settings)["webhook"] != nil {
		t.Fatal("legacy environment still subscribes a transport")
	}
	h.worker.Tick()
	expect(t, "one failure pauses only that endpoint", failedCalls.Load(), int32(1))
	expect(t, "other endpoint receives due and overdue despite global flag", healthyCalls.Load(), int32(3))
	var pending, healthy, backedOff int
	h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE channel=? AND state='pending'", webhooks.Channel(badID)).Scan(&pending)
	h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE channel=? AND state='pending' AND retry_after>?", webhooks.Channel(badID), time.Now().Unix()).Scan(&backedOff)
	h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE channel=? AND state='sent'", webhooks.Channel(goodID)).Scan(&healthy)
	expect(t, "all bad endpoint jobs remain durable", pending, 3)
	expect(t, "backoff covers its queued jobs", backedOff, 3)
	expect(t, "other endpoint is sent", healthy, 3)
	restarted := NewReminderWorker(h.db, h.worker.Settings, nil, h.worker.Today)
	restarted.Tick()
	expect(t, "restart respects backoff", failedCalls.Load(), int32(1))
	expect(t, "restart does not duplicate sent", healthyCalls.Load(), int32(3))
}

func TestSlowWebhookDoesNotBlockOtherRecipientOrNormalChannel(t *testing.T) {
	h := newWebhookHarness(t)
	entered, release, fast, other := make(chan struct{}, 1), make(chan struct{}), make(chan struct{}, 8), make(chan struct{}, 8)
	var active, peak atomic.Int32
	track := func() func() {
		n := active.Add(1)
		for {
			old := peak.Load()
			if old >= n || peak.CompareAndSwap(old, n) {
				break
			}
		}
		return func() { active.Add(-1) }
	}
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { defer track()(); entered <- struct{}{}; <-release }))
	defer slow.Close()
	defer close(release)
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { defer track()(); fast <- struct{}{}; w.WriteHeader(204) }))
	defer good.Close()
	h.endpoint(t, slow.URL, true, false)
	h.endpoint(t, good.URL, true, false)
	for range 4 {
		h.period(t, "2026-01-30")
	}
	h.worker.Channels["max"] = func(ReminderRow) SendResult { other <- struct{}{}; return SendResult{State: "sent"} }
	done := make(chan struct{})
	go func() { h.worker.Tick(); close(done) }()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("slow recipient was not reached")
	}
	for range 4 {
		select {
		case <-fast:
		case <-time.After(3 * time.Second):
			t.Fatal("healthy recipient blocked by slow receiver")
		}
		select {
		case <-other:
		case <-time.After(3 * time.Second):
			t.Fatal("normal channel blocked by slow receiver")
		}
	}
	writeDone := make(chan error, 1)
	go func() { _, err := h.db.Exec("UPDATE recurring_payments SET title='Changed'"); writeDone <- err }()
	select {
	case err := <-writeDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("network request held database writer")
	}
	if peak.Load() > 2 {
		t.Fatal("more than two webhook requests in flight")
	}
	// Disable before releasing the slow receiver: its started request is saved,
	// and remaining periods must be cancelled rather than sent to a disabled URL.
	h.db.Exec("UPDATE webhook_endpoints SET enabled=0 WHERE url=?", slow.URL)
	release <- struct{}{}
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("batch did not finish")
	}
	var sent int
	h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE channel='webhook:1' AND state='sent'").Scan(&sent)
	expect(t, "started request finishes with original result", sent, 1)
}

func TestWebhookClaimFencesDisableChangeAndStaleCompletion(t *testing.T) {
	h := newWebhookHarness(t)
	id := h.endpoint(t, "https://before.example/receiver", true, false)
	period := h.period(t, "2026-01-30")
	h.enqueue(t)
	old, found, err := h.worker.claimWebhook()
	if err != nil || !found {
		t.Fatal("claim failed", err)
	}
	// This is the same atomic revocation performed by an endpoint settings edit.
	err = h.db.Write(func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE webhook_endpoints SET enabled=0 WHERE id=?", id)
		if err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE deliveries SET state='cancelled' WHERE channel=? AND (state='pending' OR (state='sending' AND dispatch_started_at IS NULL))", webhooks.Channel(id))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	_, send, err := h.worker.prepareWebhook(old)
	if err != nil || send {
		t.Fatal("revoked claim dispatches", err)
	}
	h.db.Exec("UPDATE webhook_endpoints SET enabled=1,url=?,secret=? WHERE id=?", "https://after.example/receiver", "new-secret", id)
	h.enqueue(t)
	next, found, err := h.worker.claimWebhook()
	if err != nil || !found || next.token == old.token {
		t.Fatal("new claim token missing", err)
	}
	endpoint, send, err := h.worker.prepareWebhook(next)
	if err != nil || !send || endpoint.URL != "https://after.example/receiver" || endpoint.Secret != "new-secret" {
		t.Fatal("did not resolve current endpoint", err)
	}
	if err := h.worker.finishWebhook(old, SendResult{State: "sent"}); err != nil {
		t.Fatal(err)
	}
	var state, claim string
	h.db.QueryRow("SELECT state,claim_token FROM deliveries WHERE occurrence_id=? AND channel=?", period, webhooks.Channel(id)).Scan(&state, &claim)
	expect(t, "stale completion cannot overwrite new claim", state, "sending")
	expect(t, "new claim remains owner", claim, next.token)
	if err := h.worker.finishWebhook(next, SendResult{State: "sent"}); err != nil {
		t.Fatal(err)
	}
	h.db.Exec("UPDATE webhook_endpoints SET enabled=0 WHERE id=?", id)
	h.enqueue(t)
	h.db.Exec("UPDATE webhook_endpoints SET enabled=1 WHERE id=?", id)
	h.enqueue(t)
	_, found, err = h.worker.claimWebhook()
	if err != nil || found {
		t.Fatal("reenable replayed a sent delivery", err)
	}
}

func TestWebhookReenablePreservesTerminalStatesAndOwnOverdueRules(t *testing.T) {
	h := newWebhookHarness(t)
	id := h.endpoint(t, "https://example.com/receiver", true, true)
	states := []string{"sent", "uncertain", "failed", "cancelled"}
	for _, state := range states {
		period := h.period(t, "2026-01-30")
		if _, err := h.db.Exec("INSERT INTO deliveries(occurrence_id,kind,channel,state,claim_token,attempts) VALUES(?,'due',?,?,?,4)", period, webhooks.Channel(id), state, "old-"+state); err != nil {
			t.Fatal(err)
		}
	}
	h.db.Exec("UPDATE webhook_endpoints SET enabled=0 WHERE id=?", id)
	h.enqueue(t)
	h.db.Exec("UPDATE webhook_endpoints SET enabled=1 WHERE id=?", id)
	h.enqueue(t)
	for i, state := range states {
		var got string
		var attempts int
		h.db.QueryRow("SELECT state,attempts FROM deliveries WHERE occurrence_id=? AND channel=?", i+1, webhooks.Channel(id)).Scan(&got, &attempts)
		if state == "cancelled" {
			expect(t, "cancelled can reenqueue", got, "pending")
			expect(t, "new attempt budget", attempts, 0)
		} else {
			expect(t, "terminal state preserved", got, state)
			expect(t, "attempt budget preserved", attempts, 4)
		}
	}
	overdue := h.period(t, "2026-01-27")
	h.enqueue(t)
	can, err := h.worker.CanRetryFailed(h.db, "deliveries", overdue, "overdue", webhooks.Channel(id), "")
	if err != nil || !can {
		t.Fatal("own overdue setting incorrectly gated by global flag", err)
	}
	h.db.Exec("UPDATE webhook_endpoints SET notify_overdue=0 WHERE id=?", id)
	h.enqueue(t)
	can, err = h.worker.CanRetryFailed(h.db, "deliveries", overdue, "overdue", webhooks.Channel(id), "")
	if err != nil || can {
		t.Fatal("disabled event still retryable", err)
	}
	var state string
	h.db.QueryRow("SELECT state FROM deliveries WHERE occurrence_id=? AND channel=?", overdue, webhooks.Channel(id)).Scan(&state)
	expect(t, "queued disabled event cancelled", state, "cancelled")
	h.db.Exec("UPDATE payment_occurrences SET paid_at='2026-01-28' WHERE id=3")
	can, err = h.worker.CanRetryFailed(h.db, "deliveries", 3, "due", webhooks.Channel(id), "")
	if err != nil || can {
		t.Fatal("paid delivery still retryable", err)
	}
}

func TestWebhookConcurrentWorkersClaimEachDestinationOnlyOnce(t *testing.T) {
	h := newWebhookHarness(t)
	first := h.endpoint(t, "https://first.example/receiver", true, false)
	second := h.endpoint(t, "https://second.example/receiver", true, false)
	period := h.period(t, "2026-01-30")
	h.enqueue(t)
	workers := []*ReminderWorker{h.worker, NewReminderWorker(h.db, h.worker.Settings, nil, h.worker.Today)}
	var wg sync.WaitGroup
	claims := make(chan webhookClaim, 8)
	for i := range 8 {
		wg.Add(1)
		go func(w *ReminderWorker) {
			defer wg.Done()
			claim, found, err := w.claimWebhook()
			if err != nil {
				t.Error(err)
			}
			if found {
				claims <- claim
			}
		}(workers[i%2])
	}
	wg.Wait()
	close(claims)
	seen := map[int64]bool{}
	for claim := range claims {
		if seen[claim.endpointID] {
			t.Fatal("duplicate endpoint claim")
		}
		seen[claim.endpointID] = true
		expect(t, "same period may reach different receivers", claim.row.OccurrenceID, period)
	}
	if len(seen) != 2 || !seen[first] || !seen[second] {
		t.Fatal("incorrect endpoint claims", seen)
	}
}

func TestWebhookRetryExhaustionAndManualRetryFencing(t *testing.T) {
	h := newWebhookHarness(t)
	id := h.endpoint(t, "https://example.com/receiver", true, false)
	period := h.period(t, "2026-01-30")
	var calls atomic.Int32
	channel := webhooks.Channel(id)
	h.worker.Channels[channel] = func(ReminderRow) SendResult { calls.Add(1); return SendResult{State: "pending", Error: "Unavailable"} }
	for attempt := 1; attempt <= MaxDeliveryAttempts; attempt++ {
		h.worker.Tick()
		var attempts int
		var state string
		h.db.QueryRow("SELECT attempts,state FROM deliveries WHERE occurrence_id=? AND channel=?", period, channel).Scan(&attempts, &state)
		expect(t, "attempts persisted", attempts, attempt)
		if attempt < MaxDeliveryAttempts {
			expect(t, "retry remains queued", state, "pending")
		} else {
			expect(t, "budget exhausted", state, "failed")
		}
		h.db.Exec("DELETE FROM app_state WHERE key=?", "notify_backoff:"+channel)
		h.db.Exec("UPDATE deliveries SET retry_after=0 WHERE channel=?", channel)
	}
	h.worker.Tick()
	expect(t, "failed not retried automatically", calls.Load(), int32(MaxDeliveryAttempts))
	var token string
	h.db.QueryRow("SELECT claim_token FROM deliveries WHERE occurrence_id=? AND channel=?", period, channel).Scan(&token)
	err := h.db.Write(func(tx *sql.Tx) error { return h.worker.RetryFailed(tx, "deliveries", period, "due", channel, token) })
	if err != nil {
		t.Fatal(err)
	}
	err = h.db.Write(func(tx *sql.Tx) error { return h.worker.RetryFailed(tx, "deliveries", period, "due", channel, token) })
	if err != ErrNotRetryable {
		t.Fatal("double manual retry was not fenced", err)
	}
	h.db.Exec("UPDATE webhook_endpoints SET deleted_at='now' WHERE id=?", id)
	h.worker.Tick()
	expect(t, "deleted destination is not sent", calls.Load(), int32(MaxDeliveryAttempts))
}

func TestWebhookMigrationRestartDoesNotDuplicatePreviouslySent(t *testing.T) {
	h := newWebhookHarness(t)
	var calls atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(204) }))
	defer receiver.Close()
	period := h.period(t, "2026-01-30")
	h.db.Exec("INSERT INTO deliveries(occurrence_id,kind,channel,state,attempts,claim_token,sent_at) VALUES(?,'due','webhook','sent',1,'old-claim','old-time')", period)
	h.worker.Settings.WebhookURL = receiver.URL
	h.worker.Settings.WebhookAllowPrivate = true
	if err := webhooks.ImportLegacy(h.db, h.worker.Settings); err != nil {
		t.Fatal(err)
	}
	h.worker.Tick()
	expect(t, "migration does not resend sent event", calls.Load(), int32(0))
	h.period(t, "2026-01-30")
	h.worker.Tick()
	expect(t, "new payment reaches imported endpoint", calls.Load(), int32(1))
	restart := NewReminderWorker(h.db, h.worker.Settings, nil, h.worker.Today)
	if err := webhooks.ImportLegacy(h.db, h.worker.Settings); err != nil {
		t.Fatal(err)
	}
	restart.Tick()
	expect(t, "restart preserves imported delivery identity", calls.Load(), int32(1))
	var channel string
	h.db.QueryRow("SELECT channel FROM deliveries WHERE occurrence_id=?", period).Scan(&channel)
	if !strings.HasPrefix(channel, "webhook:") {
		t.Fatal("legacy channel remains", channel)
	}
}

func TestWebhookRoundRobinFairnessAcrossManyPendingPeriods(t *testing.T) {
	h := newWebhookHarness(t)
	for i := range 4 {
		h.endpoint(t, fmt.Sprintf("https://receiver%d.example/", i), true, false)
	}
	for range 6 {
		h.period(t, "2026-01-30")
	}
	h.enqueue(t)
	for i := range 8 {
		claim, found, err := h.worker.claimWebhook()
		if err != nil || !found {
			t.Fatal(err)
		}
		expect(t, "round robin visits each endpoint", claim.endpointID, int64(i%4+1))
		_, send, err := h.worker.prepareWebhook(claim)
		if err != nil || !send {
			t.Fatal(err)
		}
		if err := h.worker.finishWebhook(claim, SendResult{State: "sent"}); err != nil {
			t.Fatal(err)
		}
	}
}

func TestWebhookRecreatedURLSuppressesOldDispatchesButDifferentURLReceives(t *testing.T) {
	h := newWebhookHarness(t)
	url := "https://original.example/receiver"
	oldID := h.endpoint(t, url, true, false)
	key, _ := webhooks.URLKey(url)
	type prior struct {
		state      string
		dispatched any
		suppress   bool
	}
	priorRows := []prior{{"sent", 123, true}, {"uncertain", 123, true}, {"failed", 123, true}, {"sending", 123, true}, {"cancelled", 123, true}, {"pending", nil, false}, {"cancelled", nil, false}}
	for _, prior := range priorRows {
		period := h.period(t, "2026-01-30")
		if _, err := h.db.Exec("INSERT INTO deliveries(occurrence_id,kind,channel,state,recipient,dispatch_started_at) VALUES(?,'due',?,?,?,?)", period, webhooks.Channel(oldID), prior.state, key, prior.dispatched); err != nil {
			t.Fatal(err)
		}
	}
	h.db.Exec("UPDATE webhook_endpoints SET deleted_at='removed',enabled=0 WHERE id=?", oldID)
	same := h.endpoint(t, url, true, false)
	different := h.endpoint(t, "https://different.example/receiver", true, false)
	h.enqueue(t)
	for i, prior := range priorRows {
		var count int
		h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE occurrence_id=? AND channel=?", i+1, webhooks.Channel(same)).Scan(&count)
		want := 1
		if prior.suppress {
			want = 0
		}
		expect(t, "recreated URL suppression for "+prior.state, count, want)
		h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE occurrence_id=? AND channel=?", i+1, webhooks.Channel(different)).Scan(&count)
		expect(t, "different receiver gets own event", count, 1)
	}
}

func TestWebhookSuppressionUsesDispatchedURLSnapshotAndPreflightRecheck(t *testing.T) {
	h := newWebhookHarness(t)
	original := "https://original.example/"
	changed := "https://changed.example/"
	old := h.endpoint(t, original, true, false)
	period := h.period(t, "2026-01-30")
	h.enqueue(t)
	claim, found, err := h.worker.claimWebhook()
	if err != nil || !found {
		t.Fatal(err)
	}
	_, send, err := h.worker.prepareWebhook(claim)
	if err != nil || !send {
		t.Fatal(err)
	}
	if err := h.worker.finishWebhook(claim, SendResult{State: "sent"}); err != nil {
		t.Fatal(err)
	}
	changedKey, _ := webhooks.URLKey(changed)
	h.db.Exec("UPDATE webhook_endpoints SET url=?,url_key=?,enabled=0,deleted_at='removed' WHERE id=?", changed, changedKey, old)
	same := h.endpoint(t, original, true, false)
	newAddress := h.endpoint(t, changed, true, false)
	h.enqueue(t)
	var count int
	h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE occurrence_id=? AND channel=?", period, webhooks.Channel(same)).Scan(&count)
	expect(t, "old receiver protected after card URL edit", count, 0)
	h.db.QueryRow("SELECT COUNT(*) FROM deliveries WHERE occurrence_id=? AND channel=?", period, webhooks.Channel(newAddress)).Scan(&count)
	expect(t, "new receiver not mistaken for earlier destination", count, 1)

	// Even if another completed attempt appeared after enqueue, preflight must
	// refuse the new request. It cannot depend solely on the batch's old view.
	claim, found, err = h.worker.claimWebhook()
	if err != nil || !found {
		t.Fatal(err)
	}
	h.db.Exec("UPDATE deliveries SET recipient=? WHERE channel=? AND occurrence_id=?", changedKey, webhooks.Channel(old), period)
	_, send, err = h.worker.prepareWebhook(claim)
	if err != nil || send {
		t.Fatal("preflight duplicated previous recipient", err)
	}
	var state string
	h.db.QueryRow("SELECT state FROM deliveries WHERE channel=? AND occurrence_id=?", webhooks.Channel(newAddress), period).Scan(&state)
	expect(t, "duplicate claim cancelled", state, "cancelled")
}

func TestAutomaticWebhookSocketGuardRejectsReservedDestinations(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "192.0.2.1", "::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:db8::1"} {
		if err := publicOnly("tcp", net.JoinHostPort(ip, "443"), nil); err != ErrPrivateAddress {
			t.Errorf("reserved socket address accepted: %s: %v", ip, err)
		}
	}
	for _, ip := range []string{"8.8.8.8", "2606:4700:4700::1111"} {
		if err := publicOnly("tcp", net.JoinHostPort(ip, "443"), nil); err != nil {
			t.Errorf("public socket address rejected: %s: %v", ip, err)
		}
	}
}
