package app

import (
	"context"
	"database/sql"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

// This is a blocked transport, not a timing benchmark: the unrelated write must
// finish while the external request is still waiting for our explicit release.
func TestDeliveryNetworkNeverHoldsDatabaseWriteLock(t *testing.T) {
	for _, channel := range []string{"team", "personal", "email", "webhook", "max"} {
		t.Run(channel, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			entered := make(chan notify.ReminderRow, 2)
			release := make(chan struct{})
			var once sync.Once
			defer once.Do(func() { close(release) })
			var sends atomic.Int32
			sender := func(row notify.ReminderRow) notify.SendResult {
				sends.Add(1)
				entered <- row
				<-release
				return notify.SendResult{State: "sent", MessageID: "test-message"}
			}
			settings := *e.settings
			if channel == "team" {
				settings = *enabledSettings(e)
			} else if channel == "personal" {
				settings = *personalTelegramSettings(e)
				linkReminderAdmin(t, e)
			} else if channel == "email" {
				_, err := e.db.Exec("INSERT INTO email_contacts(is_admin,email,verified_at,requested_at,welcome_state) VALUES(1,'owner@example.com','2026-01-01',0,'confirmed')")
				if err != nil {
					t.Fatal(err)
				}
			}
			worker := notify.NewReminderWorker(e.db, &settings, sender, e.clock.Today)
			worker.Channels = map[string]notify.Sender{}
			if channel == "email" || channel == "webhook" || channel == "max" {
				worker.Channels[channel] = sender
			}
			done := make(chan struct{})
			go func() { worker.Tick(); close(done) }()
			var row notify.ReminderRow
			select {
			case row = <-entered:
			case <-time.After(3 * time.Second):
				t.Fatal("transport did not start")
			}
			apiDone := make(chan response, 1)
			go func() {
				apiDone <- admin.patch("/api/v1/payment-occurrences/"+itoa(row.OccurrenceID), map[string]any{"paid": true})
			}()
			select {
			case r := <-apiDone:
				expect(t, "payment update while transport blocked", r.status, 200)
			case <-time.After(3 * time.Second):
				t.Fatal("payment update is blocked by external delivery")
			}
			// A second connection/worker sees the persisted claim and must not replay it.
			other, err := store.OpenDB(e.settings.DatabasePath)
			if err != nil {
				t.Fatal(err)
			}
			defer other.Close()
			second := notify.NewReminderWorker(other, &settings, sender, e.clock.Today)
			second.Channels = worker.Channels
			second.Tick()
			expect(t, "exactly one send started", sends.Load(), int32(1))
			once.Do(func() { close(release) })
			select {
			case <-done:
			case <-time.After(3 * time.Second):
				t.Fatal("delivery did not finish")
			}
			var state string
			if channel == "team" {
				err = e.db.QueryRow("SELECT state FROM reminders WHERE occurrence_id=?", row.OccurrenceID).Scan(&state)
			} else {
				err = e.db.QueryRow("SELECT state FROM deliveries WHERE occurrence_id=?", row.OccurrenceID).Scan(&state)
			}
			if err != nil {
				t.Fatal(err)
			}
			expect(t, "in-flight completion retained after payment", state, "sent")
		})
	}
}

func TestInFlightTelegramUnlinkDoesNotReplayOnRelink(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	admin.createPayment(nil)
	linkReminderAdmin(t, e)
	started, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var once sync.Once
	defer once.Do(func() { close(release) })
	var calls atomic.Int32
	worker := notify.NewReminderWorker(e.db, personalTelegramSettings(e), func(notify.ReminderRow) notify.SendResult {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return notify.SendResult{State: "sent"}
	}, e.clock.Today)
	go func() { worker.Tick(); close(done) }()
	<-started
	expect(t, "unlink while external request runs", admin.delete("/api/v1/me/telegram").status, 204)
	expect(t, "in-flight claim retained", personalDeliveryState(t, e, "due", "9001"), "sending")
	linkReminderAdmin(t, e)
	other := notify.NewReminderWorker(e.db, personalTelegramSettings(e), func(notify.ReminderRow) notify.SendResult {
		calls.Add(1)
		return notify.SendResult{State: "sent"}
	}, e.clock.Today)
	other.Tick()
	expect(t, "no second dispatch while first is in flight", calls.Load(), int32(1))
	once.Do(func() { close(release) })
	<-done
	other.Tick()
	expect(t, "no replay after completion", calls.Load(), int32(1))
}

