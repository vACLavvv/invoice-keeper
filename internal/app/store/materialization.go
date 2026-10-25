package store

// Invalidation is transactional and survives restarts / other DB connections.
// next_index is included deliberately: materialization clears its own dirty flag
// only after every plan succeeds. A rollback never publishes a clean cache.
const materializationSchema = `
CREATE INDEX IF NOT EXISTS occurrences_visible_due ON payment_occurrences(due_date,id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS occurrences_visible_paid ON payment_occurrences(paid_at,due_date,id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS recurring_visible_active ON recurring_payments(active,id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS pauses_payment ON payment_pauses(recurring_payment_id,from_date);
CREATE TRIGGER IF NOT EXISTS materialize_recurring_insert AFTER INSERT ON recurring_payments BEGIN
 INSERT INTO app_state(key,value) VALUES('periods_materialization_dirty','1') ON CONFLICT(key) DO UPDATE SET value='1' WHERE value<>'1';
END;
CREATE TRIGGER IF NOT EXISTS materialize_recurring_update AFTER UPDATE ON recurring_payments BEGIN
 INSERT INTO app_state(key,value) VALUES('periods_materialization_dirty','1') ON CONFLICT(key) DO UPDATE SET value='1' WHERE value<>'1';
END;
CREATE TRIGGER IF NOT EXISTS materialize_recurring_delete AFTER DELETE ON recurring_payments BEGIN
 INSERT INTO app_state(key,value) VALUES('periods_materialization_dirty','1') ON CONFLICT(key) DO UPDATE SET value='1' WHERE value<>'1';
END;
CREATE TRIGGER IF NOT EXISTS materialize_pause_insert AFTER INSERT ON payment_pauses BEGIN
 INSERT INTO app_state(key,value) VALUES('periods_materialization_dirty','1') ON CONFLICT(key) DO UPDATE SET value='1' WHERE value<>'1';
END;
CREATE TRIGGER IF NOT EXISTS materialize_pause_update AFTER UPDATE ON payment_pauses BEGIN
 INSERT INTO app_state(key,value) VALUES('periods_materialization_dirty','1') ON CONFLICT(key) DO UPDATE SET value='1' WHERE value<>'1';
END;
CREATE TRIGGER IF NOT EXISTS materialize_pause_delete AFTER DELETE ON payment_pauses BEGIN
 INSERT INTO app_state(key,value) VALUES('periods_materialization_dirty','1') ON CONFLICT(key) DO UPDATE SET value='1' WHERE value<>'1';
END;
`
