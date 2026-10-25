package config

import (
	"testing"
	"time"
)

func TestAppTimezoneEnvironmentSelectsIANAZone(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "Wq7-vB2#nZ9!kLp4")
	for _, zone := range []string{"UTC", "Europe/Moscow", "Europe/Berlin", "Europe/Belgrade", "Asia/Vladivostok"} {
		t.Setenv("APP_TIMEZONE", zone)
		settings, err := FromEnv(t.TempDir())
		if err != nil {
			t.Fatalf("APP_TIMEZONE=%s: %v", zone, err)
		}
		if settings.Timezone != zone || settings.Location().String() != zone {
			t.Errorf("APP_TIMEZONE=%s silently replaced with %s (%s)", zone, settings.Timezone, settings.Location())
		}
		winter, _ := time.Parse(time.RFC3339, "2026-01-15T12:00:00Z")
		summer, _ := time.Parse(time.RFC3339, "2026-07-15T12:00:00Z")
		_, winterOffset := winter.In(settings.Location()).Zone()
		_, summerOffset := summer.In(settings.Location()).Zone()
		if (zone == "Europe/Berlin" || zone == "Europe/Belgrade") && (winterOffset != 3600 || summerOffset != 7200) {
			t.Errorf("%s lost seasonal rules: winter %d summer %d", zone, winterOffset, summerOffset)
		}
	}
	t.Setenv("APP_TIMEZONE", "Not/A_Real_Zone")
	if _, err := FromEnv(t.TempDir()); err == nil {
		t.Fatal("invalid timezone accepted instead of failing startup")
	}
}
