package store

// The response and business mutation commit together. Expired keys are removed
// opportunistically; response payloads use the application's field encryption.
const idempotencySchema = `
CREATE TABLE IF NOT EXISTS idempotency_keys (
 principal TEXT NOT NULL, key_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
 status INTEGER NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(principal,key_hash)
);
CREATE INDEX IF NOT EXISTS idempotency_expiry ON idempotency_keys(expires_at);
`
