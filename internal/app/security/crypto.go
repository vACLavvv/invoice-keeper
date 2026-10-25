package security

// Encryption at rest for the most sensitive values: the admin TOTP secret, receipt files and links,
// payment details (bank requisites). XChaCha20-Poly1305 with a random 24-byte nonce; the field name
// is the associated data, so a ciphertext copied into another column does not decrypt. The key is
// DATA_ENCRYPTION_KEY (32 bytes, base64) and never stored in the database: a leaked database file
// or backup without .env reveals none of these values.

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/hkdf"

	"invoice-keeper/internal/app/store"
)

const (
	TextPrefix  = "enc:v1:"
	BlobPrefix  = "IKENC1"
	canaryState = "encryption_check"
	canaryValue = "invoice-keeper"
)

// dataKey is the encryption key of this process; nil — values are stored as they are.
var dataKey []byte

// ParseEncryptionKey decodes DATA_ENCRYPTION_KEY: 32 bytes in standard or URL-safe base64.
func ParseEncryptionKey(value string) ([]byte, error) {
	if value == "" {
		return nil, nil
	}
	for _, encoding := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if key, err := encoding.DecodeString(value); err == nil && len(key) == chacha20poly1305.KeySize {
			return key, nil
		}
	}
	return nil, errors.New("DATA_ENCRYPTION_KEY должен быть 32 байтами в base64. Новый ключ: invoice-keeper keygen")
}

// NewEncryptionKey returns a random key in the DATA_ENCRYPTION_KEY format.
func NewEncryptionKey() string {
	return base64.StdEncoding.EncodeToString(RandomBytes(chacha20poly1305.KeySize))
}

// Subkey derives a separate key for another purpose (the audit chain), so one key is never used twice.
func Subkey(purpose string) []byte {
	out := make([]byte, 32)
	io.ReadFull(hkdf.New(sha256.New, dataKey, nil, []byte("invoice-keeper/"+purpose)), out)
	return out
}

func seal(field string, plain []byte) []byte {
	aead, _ := chacha20poly1305.NewX(dataKey)
	nonce := RandomBytes(chacha20poly1305.NonceSizeX)
	return append(nonce, aead.Seal(nil, nonce, plain, []byte(field))...)
}

func unseal(field string, sealed []byte) ([]byte, error) {
	aead, _ := chacha20poly1305.NewX(dataKey)
	if len(sealed) < chacha20poly1305.NonceSizeX+aead.Overhead() {
		return nil, errors.New("зашифрованное значение повреждено")
	}
	nonce, body := sealed[:chacha20poly1305.NonceSizeX], sealed[chacha20poly1305.NonceSizeX:]
	plain, err := aead.Open(nil, nonce, body, []byte(field))
	if err != nil {
		return nil, fmt.Errorf("не удалось расшифровать %s: неверный DATA_ENCRYPTION_KEY или данные изменены", field)
	}
	return plain, nil
}

// EncryptText returns the stored form of a text value; empty stays empty.
func EncryptText(field, value string) string {
	if dataKey == nil || value == "" || IsSealedText(value) {
		return value
	}
	return TextPrefix + base64.RawURLEncoding.EncodeToString(seal(field, []byte(value)))
}

func IsSealedText(value string) bool {
	return len(value) > len(TextPrefix) && value[:len(TextPrefix)] == TextPrefix
}

// DecryptText reverses EncryptText; plain values (stored before the key was set) pass through.
func DecryptText(field, value string) (string, error) {
	if !IsSealedText(value) {
		return value, nil
	}
	if dataKey == nil {
		return "", errors.New("в базе есть зашифрованные данные, но DATA_ENCRYPTION_KEY не задан")
	}
	sealed, err := base64.RawURLEncoding.DecodeString(value[len(TextPrefix):])
	if err != nil {
		return "", errors.New("зашифрованное значение повреждено")
	}
	plain, err := unseal(field, sealed)
	return string(plain), err
}

func EncryptBlob(field string, data []byte) []byte {
	if dataKey == nil || len(data) == 0 || bytes.HasPrefix(data, []byte(BlobPrefix)) {
		return data
	}
	return append([]byte(BlobPrefix), seal(field, data)...)
}

