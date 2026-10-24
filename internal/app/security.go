package app

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"runtime"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/scrypt"
)

// Passwords are hashed with Argon2id (RFC 9106, second recommended option: 64 MiB, 3 passes)
// in the PHC format $argon2id$v=19$m=65536,t=3,p=4$<salt>$<key>. Hashes of earlier releases
// (scrypt$<hex salt>$<hex key>) keep verifying and are replaced on the next successful sign-in.
type argonCost struct {
	memory  uint32 // KiB
	passes  uint32
	threads uint8
}

var argonParams = argonCost{memory: 64 * 1024, passes: 3, threads: 4}

// hashSlots bounds concurrent hashing: each Argon2id run takes 64 MiB, so a burst of sign-ins
// must queue instead of exhausting memory.
var hashSlots = make(chan struct{}, max(2, runtime.NumCPU()))

func argonKey(password string, salt []byte, cost argonCost) []byte {
	hashSlots <- struct{}{}
	defer func() { <-hashSlots }()
	return argon2.IDKey([]byte(password), salt, cost.passes, cost.memory, cost.threads, 32)
}

func hashPassword(password string) string {
	salt := randomBytes(16)
	key := argonKey(password, salt, argonParams)
	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonParams.memory, argonParams.passes, argonParams.threads,
		b64.EncodeToString(salt), b64.EncodeToString(key))
}

func verifyPassword(password, encoded string) bool {
	if strings.HasPrefix(encoded, "$argon2id$") {
		parts := strings.Split(encoded, "$") // "", argon2id, v=19, m=…,t=…,p=…, salt, key
		var cost argonCost
		if len(parts) != 6 || parts[2] != fmt.Sprintf("v=%d", argon2.Version) {
			return false
		}
		if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &cost.memory, &cost.passes, &cost.threads); err != nil {
			return false
		}
		if cost.memory > 1<<20 || cost.passes > 16 || cost.threads == 0 { // never let a stored hash demand absurd resources
			return false
		}
		salt, errSalt := base64.RawStdEncoding.DecodeString(parts[4])
		key, errKey := base64.RawStdEncoding.DecodeString(parts[5])
		if errSalt != nil || errKey != nil || len(key) == 0 {
			return false
		}
		return subtle.ConstantTimeCompare(argonKey(password, salt, cost), key) == 1
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "scrypt" {
		return false
	}
	key, err := scrypt.Key([]byte(password), []byte(parts[1]), 16384, 8, 1, 64)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(hex.EncodeToString(key)), []byte(parts[2])) == 1
}

// needsRehash reports a hash made by an older algorithm or with weaker parameters.
func needsRehash(encoded string) bool {
	current := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$", argon2.Version, argonParams.memory, argonParams.passes, argonParams.threads)
	return !strings.HasPrefix(encoded, current)
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
