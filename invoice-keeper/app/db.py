from contextlib import contextmanager
from pathlib import Path
import sqlite3

SCHEMA = """
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
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise RuntimeError("Неизвестная версия базы. Запуск остановлен без изменения данных.")
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self, write=False):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        try:
            if write:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()