func DecryptBlob(field string, data []byte) ([]byte, error) {
	if !bytes.HasPrefix(data, []byte(BlobPrefix)) {
		return data, nil
	}
	if dataKey == nil {
		return nil, errors.New("в базе есть зашифрованные данные, но DATA_ENCRYPTION_KEY не задан")
	}
	return unseal(field, data[len(BlobPrefix):])
}

// DecryptNullable decrypts a nullable column in place.
func DecryptNullable(field string, value **string) error {
	if *value == nil {
		return nil
	}
	plain, err := DecryptText(field, **value)
	if err != nil {
		return err
	}
	*value = &plain
	return nil
}

// ConfigureKey sets the key for this process, checks it against the database and encrypts values
// stored before the key existed. Without a key it refuses a database that holds encrypted data.
func ConfigureKey(db *store.DB, key []byte) error {
	dataKey = key
	return db.Write(func(tx *sql.Tx) error {
		var canary string
		err := tx.QueryRow("SELECT value FROM app_state WHERE key=?", canaryState).Scan(&canary)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			if key == nil {
				return nil
			}
			if err := store.SetState(tx, canaryState, EncryptText(canaryState, canaryValue)); err != nil {
				return err
			}
		case err != nil:
			return err
		case key == nil:
			return errors.New("база зашифрована: задайте прежний DATA_ENCRYPTION_KEY в .env")
		default:
			plain, err := DecryptText(canaryState, canary)
			if err != nil || !hmac.Equal([]byte(plain), []byte(canaryValue)) {
				return errors.New("DATA_ENCRYPTION_KEY не подходит к этой базе. Верните прежний ключ")
			}
		}
		return encryptExisting(tx)
	})
}

// encryptExisting seals plain values left from before the key was set; sealed ones are skipped.
func encryptExisting(tx *sql.Tx) error {
	for _, key := range []string{"admin_totp_secret", "admin_totp_pending"} {
		var value string
		if err := tx.QueryRow("SELECT value FROM app_state WHERE key=?", key).Scan(&value); err == nil && !IsSealedText(value) {
			if err := store.SetState(tx, key, EncryptText("app_state."+key, value)); err != nil {
				return err
			}
		}
	}
	type pending struct {
		id    int64
		value string
	}
	textColumns := []struct{ table, column string }{{"recurring_payments", "payment_details"}, {"receipts", "url"}, {"email_contacts", "token_secret"}, {"idempotency_keys", "response"}, {"webhook_endpoints", "url"}, {"webhook_endpoints", "secret"}}
	for _, c := range textColumns {
		identifier := "id"
		if c.table == "idempotency_keys" {
			identifier = "rowid"
		}
		rows, err := tx.Query("SELECT " + identifier + "," + c.column + " FROM " + c.table + " WHERE " + c.column + " IS NOT NULL AND " + c.column + " NOT LIKE 'enc:v1:%'") // #nosec G202 -- constant names
		if err != nil {
			return err
		}
		var todo []pending
		for rows.Next() {
			var p pending
			if err := rows.Scan(&p.id, &p.value); err != nil {
				rows.Close()
				return err
			}
			todo = append(todo, p)
		}
		rows.Close()
		for _, p := range todo {
			if _, err := tx.Exec("UPDATE "+c.table+" SET "+c.column+"=? WHERE "+identifier+"=?", EncryptText(c.table+"."+c.column, p.value), p.id); err != nil { // #nosec G202 -- constant names
				return err
			}
		}
	}
	rows, err := tx.Query("SELECT id,data FROM receipts WHERE data IS NOT NULL AND substr(data,1,6)<>CAST(? AS BLOB)", BlobPrefix)
	if err != nil {
		return err
	}
	var files []struct {
		id   int64
		data []byte
	}
	for rows.Next() {
		var f struct {
			id   int64
			data []byte
		}
		if err := rows.Scan(&f.id, &f.data); err != nil {
			rows.Close()
			return err
		}
		files = append(files, f)
	}
	rows.Close()
	for _, f := range files {
		if _, err := tx.Exec("UPDATE receipts SET data=? WHERE id=?", EncryptBlob("receipts.data", f.data), f.id); err != nil {
			return err
		}
	}
	return nil
}

// Enabled reports whether values are encrypted (DATA_ENCRYPTION_KEY is set).
func Enabled() bool { return dataKey != nil }

// SetKey replaces the process key without touching the database (tests).
func SetKey(key []byte) { dataKey = key }
