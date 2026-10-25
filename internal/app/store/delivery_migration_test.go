package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestMigrationEightPreservesLegacyInFlightDeliveries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "upgrade.sqlite3")
	db, err := OpenDB(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(1,'existing',100,'RUB','2026-01-31',31,'x');
INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(1,1,'2026-01-31',100,'RUB');
INSERT INTO reminders(occurrence_id,state,attempts,attempted_at) VALUES(1,'sending',2,12345);
INSERT INTO deliveries(occurrence_id,kind,channel,state,attempts,attempted_at) VALUES(1,'due','telegram:123','sending',3,12346);
ALTER TABLE reminders DROP COLUMN claim_token;
ALTER TABLE reminders DROP COLUMN dispatch_started_at;
ALTER TABLE deliveries DROP COLUMN claim_token;
ALTER TABLE deliveries DROP COLUMN dispatch_started_at;
ALTER TABLE email_contacts DROP COLUMN claim_token;
PRAGMA user_version=7;`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = OpenDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil || version != 8 {
		t.Fatalf("migration version=%d: %v", version, err)
	}
	for _, table := range []string{"reminders", "deliveries"} {
		var state string
		var attempted, dispatched int64
		var token sql.NullString
		if err := db.QueryRow("SELECT state,attempted_at,dispatch_started_at,claim_token FROM "+table).Scan(&state, &attempted, &dispatched, &token); err != nil {
			t.Fatal(err)
		}
		if state != "sending" || dispatched != attempted || token.Valid {
			t.Fatalf("%s changed legacy claim: %s %d %d %+v", table, state, attempted, dispatched, token)
		}
	}
	var integrity string
	if err := db.QueryRow("PRAGMA quick_check").Scan(&integrity); err != nil || integrity != "ok" {
		t.Fatalf("integrity %s %v", integrity, err)
	}
}