func TestStaleDeliveryResultCannotOverwriteNewClaim(t *testing.T) {
	for _, channel := range []string{"team", "personal"} {
		t.Run(channel, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			settings := enabledSettings(e)
			if channel == "personal" {
				settings = personalTelegramSettings(e)
				linkReminderAdmin(t, e)
			}
			worker := notify.NewReminderWorker(e.db, settings, func(row notify.ReminderRow) notify.SendResult {
				// Same row, same attempt counter and timestamp, but a new claim token.
				// Model replacement by another generation without relying on wall-clock precision.
				err := e.db.Write(func(tx *sql.Tx) error {
					query := "UPDATE reminders SET claim_token=?,state='sending',error='new generation' WHERE occurrence_id=?"
					if channel == "personal" {
						query = "UPDATE deliveries SET claim_token=?,state='sending',error='new generation' WHERE occurrence_id=?"
					}
					_, err := tx.Exec(query, security.RandomToken(24), row.OccurrenceID)
					return err
				})
				if err != nil {
					t.Fatal(err)
				}
				return notify.SendResult{State: "sent", MessageID: "stale"}
			}, e.clock.Today)
			worker.Tick()
			query := "SELECT state,error FROM reminders"
			if channel == "personal" {
				query = "SELECT state,error FROM deliveries"
			}
			var state, message string
			if err := e.db.QueryRow(query).Scan(&state, &message); err != nil {
				t.Fatal(err)
			}
			expect(t, "new state retained", state, "sending")
			expect(t, "new result retained", message, "new generation")
		})
	}
}

func TestPauseRefusesToEraseInFlightDelivery(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	payment := admin.createPayment(nil)
	worker := makeWorker(e, func(row notify.ReminderRow) notify.SendResult {
		r := admin.post("/api/v1/recurring-payments/"+id(payment)+"/pause", nil)
		expect(t, "pause reports in-flight dispatch without waiting", r.status, 409)
		var count int
		if err := e.db.QueryRow("SELECT count(*) FROM reminders WHERE occurrence_id=? AND state='sending'", row.OccurrenceID).Scan(&count); err != nil {
			t.Fatal(err)
		}
		expect(t, "claim remains for finalization", count, 1)
		return notify.SendResult{State: "sent"}
	})
	worker.Tick()
	expect(t, "send result saved", reminderState(t, e), "sent")
	expect(t, "pause succeeds after dispatch finishes", admin.post("/api/v1/recurring-payments/"+id(payment)+"/pause", nil).status, 200)
}

func TestSafeRetryCannotResurrectCancelledClaim(t *testing.T) {
	for _, channel := range []string{"team", "personal"} {
		t.Run(channel, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			settings := enabledSettings(e)
			if channel == "personal" {
				settings = personalTelegramSettings(e)
				linkReminderAdmin(t, e)
			}
			worker := notify.NewReminderWorker(e.db, settings, func(row notify.ReminderRow) notify.SendResult {
				query := "UPDATE reminders SET state='cancelled' WHERE occurrence_id=?"
				if channel == "personal" {
					query = "UPDATE deliveries SET state='cancelled' WHERE occurrence_id=?"
				}
				if _, err := e.db.Exec(query, row.OccurrenceID); err != nil {
					t.Fatal(err)
				}
				return notify.SendResult{State: "pending", RetryDelay: 600}
			}, e.clock.Today)
			worker.Tick()
			state := ""
			query := "SELECT state FROM reminders"
			if channel == "personal" {
				query = "SELECT state FROM deliveries"
			}
			if err := e.db.QueryRow(query).Scan(&state); err != nil {
				t.Fatal(err)
			}
			expect(t, "late 429 does not resurrect cancelled row", state, "cancelled")
		})
	}
}

