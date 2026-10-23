package app

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_admin INTEGER NOT NULL DEFAULT 0, admin_fingerprint TEXT,
    csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recurring_payments (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    currency TEXT NOT NULL CHECK(currency IN ('RUB','USD','EUR')),
    first_due_date TEXT NOT NULL, anchor_day INTEGER NOT NULL,
    next_index INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_occurrences (
    id INTEGER PRIMARY KEY, recurring_payment_id INTEGER NOT NULL REFERENCES recurring_payments(id),
    due_date TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
    paid_at TEXT, updated_by TEXT, updated_at TEXT,
    UNIQUE(recurring_payment_id, due_date)
);
CREATE INDEX IF NOT EXISTS occurrences_due ON payment_occurrences(due_date);
CREATE TABLE IF NOT EXISTS reminders (
    occurrence_id INTEGER PRIMARY KEY REFERENCES payment_occurrences(id),
    state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0, attempted_at INTEGER,
    retry_after INTEGER NOT NULL DEFAULT 0, sent_at TEXT, message_id TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS auth_attempts (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
    entity TEXT NOT NULL, created_at TEXT NOT NULL
);
PRAGMA user_version=1;
`

// DB wraps SQLite. Every write runs in a BEGIN IMMEDIATE transaction, so writers
// (requests, reminder workers, other processes) are serialized by SQLite itself.
type DB struct {
	*sql.DB
	Path string
}

func OpenDB(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	query := url.Values{}
	for _, pragma := range []string{"foreign_keys(1)", "busy_timeout(15000)", "journal_mode(WAL)"} {
		query.Add("_pragma", pragma)
	}
	query.Set("_txlock", "immediate")
	dsn := "file:" + filepath.ToSlash(path) + "?" + query.Encode()
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(8)
	db := &DB{DB: conn, Path: path}
	if err := db.initialize(); err != nil {
		conn.Close()
		return nil, err
	}
	return db, nil
}

func (db *DB) initialize() error {
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	if version != 0 && version != 1 {
		return errors.New("Неизвестная версия базы. Запуск остановлен без изменения данных.")
	}
	_, err := db.Exec(schema)
	return err
}

// Write runs fn in an immediate transaction and commits unless fn returns an error.
func (db *DB) Write(fn func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
