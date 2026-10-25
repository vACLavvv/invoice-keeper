package store

import (
	"path/filepath"
	"testing"
)

func TestMigrationNinePreservesReminderAttemptAndAddsFailed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "retry.sqlite3")
	db, err := OpenDB(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(1,'existing',100,'RUB','2026-01-31',31,'x');
INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency) VALUES(1,1,'2026-01-31',100,'RUB');
DROP TABLE reminders;
CREATE TABLE reminders(occurrence_id INTEGER PRIMARY KEY REFERENCES payment_occurrences(id),state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','cancelled')),attempts INTEGER NOT NULL DEFAULT 0,attempted_at INTEGER,retry_after INTEGER NOT NULL DEFAULT 0,sent_at TEXT,message_id TEXT,error TEXT,claim_token TEXT,dispatch_started_at INTEGER);
INSERT INTO reminders VALUES(1,'sending',3,123,999,NULL,'message','existing error','attempt-token',124);
PRAGMA user_version=8;`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = OpenDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var state, token, message, reason string
	var attempts, attempted, dispatched, retry int
	if err := db.QueryRow("SELECT state,claim_token,message_id,error,attempts,attempted_at,dispatch_started_at,retry_after FROM reminders").Scan(&state, &token, &message, &reason, &attempts, &attempted, &dispatched, &retry); err != nil {
		t.Fatal(err)
	}
	if state != "sending" || token != "attempt-token" || message != "message" || reason != "existing error" || attempts != 3 || attempted != 123 || dispatched != 124 || retry != 999 {
		t.Fatal("migration changed an attempt")
	}
	if _, err := db.Exec("UPDATE reminders SET state='failed'"); err != nil {
		t.Fatal(err)
	}
	var count, version int
	if err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE name='reminders_pending'").Scan(&count); err != nil || count != 1 {
		t.Fatal("pending index missing", err)
	}
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil || version != schemaVersion {
		t.Fatal("version", version, err)
	}
	var integrity string
	if err := db.QueryRow("PRAGMA quick_check").Scan(&integrity); err != nil || integrity != "ok" {
		t.Fatal(integrity, err)
	}
}
