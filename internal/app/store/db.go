// Package store opens the SQLite database, creates and upgrades the schema and runs writes
// in immediate transactions.
package store

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
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
-- v2: keys for the browser extension and the payments it finds.
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, name TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, is_admin INTEGER NOT NULL DEFAULT 0,
    admin_fingerprint TEXT, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_suggestions (
    id INTEGER PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, source_url TEXT, title TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), currency TEXT NOT NULL CHECK(currency IN ('RUB','USD','EUR')),
    next_due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
    submitted_by TEXT NOT NULL, recurring_payment_id INTEGER REFERENCES recurring_payments(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
);
-- v3: pauses, receipts, Telegram accounts linked to panel users, personal reminders.
CREATE TABLE IF NOT EXISTS payment_pauses (
    id INTEGER PRIMARY KEY, recurring_payment_id INTEGER NOT NULL REFERENCES recurring_payments(id),
    from_date TEXT NOT NULL, until_date TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY, occurrence_id INTEGER NOT NULL REFERENCES payment_occurrences(id),
    kind TEXT NOT NULL CHECK(kind IN ('link','file')), url TEXT, file_name TEXT, content_type TEXT,
    size INTEGER, data BLOB, created_by TEXT NOT NULL, author_user_id INTEGER, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS receipts_occurrence ON receipts(occurrence_id);
CREATE TABLE IF NOT EXISTS telegram_links (
    id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    is_admin INTEGER NOT NULL DEFAULT 0, telegram_user_id INTEGER NOT NULL UNIQUE, chat_id INTEGER NOT NULL,
    username TEXT, linked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_admin INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_reminders (
    occurrence_id INTEGER NOT NULL REFERENCES payment_occurrences(id), chat_id INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('sending','sent','failed')), sent_at TEXT, error TEXT,
    PRIMARY KEY(occurrence_id, chat_id)
);
`

// columns added to existing tables after v1; ALTER TABLE runs only where a column is missing.
var addedColumns = []struct{ table, column, definition string }{
	{"deliveries", "recipient", "TEXT"},
	{"recurring_payments", "frequency", frequencyColumn},
	{"recurring_payments", "category", "TEXT"},
	{"recurring_payments", "assignee_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"},
	{"recurring_payments", "payment_url", "TEXT"},
	{"recurring_payments", "payment_details", "TEXT"},
	// v4: session devices for «Аккаунт», API tokens for scripts (see app/sessions.go).
	{"sessions", "created_at", "INTEGER"},
	{"sessions", "last_seen_at", "INTEGER"},
	{"sessions", "user_agent", "TEXT"},
	{"sessions", "ip", "TEXT"},
	{"api_keys", "access", "TEXT NOT NULL DEFAULT 'extension' CHECK(access IN ('extension','read','write'))"},
	{"api_keys", "expires_at", "INTEGER"},
	// Payee crypto wallet, screened against the OFAC list (package wallet); wallet_key is the comparison form.
	{"recurring_payments", "wallet_network", "TEXT"},
	{"recurring_payments", "wallet_address", "TEXT"},
	{"recurring_payments", "wallet_key", "TEXT"},
	// Tamper-evident journal (package audit).
	{"audit_log", "hash", "TEXT"},
	{"audit_log", "chain", "TEXT"},
	// v5: one-time payments (frequency 'once', see allowOneTime) and «За что платим».
	{"recurring_payments", "description", "TEXT"},
	// v6: reversible removal, separate from archiving (deleted_at).
	{"recurring_payments", "removed_at", "TEXT"},
	{"payment_occurrences", "removed_at", "TEXT"},
}

const frequencyColumn = "TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('monthly','quarterly','yearly','once'))"

// allowOneTime widens the frequency CHECK of databases created before v5. SQLite cannot change
// a column constraint in place, so the column is replaced: add, copy, drop, rename — in the
// caller's transaction, so a failure leaves the database as it was.
func allowOneTime(tx *sql.Tx) error {
	var table string
	if err := tx.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='recurring_payments'").Scan(&table); err != nil {
		return err
	}
	if strings.Contains(table, "'once'") {
		return nil
	}
	for _, statement := range []string{
		"ALTER TABLE recurring_payments ADD COLUMN frequency_v5 " + strings.ReplaceAll(frequencyColumn, "frequency IN", "frequency_v5 IN"),
		"UPDATE recurring_payments SET frequency_v5=frequency",
		"ALTER TABLE recurring_payments DROP COLUMN frequency",
		"ALTER TABLE recurring_payments RENAME COLUMN frequency_v5 TO frequency",
	} {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}

const schemaVersion = 7

// DB wraps SQLite. Every write runs in a BEGIN IMMEDIATE transaction, so writers
// (requests, reminder workers, other processes) are serialized by SQLite itself.
type DB struct {
	*sql.DB
	Path    string
	changes changeFeed
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
	// Older versions are upgraded in place: later versions only add tables and nullable/defaulted columns.
	if version < 0 || version > schemaVersion {
		return errors.New("Неизвестная версия базы. Запуск остановлен без изменения данных.")
	}
	return db.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec(schema + deliverySchema + sanctionsSchema + auditSchema + pairingSchema + emailSchema); err != nil {
			return err
		}
		for _, c := range addedColumns {
			var exists int
			if err := tx.QueryRow("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?", c.table, c.column).Scan(&exists); err != nil {
				return err
			}
			if exists == 0 {
				if _, err := tx.Exec("ALTER TABLE " + c.table + " ADD COLUMN " + c.column + " " + c.definition); err != nil {
					return err
				}
			}
		}
		if err := allowOneTime(tx); err != nil {
			return err
		}
		_, err := tx.Exec("PRAGMA user_version=" + strconv.Itoa(schemaVersion))
		return err
	})
}

// Write runs fn in an immediate transaction and commits unless fn returns an error.
func (db *DB) Write(fn func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// SQLite's counter belongs to this transaction's connection. Ignored inserts
	// and read-only transactions do not change it, unlike a generic "request done"
	// signal, which would create an SSE -> GET -> SSE refresh loop.
	var before, after int64
	if err := tx.QueryRow("SELECT total_changes()").Scan(&before); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.QueryRow("SELECT total_changes()").Scan(&after); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if after > before {
		db.changes.publish()
	}
	return nil
}

func IsUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// Querier is a *sql.DB or a *sql.Tx: helpers that run inside or outside a transaction take it.
type Querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

// SetState stores a value in app_state (bot offsets, list dates, secrets already encrypted by the caller).
func SetState(q Querier, key, value string) error {
	_, err := q.Exec("INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value)
	return err
}

// State reads a value from app_state; a missing key is "".
func State(q Querier, key string) (string, error) {
	var value string
	err := q.QueryRow("SELECT value FROM app_state WHERE key=?", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}
