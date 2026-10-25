package store

import (
	"database/sql"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func TestChangesOnlyAfterNonemptyCommit(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "changes.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ch, stop := db.SubscribeChanges()
	defer stop()
	initial := db.ChangeRevision()
	quiet := func() {
		t.Helper()
		select {
		case <-ch:
			t.Fatal("unexpected invalidation")
		default:
		}
	}
	err = db.Write(func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT INTO app_state(key,value) VALUES('event-test','one')")
		quiet() // uncommitted state must never become visible through the feed
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-ch:
	default:
		t.Fatal("committed write did not publish")
	}
	if got := db.ChangeRevision(); got != initial+1 {
		t.Fatalf("revision = %d", got)
	}
	aborted := errors.New("rollback")
	err = db.Write(func(tx *sql.Tx) error {
		tx.Exec("UPDATE app_state SET value='rollback' WHERE key='event-test'")
		return aborted
	})
	if !errors.Is(err, aborted) {
		t.Fatal(err)
	}
	quiet()
	if err := db.Write(func(tx *sql.Tx) error {
		_, err := tx.Exec("INSERT OR IGNORE INTO app_state(key,value) VALUES('event-test','two')")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(func(tx *sql.Tx) error {
		var value string
		return tx.QueryRow("SELECT value FROM app_state WHERE key='event-test'").Scan(&value)
	}); err != nil {
		t.Fatal(err)
	}
	quiet()
	if db.ChangeRevision() != initial+1 {
		t.Fatal("read/ignored insert/rollback changed revision")
	}
}

func TestChangesCoalesceAndClose(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "changes.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	ch, stop := db.SubscribeChanges()
	for i := 0; i < 500; i++ {
		db.changes.publish()
	}
	if len(ch) != 1 {
		t.Fatalf("slow subscriber has %d queued events", len(ch))
	}
	stop()
	stop()
	closed, stopClosed := db.SubscribeChanges()
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if _, ok := <-closed; ok {
		t.Fatal("DB close did not close subscriber")
	}
	stopClosed()
	revision := db.ChangeRevision()
	if err := db.Write(func(*sql.Tx) error { return nil }); err == nil {
		t.Fatal("write after close succeeded")
	}
	if db.ChangeRevision() != revision {
		t.Fatal("failed write published")
	}
	afterClose, unsubscribe := db.SubscribeChanges()
	defer unsubscribe()
	if _, ok := <-afterClose; ok {
		t.Fatal("subscription to closed DB must close immediately")
	}
}

func TestChangesConcurrentSubscribePublishAndClose(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "changes.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	var workers sync.WaitGroup
	start := make(chan struct{})
	for range 8 {
		workers.Go(func() {
			<-start
			for range 100 {
				ch, stop := db.SubscribeChanges()
				db.changes.publish()
				stop()
				// A pending notification may remain, but unsubscribe always
				// closes the channel even when DB.Close races with it.
				for range ch {
				}
			}
		})
	}
	close(start)
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	workers.Wait()
	revision := db.ChangeRevision()
	db.changes.publish()
	if db.ChangeRevision() != revision {
		t.Fatal("closed feed accepted a publish")
	}
}
