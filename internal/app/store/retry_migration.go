package store

import (
	"database/sql"
	"strings"
)

// Widen the old CHECK in the startup transaction. The payload, ownership token,
// dispatch boundary and foreign keys are preserved; rollback restores the old
// constraint/index if any step fails. No notification is requeued by migration.
func allowFailedReminders(tx *sql.Tx) error {
	var definition string
	if err := tx.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='reminders'").Scan(&definition); err != nil {
		return err
	}
	if strings.Contains(definition, "'failed'") {
		return nil
	}
	for _, query := range []string{
		"DROP INDEX IF EXISTS reminders_pending",
		"ALTER TABLE reminders ADD COLUMN state_v9 TEXT NOT NULL DEFAULT 'pending' CHECK(state_v9 IN ('pending','sending','sent','uncertain','failed','cancelled'))",
		"UPDATE reminders SET state_v9=state",
		"ALTER TABLE reminders DROP COLUMN state",
		"ALTER TABLE reminders RENAME COLUMN state_v9 TO state",
	} {
		if _, err := tx.Exec(query); err != nil {
			return err
		}
	}
	return nil
}
