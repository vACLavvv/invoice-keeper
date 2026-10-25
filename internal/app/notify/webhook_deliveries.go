package notify

import (
	"database/sql"
	"errors"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/webhooks"
)

func (w *ReminderWorker) enqueueWebhooks(tx *sql.Tx, today time.Time) error {
	// The receiver's own event toggles govern webhook delivery independently of
	// the legacy global overdue setting used by Telegram/MAX/email.
	for _, event := range []struct {
		kind, column string
		from, to     time.Time
	}{
		{"due", "notify_due", today, today.AddDate(0, 0, 3)},
		{"overdue", "notify_overdue", today.AddDate(0, 0, -overdueWindow), today.AddDate(0, 0, -1)},
	} {
		_, err := tx.Exec(`INSERT INTO deliveries(occurrence_id,kind,channel,state,recipient)
			SELECT o.id,?,'webhook:'||e.id,'pending',e.url_key FROM payment_occurrences o
			JOIN recurring_payments r ON r.id=o.recurring_payment_id CROSS JOIN webhook_endpoints e
			WHERE e.enabled=1 AND e.deleted_at IS NULL AND e.`+event.column+`=1
			AND r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL AND o.due_date>=? AND o.due_date<=?
			AND NOT EXISTS(SELECT 1 FROM deliveries prior JOIN webhook_endpoints old ON prior.channel='webhook:'||old.id
			WHERE old.id<>e.id AND prior.occurrence_id=o.id AND prior.kind=?
			AND (prior.recipient=e.url_key OR (COALESCE(prior.recipient,'')='' AND old.url_key=e.url_key))
			AND (prior.state IN ('sent','uncertain','failed') OR (prior.state IN ('sending','cancelled') AND prior.dispatch_started_at IS NOT NULL)))
			ON CONFLICT(occurrence_id,kind,channel) DO UPDATE SET state='pending',attempts=0,attempted_at=NULL,retry_after=0,error=NULL,
			claim_token=NULL,dispatch_started_at=NULL,recipient=excluded.recipient WHERE deliveries.state='cancelled'`, event.kind, schedule.FormatDate(event.from), schedule.FormatDate(event.to), event.kind) // #nosec G202 -- column names are constants above
		if err != nil {
			return err
		}
	}
	_, err := tx.Exec(`UPDATE deliveries SET state='cancelled' WHERE channel LIKE 'webhook:%'
		AND (state='pending' OR (state='sending' AND dispatch_started_at IS NULL))
		AND NOT EXISTS(SELECT 1 FROM webhook_endpoints e WHERE deliveries.channel='webhook:'||e.id
		AND e.enabled=1 AND e.deleted_at IS NULL AND ((deliveries.kind='due' AND e.notify_due=1) OR (deliveries.kind='overdue' AND e.notify_overdue=1)))`)
	return err
}

type webhookClaim struct {
	row            ReminderRow
	channel, token string
	endpointID     int64
}

