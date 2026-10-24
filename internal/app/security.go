package app

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"strings"

	"golang.org/x/crypto/scrypt"
)

// Format scrypt$<hex salt>$<hex key>; N=16384, r=8, p=1, 64-byte key.
func hashPassword(password string) string {
	salt := randomHex(16)
	key, _ := scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
	return "scrypt$" + salt + "$" + hex.EncodeToString(key)
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 {
		return false
	}
	key, err := scrypt.Key([]byte(password), []byte(parts[1]), 16384, 8, 1, 64)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(hex.EncodeToString(key)), []byte(parts[2])) == 1
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}

func randomHex(n int) string { return hex.EncodeToString(randomBytes(n)) }

func randomToken(n int) string { return base64.RawURLEncoding.EncodeToString(randomBytes(n)) }

func constantEqual(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
