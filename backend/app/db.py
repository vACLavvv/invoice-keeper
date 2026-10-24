from contextlib import contextmanager
from pathlib import Path
import sqlite3
import secrets

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
"""

EXTRAS_SCHEMA = """
CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notification_deliveries(
    id INTEGER PRIMARY KEY, occurrence_id INTEGER NOT NULL REFERENCES payment_occurrences(id),
    channel TEXT NOT NULL CHECK(channel IN ('email','webhook','in_app')),
    state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','cancelled')),
    delivery_key TEXT NOT NULL UNIQUE, attempts INTEGER NOT NULL DEFAULT 0,
    attempted_at INTEGER, retry_after INTEGER NOT NULL DEFAULT 0, sent_at TEXT,
    message_id TEXT,error TEXT,UNIQUE(occurrence_id,channel)
);
CREATE TABLE IF NOT EXISTS notification_reads(
    delivery_id INTEGER NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    reader TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(delivery_id,reader)
);
CREATE TABLE IF NOT EXISTS attachments(
    id INTEGER PRIMARY KEY, occurrence_id INTEGER NOT NULL REFERENCES payment_occurrences(id),
    kind TEXT NOT NULL CHECK(kind IN ('file','link')),name TEXT NOT NULL,
    content_type TEXT,url TEXT,data BLOB,size INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,created_at TEXT NOT NULL,
    CHECK((kind='file' AND data IS NOT NULL AND url IS NULL) OR (kind='link' AND url IS NOT NULL AND data IS NULL))
);
CREATE TABLE IF NOT EXISTS telegram_callbacks(update_id INTEGER PRIMARY KEY,response_text TEXT NOT NULL,handled_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS telegram_requests(
    update_id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('sending','sent','uncertain')), message_id INTEGER
);
CREATE INDEX IF NOT EXISTS telegram_requests_created ON telegram_requests(created_at);
CREATE TABLE IF NOT EXISTS telegram_actions(
    token TEXT PRIMARY KEY, chat_id TEXT NOT NULL, actor_id INTEGER NOT NULL,
    request_id INTEGER NOT NULL REFERENCES telegram_requests(update_id) ON DELETE CASCADE,
    message_id INTEGER, payload TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_actions_expiry ON telegram_actions(expires_at);
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)

    def initialize(self):
        self.path.parent.mkdir(mode=0o700,parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1, 2, 3, 4):
                raise RuntimeError("Неизвестная версия базы. Запуск остановлен без изменения данных.")
            conn.executescript(SCHEMA)
            # One atomic, idempotent v1→v2 migration. Existing periods and send states stay intact.
            conn.execute("BEGIN IMMEDIATE")
            for statement in EXTRAS_SCHEMA.split(";"):
                if statement.strip():
                    conn.execute(statement)
            reminder_columns={r[1] for r in conn.execute("PRAGMA table_info(reminders)")}
            for column, sql_type in (("callback_token", "TEXT"),("button_version", "INTEGER NOT NULL DEFAULT 0")):
                if column not in reminder_columns:
                    conn.execute(f"ALTER TABLE reminders ADD COLUMN {column} {sql_type}")
            if "details" not in {r[1] for r in conn.execute("PRAGMA table_info(audit_log)")}:
                conn.execute("ALTER TABLE audit_log ADD COLUMN details TEXT NOT NULL DEFAULT '{}'")
            conn.execute("CREATE INDEX IF NOT EXISTS audit_created ON audit_log(created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS audit_actor ON audit_log(actor,id)")
            conn.execute("CREATE INDEX IF NOT EXISTS audit_action ON audit_log(action,id)")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS reminder_callback_token ON reminders(callback_token) WHERE callback_token IS NOT NULL")
            conn.execute("INSERT OR IGNORE INTO app_meta(key,value) VALUES('installation_id',?)", (secrets.token_hex(16),))
            payment_columns={r[1] for r in conn.execute("PRAGMA table_info(recurring_payments)")}
            if "frequency" not in payment_columns:
                conn.execute("ALTER TABLE recurring_payments ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('monthly','once'))")
            if "notes" not in payment_columns:
                conn.execute("ALTER TABLE recurring_payments ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
            conn.execute("PRAGMA user_version=4")
        self.path.chmod(0o600)
        for suffix in ('-wal','-shm'):
            sidecar=Path(str(self.path)+suffix)
            if sidecar.exists():sidecar.chmod(0o600)

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