func TestWelcomeEmailRechecksGenerationAndFencesLateResult(t *testing.T) {
	for _, mutation := range []string{"before-dispatch", "during-send"} {
		t.Run(mutation, func(t *testing.T) {
			e := setup(t)
			settings := *e.settings
			settings.SMTPHost, settings.SMTPFrom, settings.PublicBaseURL = "test.invalid", "from@example.com", "https://keeper.example"
			secret := security.EncryptText("email_contacts.token_secret", "original-code")
			if _, err := e.db.Exec(`INSERT INTO email_contacts(is_admin,email,token_secret,token_hash,requested_at,expires_at,welcome_state)
				VALUES(1,'old@example.com',?,'old-hash',0,?,'pending')`, secret, time.Now().Unix()+600); err != nil {
				t.Fatal(err)
			}
			if mutation == "before-dispatch" {
				if _, err := e.db.Exec(`CREATE TRIGGER replace_verification_after_claim AFTER UPDATE OF welcome_state ON email_contacts
					WHEN new.welcome_state='sending' BEGIN UPDATE email_contacts SET token_hash='new-hash',email='new@example.com',welcome_state='sent' WHERE id=new.id; END`); err != nil {
					t.Fatal(err)
				}
			}
			var sends int
			worker := notify.NewReminderWorker(e.db, &settings, nil, e.clock.Today)
			worker.Channels = map[string]notify.Sender{}
			worker.VerificationSender = func(to, name, link string) notify.SendResult {
				sends++
				expect(t, "recipient from this claim", to, "old@example.com")
				// This write would deadlock if SMTP held the SQLite transaction.
				if err := e.db.Write(func(tx *sql.Tx) error {
					_, err := tx.Exec("UPDATE email_contacts SET token_hash='new-hash',claim_token='new-claim',welcome_state='sent',email='new@example.com',error='new generation'")
					return err
				}); err != nil {
					t.Fatal(err)
				}
				return notify.SendResult{State: "pending", RetryDelay: 60}
			}
			worker.Tick()
			want := 0
			if mutation == "during-send" {
				want = 1
			}
			expect(t, "dispatch count", sends, want)
			var state, hash, email string
			if err := e.db.QueryRow("SELECT welcome_state,token_hash,email FROM email_contacts").Scan(&state, &hash, &email); err != nil {
				t.Fatal(err)
			}
			expect(t, "new generation state kept", state, "sent")
			expect(t, "new generation hash kept", hash, "new-hash")
			expect(t, "new generation recipient kept", email, "new@example.com")
		})
	}
}

func TestUnstartedDeliveryClaimRecoversWithoutReplay(t *testing.T) {
	for _, channel := range []string{"team", "personal"} {
		t.Run(channel, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			admin.createPayment(nil)
			item := admin.get("/api/v1/payment-occurrences").list(t)[0]
			settings := enabledSettings(e)
			table := "reminders"
			if channel == "personal" {
				settings = personalTelegramSettings(e)
				linkReminderAdmin(t, e)
				table = "deliveries"
			}
			query := "INSERT INTO reminders(occurrence_id,state,attempted_at,claim_token) VALUES(?,'sending',?,'abandoned-before-dispatch')"
			if channel == "personal" {
				query = "INSERT INTO deliveries(occurrence_id,kind,channel,state,attempted_at,claim_token) VALUES(?,'due','telegram:9001','sending',?,'abandoned-before-dispatch')"
			}
			if _, err := e.db.Exec(query, item["id"], time.Now().Unix()-600); err != nil {
				t.Fatal(err)
			}
			var calls int
			worker := notify.NewReminderWorker(e.db, settings, func(row notify.ReminderRow) notify.SendResult {
				calls++
				var token string
				if err := e.db.QueryRow("SELECT claim_token FROM "+table+" WHERE occurrence_id=?", row.OccurrenceID).Scan(&token); err != nil {
					t.Fatal(err)
				}
				if token == "abandoned-before-dispatch" || token == "" {
					t.Fatal("expired claim token was reused")
				}
				return notify.SendResult{State: "sent"}
			}, e.clock.Today)
			worker.Tick()
			worker.Tick()
			expect(t, "recovered exactly once", calls, 1)
		})
	}
}

