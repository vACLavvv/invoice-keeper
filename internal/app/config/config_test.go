package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnvFileWarning(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("X=1\n"), 0o644)
	if EnvFileWarning(dir) == "" {
		t.Fatal("a world-readable .env must be reported")
	}
	os.Chmod(filepath.Join(dir, ".env"), 0o600)
	expect(t, "private .env", EnvFileWarning(dir), "")
}

func expect[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}
