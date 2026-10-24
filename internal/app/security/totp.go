package security

import (
	"crypto/hmac"
	"crypto/sha1" // #nosec G505 -- TOTP (RFC 6238) is HMAC-SHA1: authenticator apps require it
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

// TOTP (RFC 6238): HMAC-SHA1, 30-second steps, 6 digits — what authenticator apps expect.

var TOTPEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

func TOTPCode(secret []byte, step int64) string {
	mac := hmac.New(sha1.New, secret)
	binary.Write(mac, binary.BigEndian, step)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", value%1_000_000)
}

// TOTPStep returns the matched time step (±1 for clock drift) or -1.
func TOTPStep(secretB32, code string, now time.Time) int64 {
	secret, err := TOTPEncoding.DecodeString(strings.ToUpper(secretB32))
	code = strings.ReplaceAll(code, " ", "")
	if err != nil || len(code) != 6 {
		return -1
	}
	current := now.Unix() / 30
	for _, step := range []int64{current - 1, current, current + 1} {
		if hmac.Equal([]byte(TOTPCode(secret, step)), []byte(code)) {
			return step
		}
	}
	return -1
}
