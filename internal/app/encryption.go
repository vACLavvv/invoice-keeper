package app

import (
	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

// ConfigureEncryption sets the key for this process, checks it against the database and encrypts
// values stored before the key existed. Without a key it refuses a database that holds encrypted data.
// It also chains journal entries left from before the tamper-evident journal (package audit).
func ConfigureEncryption(db *store.DB, key []byte) error {
	if err := security.ConfigureKey(db, key); err != nil {
		return err
	}
	return audit.Seal(db)
}
