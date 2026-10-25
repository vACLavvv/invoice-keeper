package store

const emailSchema = `
CREATE TABLE IF NOT EXISTS email_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    is_admin INTEGER NOT NULL DEFAULT 0,
    email TEXT NOT NULL, verified_at TEXT, enabled INTEGER NOT NULL DEFAULT 1,
    token_hash TEXT UNIQUE, token_secret TEXT NOT NULL DEFAULT '', expires_at INTEGER,
    requested_at INTEGER NOT NULL, welcome_state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0, attempted_at INTEGER, retry_after INTEGER NOT NULL DEFAULT 0, error TEXT,
    CHECK ((user_id IS NOT NULL AND is_admin=0) OR (user_id IS NULL AND is_admin=1))
);
CREATE UNIQUE INDEX IF NOT EXISTS email_admin ON email_contacts(is_admin) WHERE is_admin=1;
`

// Tables added by later features, created together with the base schema.

const deliverySchema = `
CREATE TABLE IF NOT EXISTS deliveries (
    occurrence_id INTEGER NOT NULL REFERENCES payment_occurrences(id),
    kind TEXT NOT NULL CHECK(kind IN ('due','overdue')),
    channel TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','failed','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0, attempted_at INTEGER, retry_after INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT, error TEXT,
    PRIMARY KEY(occurrence_id, kind, channel)
);
`

const sanctionsSchema = `
CREATE TABLE IF NOT EXISTS sanctioned_addresses (
    address_key TEXT PRIMARY KEY, address TEXT NOT NULL, currency TEXT NOT NULL,
    sdn_uid INTEGER NOT NULL, sdn_name TEXT NOT NULL
);
`

const auditSchema = `
CREATE TABLE IF NOT EXISTS audit_head (
    id INTEGER PRIMARY KEY CHECK(id = 1), last_id INTEGER NOT NULL, last_hash TEXT NOT NULL
);
`

const pairingSchema = `
CREATE TABLE IF NOT EXISTS extension_pairings (
    code_hash TEXT PRIMARY KEY, key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_reads (
    reader TEXT NOT NULL, item TEXT NOT NULL, read_at TEXT NOT NULL,
    PRIMARY KEY(reader, item)
);
`
