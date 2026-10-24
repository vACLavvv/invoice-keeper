package app

// Tamper-evident journal: every entry carries an HMAC of its fields and of the previous entry's
// hash, and app_state keeps the head (last id and hash). Editing, inserting or deleting an entry
// breaks the chain from that point; cutting entries off the end no longer matches the head.
// With DATA_ENCRYPTION_KEY the HMAC key is derived from it and is not in the database, so even
// someone who can write to the database cannot rebuild the chain ("k"). Without it the key lives
// in app_state ("s") — that catches accidental and careless edits, not a determined attacker.

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

const auditSchema = `
CREATE TABLE IF NOT EXISTS audit_head (
    id INTEGER PRIMARY KEY CHECK(id = 1), last_id INTEGER NOT NULL, last_hash TEXT NOT NULL
);
`

func auditKey(q querier, kind string) ([]byte, error) {
	if kind == "k" {
		if dataKey == nil {
			return nil, errors.New("журнал подписан ключом DATA_ENCRYPTION_KEY, а он не задан")
		}
		return subkey("audit"), nil
	}
	var stored string
	err := q.QueryRow("SELECT value FROM app_state WHERE key='audit_chain_key'").Scan(&stored)
	if errors.Is(err, sql.ErrNoRows) {
		stored = randomHex(32)
		if err := setState(q, "audit_chain_key", stored); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return hex.DecodeString(stored)
}

func currentAuditKind() string {
	if dataKey != nil {
		return "k"
	}
	return "s"
}

func auditHash(key []byte, prev, actor, action, entity, created string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(strings.Join([]string{prev, actor, action, entity, created}, "\x1f")))
	return hex.EncodeToString(mac.Sum(nil))
}

// audit appends an entry. It runs inside the caller's write transaction, so entries are chained in order.
func audit(q querier, actor, action string, entity any) error {
	var prev sql.NullString
	if err := q.QueryRow("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").Scan(&prev); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	kind := currentAuditKind()
	key, err := auditKey(q, kind)
	if err != nil {
		return err
	}
	created, text := timestamp(), fmt.Sprint(entity)
	hash := auditHash(key, prev.String, actor, action, text, created)
	result, err := q.Exec("INSERT INTO audit_log(actor,action,entity,created_at,hash,chain) VALUES(?,?,?,?,?,?)", actor, action, text, created, hash, kind)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	_, err = q.Exec(`INSERT INTO audit_head(id,last_id,last_hash) VALUES(1,?,?)
		ON CONFLICT(id) DO UPDATE SET last_id=excluded.last_id,last_hash=excluded.last_hash`, id, hash)
	return err
}

// sealAuditLog chains entries written before this version, in order, once.
func sealAuditLog(db *DB) error {
	return db.Write(func(tx *sql.Tx) error {
		var unsealed int
		if err := tx.QueryRow("SELECT COUNT(*) FROM audit_log WHERE hash IS NULL").Scan(&unsealed); err != nil || unsealed == 0 {
			return err
		}
		rows, err := tx.Query("SELECT id,actor,action,entity,created_at,hash FROM audit_log ORDER BY id")
		if err != nil {
			return err
		}
		type entry struct {
			id                             int64
			actor, action, entity, created string
			hash                           sql.NullString
		}
		var entries []entry
		for rows.Next() {
			var e entry
			if err := rows.Scan(&e.id, &e.actor, &e.action, &e.entity, &e.created, &e.hash); err != nil {
				rows.Close()
				return err
			}
			entries = append(entries, e)
		}
		rows.Close()
		kind := currentAuditKind()
		key, err := auditKey(tx, kind)
		if err != nil {
			return err
		}
		prev := ""
		for _, e := range entries {
			if !e.hash.Valid {
				e.hash.String = auditHash(key, prev, e.actor, e.action, e.entity, e.created)
				if _, err := tx.Exec("UPDATE audit_log SET hash=?,chain=? WHERE id=?", e.hash.String, kind, e.id); err != nil {
					return err
				}
			}
			prev = e.hash.String
		}
		last := entries[len(entries)-1]
		_, err = tx.Exec(`INSERT INTO audit_head(id,last_id,last_hash) VALUES(1,?,?)
			ON CONFLICT(id) DO UPDATE SET last_id=excluded.last_id,last_hash=excluded.last_hash`, last.id, prev)
		return err
	})
}

type auditCheck struct {
	OK       bool   `json:"ok"`
	Checked  int    `json:"checked"`
	BrokenID *int64 `json:"broken_id"`
	Reason   string `json:"reason,omitempty"`
	Keyed    bool   `json:"keyed"` // the chain is signed with a key outside the database
}

// verifyAuditLog walks the whole chain and the head.
func verifyAuditLog(q querier) (auditCheck, error) {
	check := auditCheck{OK: true, Keyed: dataKey != nil}
	rows, err := q.Query("SELECT id,actor,action,entity,created_at,COALESCE(hash,''),COALESCE(chain,'') FROM audit_log ORDER BY id")
	if err != nil {
		return check, err
	}
	defer rows.Close()
	keys := map[string][]byte{}
	prev := ""
	var lastID int64
	fail := func(id int64, reason string) {
		if check.OK {
			check.OK, check.BrokenID, check.Reason = false, &id, reason
		}
	}
	for rows.Next() {
		var id int64
		var actor, action, entity, created, hash, kind string
		if err := rows.Scan(&id, &actor, &action, &entity, &created, &hash, &kind); err != nil {
			return check, err
		}
		check.Checked++
		if keys[kind] == nil && (kind == "k" || kind == "s") {
			if keys[kind], err = auditKey(q, kind); err != nil {
				return check, err
			}
		}
		switch {
		case keys[kind] == nil:
			fail(id, "запись без подписи")
		case !hmac.Equal([]byte(hash), []byte(auditHash(keys[kind], prev, actor, action, entity, created))):
			fail(id, "запись изменена, вставлена или перед ней удалены записи")
		}
		prev, lastID = hash, id
	}
	if err := rows.Err(); err != nil {
		return check, err
	}
	var headID int64
	var headHash string
	err = q.QueryRow("SELECT last_id,last_hash FROM audit_head WHERE id=1").Scan(&headID, &headHash)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		if check.Checked > 0 {
			fail(lastID, "нет якоря журнала")
		}
	case err != nil:
		return check, err
	case headID != lastID || headHash != prev:
		fail(lastID, "удалены последние записи журнала")
	}
	return check, nil
}

func (s *Server) auditVerify(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	check, err := verifyAuditLog(s.DB)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, check)
}
