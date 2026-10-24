package app

import (
	"database/sql"
	"strings"
	"testing"
	"time"
)

const testPairingCode = "kQ3v0Zb1mHk9yT2xWc8nR4uP6sL7aE5dF0gJ1hK2iM3oN4pQ5rS"

func TestExtensionConnectsWithoutCopyingAKey(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	ext := e.keyClient("")

	pending := ext.do("POST", "/api/v1/extension/pairings/claim", map[string]any{"code": testPairingCode}, "Origin", "chrome-extension://abc")
	expect(t, "not confirmed yet", pending.status, 202)
	expect(t, "cors for the extension", pending.header.Get("Access-Control-Allow-Origin"), "*")

	confirmed := admin.post("/api/v1/extension/pairings", map[string]any{"code": testPairingCode, "device": "Chrome · macOS"})
	expect(t, "confirmed in the panel", confirmed.status, 201)
	key := confirmed.object(t)
	expect(t, "named after the device", key["name"], any("Расширение · Chrome · macOS"))
	expect(t, "expires in a year", strings.HasPrefix(key["expires_at"].(string), time.Now().AddDate(1, 0, 0).Format("2006-01")), true)
	expect(t, "the same code twice", admin.post("/api/v1/extension/pairings", map[string]any{"code": testPairingCode}).status, 409)

	claimed := ext.post("/api/v1/extension/pairings/claim", map[string]any{"code": testPairingCode})
	expect(t, "claimed", claimed.status, 200)
	answer := claimed.object(t)
	expect(t, "owner", answer["username"], any("admin"))
	expect(t, "works for the extension", e.keyClient(answer["token"].(string)).get("/api/v1/extension/whoami").status, 200)
	expect(t, "only once", ext.post("/api/v1/extension/pairings/claim", map[string]any{"code": testPairingCode}).status, 202)

	expect(t, "short codes refused", admin.post("/api/v1/extension/pairings", map[string]any{"code": "abc"}).status, 422)
	token := e.keyClient(admin.createToken("write", nil))
	expect(t, "only from the panel", token.post("/api/v1/extension/pairings", map[string]any{"code": testPairingCode + "x"}).status, 403)
}

func TestUnclaimedPairingAndIdleKeysAreRemoved(t *testing.T) {
	e := setup(t)
	e.settings.KeyIdleDays = 90
	admin := e.client()
	admin.signIn()
	admin.post("/api/v1/extension/pairings", map[string]any{"code": testPairingCode})
	idle := admin.createKey("Старый ноутбук")
	fresh := admin.createKey("Рабочий")
	expect(t, "three keys", len(admin.get("/api/v1/api-keys").list(t)), 3)

	// Ten minutes later the unclaimed pairing is gone with its key; a key unused for 91 days stops at once.
	e.db.Exec("UPDATE extension_pairings SET expires_at=?", time.Now().Unix()-1)
	e.db.Exec("UPDATE api_keys SET created_at=? WHERE name='Старый ноутбук'", idleCutoff(91, time.Now()))
	expect(t, "idle key refused", e.keyClient(idle).get("/api/v1/extension/whoami").status, 401)
	if err := e.db.Write(func(tx *sql.Tx) error { return cleanupKeys(tx, 90, time.Now()) }); err != nil {
		t.Fatal(err)
	}
	keys := admin.get("/api/v1/api-keys").list(t)
	expect(t, "only the used key stays", len(keys), 1)
	expect(t, "which", keys[0]["name"], any("Рабочий"))
	expect(t, "fresh key works", e.keyClient(fresh).get("/api/v1/extension/whoami").status, 200)
	expect(t, "audited", admin.get("/api/v1/audit-log").list(t)[0]["action"], any("api_key.expire"))

	defaultKey := admin.post("/api/v1/api-keys", map[string]any{"name": "Без срока?"}).object(t)
	expect(t, "extension keys expire in a year by default", defaultKey["expires_at"] != nil, true)
	forever := admin.post("/api/v1/api-keys", map[string]any{"name": "Бессрочный", "expires_in_days": nil}).object(t)
	expect(t, "explicit null keeps no expiry", forever["expires_at"], nil)
}

func TestLoginReturnsToThePage(t *testing.T) {
	e := setup(t)
	anonymous := e.client()
	r := anonymous.get("/extension?connect=" + testPairingCode)
	expect(t, "redirect to sign in", r.status, 303)
	expect(t, "with the page", r.header.Get("Location"), "/login?next=%2Fextension%3Fconnect%3D"+testPairingCode)
	for next, want := range map[string]string{"/extension?x=1": "/extension?x=1", "//evil.example": "/", "https://evil.example": "/", "/\\evil": "/"} {
		expect(t, next, safeNext(next), want)
	}
}
