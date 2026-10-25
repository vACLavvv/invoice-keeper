package store

// v10: removed endpoints retain their delivery history. AUTOINCREMENT prevents
// a new destination from inheriting the identity of a removed one.
const webhookSchema = `
CREATE TABLE IF NOT EXISTS webhook_endpoints (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL DEFAULT '', url_key TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 notify_due INTEGER NOT NULL DEFAULT 1 CHECK(notify_due IN (0,1)),
 notify_overdue INTEGER NOT NULL DEFAULT 1 CHECK(notify_overdue IN (0,1)),
 allow_private INTEGER NOT NULL DEFAULT 0 CHECK(allow_private IN (0,1)),
 legacy_source INTEGER NOT NULL DEFAULT 0 CHECK(legacy_source IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_endpoints_live_url ON webhook_endpoints(url_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS webhook_endpoints_active ON webhook_endpoints(enabled,deleted_at,id);
CREATE INDEX IF NOT EXISTS deliveries_channel_pending ON deliveries(channel,state,retry_after,occurrence_id);
CREATE INDEX IF NOT EXISTS deliveries_channel_history ON deliveries(channel,attempted_at DESC,occurrence_id DESC,kind);
`
