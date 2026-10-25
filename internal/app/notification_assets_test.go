package app

import (
	"strings"
	"testing"
)

func TestNotificationWorkerAndManifestArePublicAndNotCached(t *testing.T) {
	e := setup(t)
	guest := e.client()
	worker := guest.get("/notification-worker.js")
	expect(t, "public worker", worker.status, 200)
	expect(t, "worker must revalidate", worker.header.Get("Cache-Control"), "no-cache")
	if !strings.Contains(worker.header.Get("Content-Type"), "javascript") || !strings.Contains(string(worker.body), "notificationclick") {
		t.Fatal("worker MIME or source invalid")
	}
	manifest := guest.get("/manifest.webmanifest")
	expect(t, "public manifest", manifest.status, 200)
	expect(t, "standalone", manifest.object(t)["display"], any("standalone"))
}
