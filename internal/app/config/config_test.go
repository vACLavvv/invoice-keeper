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

func TestPublicBaseURLAndProxies(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "Wq7-vB2#nZ9!kLp4")
	t.Setenv("PUBLIC_BASE_URL", "https://Keeper.example.ru/")
	t.Setenv("TRUSTED_PROXIES", "127.0.0.1, 10.0.0.0/8, ::1")
	s, err := FromEnv(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "normalized", s.PublicBaseURL, "https://Keeper.example.ru")
	expect(t, "HTTPS means Secure cookies", s.CookieSecure, true)
	expect(t, "proxies", len(s.TrustedProxies), 3)

	t.Setenv("COOKIE_SECURE", "false")
	s, _ = FromEnv(t.TempDir())
	expect(t, "explicit COOKIE_SECURE wins", s.CookieSecure, false)

	for _, bad := range []string{"keeper.example.ru", "https://keeper.example.ru/app", "ftp://keeper.example.ru"} {
		t.Setenv("PUBLIC_BASE_URL", bad)
		if _, err := FromEnv(t.TempDir()); err == nil {
			t.Errorf("PUBLIC_BASE_URL=%s accepted", bad)
		}
	}
	t.Setenv("PUBLIC_BASE_URL", "")
	t.Setenv("TRUSTED_PROXIES", "nginx")
	if _, err := FromEnv(t.TempDir()); err == nil {
		t.Error("TRUSTED_PROXIES=nginx accepted")
	}
}