func TestDeliveryPreflightRejectsPaymentChangesAfterClaim(t *testing.T) {
	for _, channel := range []string{"team", "personal"} {
		for _, mutation := range []string{"paid", "removed", "archived"} {
			t.Run(channel+"/"+mutation, func(t *testing.T) {
				e := setup(t)
				admin := e.client()
				admin.signIn()
				admin.createPayment(nil)
				settings := enabledSettings(e)
				table := "reminders"
				if channel == "personal" {
					settings = personalTelegramSettings(e)
					linkReminderAdmin(t, e)
					table = "deliveries"
				}
				statement := "UPDATE payment_occurrences SET paid_at='2026-01-28' WHERE id=new.occurrence_id"
				if mutation == "removed" {
					statement = "UPDATE payment_occurrences SET removed_at='x' WHERE id=new.occurrence_id"
				} else if mutation == "archived" {
					statement = "UPDATE recurring_payments SET active=0"
				}
				if _, err := e.db.Exec("CREATE TRIGGER change_payment_after_claim AFTER UPDATE OF state ON " + table + " WHEN new.state='sending' BEGIN " + statement + "; END"); err != nil {
					t.Fatal(err)
				}
				var calls int
				notify.NewReminderWorker(e.db, settings, func(notify.ReminderRow) notify.SendResult {
					calls++
					return notify.SendResult{State: "sent"}
				}, e.clock.Today).Tick()
				expect(t, "no dispatch after preflight rejection", calls, 0)
				var state string
				if err := e.db.QueryRow("SELECT state FROM " + table).Scan(&state); err != nil {
					t.Fatal(err)
				}
				expect(t, "cancelled before dispatch", state, "cancelled")
			})
		}
	}
}

// Existing retry tests explicitly advance persisted retry deadlines. Transport
// cooldowns are part of that same clock, and must be advanced with the row.
func expireTransportBackoff(t *testing.T, e *harness) {
	t.Helper()
	if _, err := e.db.Exec("DELETE FROM app_state WHERE key LIKE 'notify_backoff:%'"); err != nil {
		t.Fatal(err)
	}
}

func TestWorkerRunDrainsReadyBatchesWithoutRepeatedMaintenance(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	for range 45 {
		admin.createPayment(nil)
	}
	var sends, maintenance atomic.Int32
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	worker := makeWorker(e, func(notify.ReminderRow) notify.SendResult {
		if sends.Add(1) == 45 {
			cancel()
		}
		return notify.SendResult{State: "sent"}
	})
	worker.Maintenance = func(*sql.Tx) error { maintenance.Add(1); return nil }
	done := make(chan struct{})
	go func() { worker.Run(ctx); close(done) }()
	select {
	case <-done:
	case <-time.After(4 * time.Second):
		t.Fatal("ready backlog waited for the 60-second maintenance interval")
	}
	expect(t, "all three batches drained", sends.Load(), int32(45))
	expect(t, "only one full enqueue/maintenance", maintenance.Load(), int32(1))
}

func TestWorkerTickRemainsOneBoundedBatch(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	for range 45 {
		admin.createPayment(nil)
	}
	var sends int
	worker := makeWorker(e, func(notify.ReminderRow) notify.SendResult {
		sends++
		return notify.SendResult{State: "sent"}
	})
	worker.Tick()
	expect(t, "first finite pass", sends, 20)
	worker.Tick()
	expect(t, "second finite pass", sends, 40)
}

func TestTransportBackoffCoversWholeDestinationAndNewTasks(t *testing.T) {
	for _, channel := range []string{"team", "personal", "webhook"} {
		t.Run(channel, func(t *testing.T) {
			e := setup(t)
			admin := e.client()
			admin.signIn()
			for range 3 {
				admin.createPayment(nil)
			}
			settings := enabledSettings(e)
			if channel == "personal" {
				settings = personalTelegramSettings(e)
				linkReminderAdmin(t, e)
			} else if channel == "webhook" {
				settings = e.settings
			}
			var sends int
			sender := func(notify.ReminderRow) notify.SendResult {
				sends++
				if sends == 1 {
					return notify.SendResult{State: "pending", RetryDelay: 600}
				}
				return notify.SendResult{State: "sent"}
			}
			run := func() {
				worker := notify.NewReminderWorker(e.db, settings, sender, e.clock.Today)
				if channel == "webhook" {
					worker.Channels = map[string]notify.Sender{"webhook": sender}
				}
				worker.Tick()
			}
			run()
			expect(t, "429 pauses destination, not only one payment", sends, 1)
			run()
			expect(t, "another worker respects persisted cooldown", sends, 1)
			admin.createPayment(nil)
			run()
			expect(t, "newly enqueued payment inherits cooldown", sends, 1)
			expireTransportBackoff(t, e)
			if _, err := e.db.Exec("UPDATE reminders SET retry_after=0; UPDATE deliveries SET retry_after=0"); err != nil {
				t.Fatal(err)
			}
			run()
			expect(t, "queue resumes after cooldown", sends, 5)
		})
	}
}
