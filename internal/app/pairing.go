package app

// Connecting the browser extension without copying a key. The extension makes a random code and
// opens /extension?connect=<code> in the panel; the signed-in user confirms there, the server issues
// an extension key and parks it under the code's hash for ten minutes; the extension claims it once.
// The code is 256 random bits known only to the extension, so it cannot be guessed, and claiming
// burns it. A key that was never claimed is deleted with its pairing.
//
// Key lifetime: extension keys expire after a year unless chosen otherwise, and any key or token
// unused for KEY_IDLE_DAYS (90 by default) stops working and is removed.

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"time"
)

const pairingSchema = `
CREATE TABLE IF NOT EXISTS extension_pairings (
    code_hash TEXT PRIMARY KEY, key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
`

const (
	pairingTTL           = 10 * time.Minute
	extensionKeyLifetime = 365 // days, when the extension key is created without an explicit choice
)

var pairingCode = regexp.MustCompile(`^[A-Za-z0-9_-]{40,128}$`)

// issueKey stores a new key for the user and returns its id and token (shown or handed over once).
func (s *Server) issueKey(tx *sql.Tx, user *User, name, access string, days *int64) (apiKey, string, error) {
	token := keyPrefix + randomToken(24)
	created := apiKey{Name: name, Prefix: token[:len(keyPrefix)+6], Access: access, CreatedAt: timestamp()}
	var expires any
	if days != nil {
		at := time.Now().Add(time.Duration(*days) * 24 * time.Hour).Unix()
		expires, created.ExpiresAt = at, unixTime(sql.NullInt64{Int64: at, Valid: true})
	}
	where, args := ownerClause(user)
	var count int
	if err := tx.QueryRow("SELECT COUNT(*) FROM api_keys WHERE "+where, args...).Scan(&count); err != nil { // #nosec G202 -- where is a constant clause
		return created, "", err
	}
	if count >= maxKeysPerOwner {
		return created, "", fail(409, "Слишком много ключей. Удалите ненужные")
	}
	var userID, fingerprint any
	if user.Role == "admin" {
		fingerprint = s.adminFingerprint()
	} else {
		userID = user.ID
	}
	result, err := tx.Exec("INSERT INTO api_keys(token_hash,prefix,name,user_id,is_admin,admin_fingerprint,access,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
		digest(token), created.Prefix, created.Name, userID, user.Role == "admin", fingerprint, created.Access, expires, created.CreatedAt)
	if err != nil {
		return created, "", err
	}
	if created.ID, err = result.LastInsertId(); err != nil {
		return created, "", err
	}
	return created, token, audit(tx, user.Username, "api_key.create", created.ID)
}

// pairingsCreate: the signed-in user confirms connecting an extension that showed this code.
func (s *Server) pairingsCreate(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	f, err := readForm(r, "code", "device")
	if err != nil {
		return err
	}
	f.require("code")
	code := f.text("code", textRule{min: 40, max: 128, pattern: pairingCode})
	device := f.text("device", textRule{trim: true, max: 40})
	if err := f.err(); err != nil {
		return err
	}
	name := "Расширение"
	if device != nil && *device != "" {
		name += " · " + *device
	}
	days := int64(extensionKeyLifetime)
	var created apiKey
	err = s.DB.Write(func(tx *sql.Tx) error {
		var exists int
		if err := tx.QueryRow("SELECT COUNT(*) FROM extension_pairings WHERE code_hash=?", digest(*code)).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			return fail(409, "Это подключение уже подтверждено. Вернитесь в расширение")
		}
		key, token, err := s.issueKey(tx, user, name, "extension", &days)
		if err != nil {
			return err
		}
		created = key
		_, err = tx.Exec("INSERT INTO extension_pairings(code_hash,key_id,token,expires_at) VALUES(?,?,?,?)",
			digest(*code), key.ID, encryptText("extension_pairings.token", token), time.Now().Add(pairingTTL).Unix())
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 201, created)
}

// pairingsClaim hands the key to the extension once. 202 — not confirmed yet (or an unknown code:
// the two are indistinguishable on purpose).
func (s *Server) pairingsClaim(w http.ResponseWriter, r *http.Request) error {
	f, err := readForm(r, "code")
	if err != nil {
		return err
	}
	f.require("code")
	code := f.text("code", textRule{min: 40, max: 128, pattern: pairingCode})
	if err := f.err(); err != nil {
		return err
	}
	var sealed string
	var keyID int64
	err = s.DB.Write(func(tx *sql.Tx) error {
		err := tx.QueryRow("SELECT key_id,token FROM extension_pairings WHERE code_hash=? AND expires_at>?", digest(*code), time.Now().Unix()).Scan(&keyID, &sealed)
		if err != nil {
			return err
		}
		_, err = tx.Exec("DELETE FROM extension_pairings WHERE code_hash=?", digest(*code))
		return err
	})
	if errors.Is(err, sql.ErrNoRows) {
		return writeJSON(w, 202, map[string]string{"status": "pending"})
	}
	if err != nil {
		return err
	}
	token, err := decryptText("extension_pairings.token", sealed)
	if err != nil {
		return err
	}
	r.Header.Set("Authorization", "Bearer "+token)
	user, err := s.keyUser(r)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{"status": "connected", "token": token, "username": user.Username, "display_name": user.DisplayName})
}

// cleanupKeys removes unclaimed pairings with their keys, expired keys and keys idle for too long.
func cleanupKeys(tx *sql.Tx, idleDays int, now time.Time) error {
	var removed int64
	for _, st := range []stmt{
		{"DELETE FROM api_keys WHERE id IN (SELECT key_id FROM extension_pairings WHERE expires_at<=?)", []any{now.Unix()}},
		{"DELETE FROM api_keys WHERE expires_at IS NOT NULL AND expires_at<=?", []any{now.Unix()}},
	} {
		result, err := tx.Exec(st.query, st.args...)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		removed += n
	}
	if idleDays > 0 {
		result, err := tx.Exec("DELETE FROM api_keys WHERE COALESCE(last_used_at,created_at)<? AND id NOT IN (SELECT key_id FROM extension_pairings)",
			idleCutoff(idleDays, now))
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		removed += n
	}
	if removed == 0 {
		return nil
	}
	return audit(tx, "server", "api_key.expire", removed)
}

// idleCutoff is the oldest last use still allowed, in the timestamp() format (sortable as text).
func idleCutoff(idleDays int, now time.Time) string {
	return now.UTC().AddDate(0, 0, -idleDays).Format("2006-01-02T15:04:05.000000-07:00")
}
