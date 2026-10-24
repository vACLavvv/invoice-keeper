package security

import "testing"

func TestPasswordHashFormatIsStable(t *testing.T) {
	// A hash stored by an earlier release must keep verifying after upgrades.
	legacy := "scrypt$00112233445566778899aabbccddeeff$deeacfbd6fcad6b2e04266a871985b33ad33f3912581d90869f86daf8ae5c4ddc6af25827122b9bc3e2c08c64f29165400b9a4842b621d86e66f738ae51bc787"
	expect(t, "legacy hash", VerifyPassword("Stored-earlier-1!", legacy), true)
	expect(t, "wrong password", VerifyPassword("other", legacy), false)
	expect(t, "round trip", VerifyPassword("Fresh-pass-123!", HashPassword("Fresh-pass-123!")), true)
}

func expect[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}