// claimWebhook rotates through eligible endpoints, with at most one in-flight
// request per endpoint across processes. A failing receiver therefore cannot
// fill both slots or bypass its own persistent transport backoff.
func (w *ReminderWorker) claimWebhook() (webhookClaim, bool, error) {
	var claim webhookClaim
	claim.token = security.RandomToken(24)
	found := false
	err := w.DB.Write(func(tx *sql.Tx) error {
		var cursor int64
		if err := tx.QueryRow("SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM app_state WHERE key='webhook_dispatch_cursor'),0)").Scan(&cursor); err != nil {
			return err
		}
		err := tx.QueryRow(`SELECT e.id FROM webhook_endpoints e WHERE e.enabled=1 AND e.deleted_at IS NULL
			AND NOT EXISTS(SELECT 1 FROM deliveries busy WHERE busy.channel='webhook:'||e.id AND busy.state='sending')
			AND EXISTS(SELECT 1 FROM deliveries d JOIN payment_occurrences o ON o.id=d.occurrence_id
			JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE d.channel='webhook:'||e.id
			AND d.state='pending' AND d.retry_after<=? AND ((d.kind='due' AND e.notify_due=1) OR (d.kind='overdue' AND e.notify_overdue=1))
			AND r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL)
			ORDER BY (e.id>?) DESC,e.id LIMIT 1`, time.Now().Unix(), cursor).Scan(&claim.endpointID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		err = tx.QueryRow(`SELECT d.channel,d.kind,o.id,r.title,o.amount_cents,o.currency,o.due_date,`+reminderColumns+`
			FROM deliveries d JOIN webhook_endpoints e ON d.channel='webhook:'||e.id
			JOIN payment_occurrences o ON o.id=d.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id`+sanctionsJoin+`
			WHERE d.channel=? AND d.state='pending' AND d.retry_after<=? AND e.enabled=1 AND e.deleted_at IS NULL
			AND ((d.kind='due' AND e.notify_due=1) OR (d.kind='overdue' AND e.notify_overdue=1))
			AND r.active=1 AND r.removed_at IS NULL AND o.removed_at IS NULL AND o.paid_at IS NULL
			ORDER BY o.due_date,o.id LIMIT 1`, webhooks.Channel(claim.endpointID), time.Now().Unix()).
			Scan(&claim.channel, &claim.row.Kind, &claim.row.OccurrenceID, &claim.row.Title, &claim.row.AmountCents, &claim.row.Currency, &claim.row.DueDate,
				&claim.row.PaymentURL, &claim.row.PaymentDetails, &claim.row.WalletNetwork, &claim.row.WalletAddress, &claim.row.SanctionsMatch)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if err := claim.row.openDetails(); err != nil {
			return err
		}
		_, err = tx.Exec(`UPDATE deliveries SET state='sending',attempts=attempts+1,attempted_at=?,claim_token=?,dispatch_started_at=NULL
			WHERE occurrence_id=? AND kind=? AND channel=? AND state='pending'`, time.Now().Unix(), claim.token, claim.row.OccurrenceID, claim.row.Kind, claim.channel)
		if err != nil {
			return err
		}
		found = true
		return store.SetState(tx, "webhook_dispatch_cursor", strconv.FormatInt(claim.endpointID, 10))
	})
	return claim, found, err
}

// prepareWebhook resolves the current encrypted URL/secret under the same write
// lock as dispatch_started_at. API changes may revoke a not-started claim, while
// an already-started request completes with this immutable endpoint snapshot.
func (w *ReminderWorker) prepareWebhook(claim webhookClaim) (webhooks.Endpoint, bool, error) {
	var endpoint webhooks.Endpoint
	maySend := false
	err := w.DB.Write(func(tx *sql.Tx) error {
		var owned bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM deliveries WHERE occurrence_id=? AND kind=? AND channel=?
			AND state='sending' AND claim_token=? AND dispatch_started_at IS NULL)`, claim.row.OccurrenceID, claim.row.Kind, claim.channel, claim.token).Scan(&owned); err != nil {
			return err
		}
		if !owned {
			return nil
		}
		retry, err := transportRetryAt(tx, claim.channel)
		if err != nil {
			return err
		}
		if retry > time.Now().Unix() {
			_, err = tx.Exec("UPDATE deliveries SET state='pending',retry_after=MAX(retry_after,?) WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", retry, claim.row.OccurrenceID, claim.row.Kind, claim.channel, claim.token)
			return err
		}
		endpoint, err = webhooks.Get(tx, claim.endpointID)
		if errors.Is(err, sql.ErrNoRows) {
			err = nil
		}
		if err != nil {
			return err
		}
		eligible, err := stillPayable(tx, claim.row.OccurrenceID)
		if err != nil {
			return err
		}
		eligible = eligible && endpoint.EnabledFor(claim.row.Kind)
		if eligible {
			duplicate, err := webhookAlreadyDispatched(tx, endpoint, claim.row.OccurrenceID, claim.row.Kind)
			if err != nil {
				return err
			}
			eligible = !duplicate
		}
		if !eligible || w.stopped() {
			state := "cancelled"
			if eligible {
				state = "pending"
			}
			_, err = tx.Exec("UPDATE deliveries SET state=? WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", state, claim.row.OccurrenceID, claim.row.Kind, claim.channel, claim.token)
			return err
		}
		_, err = tx.Exec("UPDATE deliveries SET dispatch_started_at=?,recipient=? WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", time.Now().Unix(), endpoint.URLKey, claim.row.OccurrenceID, claim.row.Kind, claim.channel, claim.token)
		maySend = err == nil
		return err
	})
	return endpoint, maySend, err
}

// recipient is an immutable destination digest for dispatched webhook rows.
// Keeping that snapshot avoids replay after delete/recreate and still remains
// correct if the old endpoint's URL was edited after an earlier delivery.
func webhookAlreadyDispatched(q store.Querier, endpoint webhooks.Endpoint, period int64, kind string) (bool, error) {
	var exists bool
	err := q.QueryRow(`SELECT EXISTS(SELECT 1 FROM deliveries prior JOIN webhook_endpoints old ON prior.channel='webhook:'||old.id
		WHERE old.id<>? AND prior.occurrence_id=? AND prior.kind=?
		AND (prior.recipient=? OR (COALESCE(prior.recipient,'')='' AND old.url_key=?))
		AND (prior.state IN ('sent','uncertain','failed') OR (prior.state IN ('sending','cancelled') AND prior.dispatch_started_at IS NOT NULL)))`, endpoint.ID, period, kind, endpoint.URLKey, endpoint.URLKey).Scan(&exists)
	return exists, err
}

func (w *ReminderWorker) finishWebhook(claim webhookClaim, result SendResult) error {
	return w.DB.Write(func(tx *sql.Tx) error {
		var attempts int
		err := tx.QueryRow("SELECT attempts FROM deliveries WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?", claim.row.OccurrenceID, claim.row.Kind, claim.channel, claim.token).Scan(&attempts)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		state, sentAt, delay := result.State, any(nil), 0
		if state == "sent" {
			sentAt = schedule.Timestamp()
		}
		if state == "pending" {
			delay = RetryDelay(attempts, result.RetryDelay)
			if err := w.deferTransport(tx, claim.channel, delay); err != nil {
				return err
			}
			eligible, err := w.deliveryEligible(tx, claim.row, claim.channel)
			if err != nil {
				return err
			}
			if !eligible {
				state = "cancelled"
			} else if attempts >= MaxDeliveryAttempts {
				state = "failed"
			}
		}
		_, err = tx.Exec("UPDATE deliveries SET state=?,sent_at=?,error=?,retry_after=? WHERE occurrence_id=? AND kind=? AND channel=? AND state='sending' AND claim_token=?",
			state, sentAt, nullable(result.Error), nextRetryAt(state, delay), claim.row.OccurrenceID, claim.row.Kind, claim.channel, claim.token)
		return err
	})
}

func (w *ReminderWorker) deliverWebhooks() (bool, error) {
	var count atomic.Int32
	var wg sync.WaitGroup
	errorsOut := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for !w.stopped() && count.Add(1) <= 50 {
				claim, found, err := w.claimWebhook()
				if err != nil {
					errorsOut <- err
					return
				}
				if !found {
					return
				}
				endpoint, send, err := w.prepareWebhook(claim)
				if err != nil {
					errorsOut <- err
					return
				}
				if !send {
					continue
				}
				sender := w.Channels[claim.channel] // explicit transport override for embedded/test workers
				var result SendResult
				if sender != nil {
					result = w.sendWith(sender, claim.row)
				} else {
					settings := &config.Settings{WebhookURL: endpoint.URL, WebhookSecret: endpoint.Secret, WebhookAllowPrivate: endpoint.AllowPrivate}
					client := WebhookClient(settings)
					result = w.sendWith(WebhookSender(settings, client), claim.row)
					client.CloseIdleConnections()
				}
				if err := w.finishWebhook(claim, result); err != nil {
					errorsOut <- err
					return
				}
			}
		}()
	}
	wg.Wait()
	close(errorsOut)
	var err error
	for one := range errorsOut {
		err = errors.Join(err, one)
	}
	return count.Load() >= 50, err
}
