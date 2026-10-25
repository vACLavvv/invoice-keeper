package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/wallet"
)

// ofacServer serves the sample list the way OFAC does: through a redirect to the file.
func ofacServer(t *testing.T) (*httptest.Server, *atomic.Int32) {
	sample, err := os.ReadFile("wallet/testdata/sdn_sample.xml")
	if err != nil {
		t.Fatal(err)
	}
	var downloads atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/SDN.XML" {
			http.Redirect(w, r, "/storage/sdn.xml", http.StatusFound)
			return
		}
		downloads.Add(1)
		w.Header().Set("Content-Type", "text/xml")
		w.Write(sample)
	}))
	t.Cleanup(server.Close)
	return server, &downloads
}

func TestSanctionsScreening(t *testing.T) {
	e := setup(t)
	server, downloads := ofacServer(t)
	e.settings.OFACEnabled, e.settings.OFACListURL = true, server.URL+"/SDN.XML"
	admin := e.client()
	admin.signIn()

	// Nobody uses wallets: the list is never downloaded.
	e.server.Sanctions.Tick(context.Background())
	expect(t, "no wallets, no download", downloads.Load(), int32(0))

	clean := admin.createPayment(map[string]any{"title": "Хостинг", "wallet_network": "TRON", "wallet_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"})
	wallet := clean["wallet"].(map[string]any)
	expect(t, "not screened before the list", wallet["sanctioned"], nil)

	e.server.Sanctions.Tick(context.Background())
	expect(t, "downloaded for the first wallet", downloads.Load(), int32(1))
	e.server.Sanctions.Tick(context.Background())
	expect(t, "fresh list is not downloaded again", downloads.Load(), int32(1))

	status := admin.get("/api/v1/sanctions").object(t)
	expect(t, "addresses loaded", status["addresses"], any(3.0))
	expect(t, "publish date", status["publish_date"], any("10/21/2026"))

	items := admin.get("/api/v1/recurring-payments").list(t)
	expect(t, "clean wallet", items[0]["wallet"].(map[string]any)["sanctioned"], any(false))

	// ETH addresses match regardless of letter case (checksummed input vs lowercase in the list).
	checksummed := eip55("0x252a8bd2319d8a555b872990601221b3a2053bce")
	hit := admin.createPayment(map[string]any{"title": "Подрядчик", "wallet_network": "ETH", "wallet_address": checksummed})
	match := hit["wallet"].(map[string]any)
	expect(t, "sanctioned", match["sanctioned"], any(true))
	expect(t, "who", match["match_name"], any("Ivan SAMPLE"))
	expect(t, "audited", admin.get("/api/v1/audit-log").list(t)[0]["action"], any("wallet.sanctioned"))

	occurrence := admin.get("/api/v1/payment-occurrences?search=Подрядчик").list(t)[0]
	expect(t, "period carries the screening", occurrence["wallet"].(map[string]any)["sanctioned"], any(true))

	// Ad-hoc check without saving, available to any signed-in user.
	admin.post("/api/v1/users", map[string]any{"email": "test@example.com", "username": "alex", "display_name": "Алексей", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	check := user.post("/api/v1/sanctions/check", map[string]any{"network": "TRON", "address": "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz"})
	expect(t, "check", check.status, 200)
	expect(t, "usdt on tron hit", check.object(t)["screening"].(map[string]any)["sanctioned"], any(true))
	expect(t, "bad address", user.post("/api/v1/sanctions/check", map[string]any{"network": "BTC", "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"}).status, 422)
	expect(t, "refresh is admin-only", user.post("/api/v1/sanctions/refresh", nil).status, 403)
	expect(t, "admin refresh", admin.post("/api/v1/sanctions/refresh", nil).status, 200)

	// Wallet validation on payments: both fields or none, and a valid address.
	bad := admin.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31",
		"wallet_network": "ETH", "wallet_address": "0x123"})
	expect(t, "invalid wallet", bad.status, 422)
	half := admin.post("/api/v1/recurring-payments", map[string]any{"title": "x", "amount": "1", "currency": "RUB", "first_due_date": "2026-01-31",
		"wallet_network": "ETH"})
	expect(t, "network without address", half.status, 422)
	cleared := admin.patch("/api/v1/recurring-payments/"+id(hit), map[string]any{"wallet_network": nil, "wallet_address": nil})
	expect(t, "wallet cleared", cleared.object(t)["wallet"], nil)
}

// The extension and the payment form check a wallet before anything is saved. On an installation
// without saved wallets the first check asks for the list instead of waiting for one.
func TestWalletCheckFromExtensionLoadsListOnDemand(t *testing.T) {
	e := setup(t)
	server, downloads := ofacServer(t)
	e.settings.OFACEnabled, e.settings.OFACListURL = true, server.URL+"/SDN.XML"
	admin := e.client()
	admin.signIn()
	ext := e.keyClient(admin.createKey("Chrome"))
	body := map[string]any{"network": "TRON", "address": "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz"}

	first := ext.post("/api/v1/sanctions/check", body)
	expect(t, "extension key may check", first.status, 200)
	expect(t, "not loaded yet", first.object(t)["screening"].(map[string]any)["sanctioned"], nil)

	e.server.Sanctions.Tick(context.Background())
	expect(t, "the check asked for the list", downloads.Load(), int32(1))
	again := ext.post("/api/v1/sanctions/check", body)
	expect(t, "hit after loading", again.object(t)["screening"].(map[string]any)["sanctioned"], any(true))
	e.server.Sanctions.Tick(context.Background())
	expect(t, "fresh list is not downloaded again", downloads.Load(), int32(1))

	expect(t, "bad address", ext.post("/api/v1/sanctions/check", map[string]any{"network": "TRON", "address": "nope"}).status, 422)
	expect(t, "still no access to payments", ext.get("/api/v1/recurring-payments").status, 403)

	// The popup is another origin: the preflight and the answer must allow it.
	preflight := ext.do("OPTIONS", "/api/v1/sanctions/check", nil, "Origin", "chrome-extension://abc", "Access-Control-Request-Method", "POST")
	expect(t, "preflight", preflight.status, 204)
	expect(t, "preflight origin", preflight.header.Get("Access-Control-Allow-Origin"), "*")
	expect(t, "answer origin", again.header.Get("Access-Control-Allow-Origin"), "*")
}

func TestSanctionsBadListKeepsTheOldOne(t *testing.T) {
	e := setup(t)
	server, _ := ofacServer(t)
	if _, err := wallet.Import(context.Background(), e.db, server.URL+"/SDN.XML", nil); err != nil {
		t.Fatal(err)
	}
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<?xml version="1.0"?><sdnList><sdnEntry><uid>1</uid></sdnEntry></sdnList>`))
	}))
	defer broken.Close()
	if _, err := wallet.Import(context.Background(), e.db, broken.URL, nil); err == nil {
		t.Fatal("an empty list must be refused")
	}
	var n int
	e.db.QueryRow("SELECT COUNT(*) FROM sanctioned_addresses").Scan(&n)
	expect(t, "old list kept", n, 3)
}

func TestSanctionedWalletReachesReminders(t *testing.T) {
	e := setup(t)
	server, _ := ofacServer(t)
	if _, err := wallet.Import(context.Background(), e.db, server.URL+"/SDN.XML", nil); err != nil {
		t.Fatal(err)
	}
	admin := e.client()
	admin.signIn()
	admin.createPayment(map[string]any{"wallet_network": "TRON", "wallet_address": "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz", "payment_url": "https://pay.me"})
	telegram, email := &recorder{}, &recorder{}
	w := channelWorker(e, telegram, map[string]notify.Sender{"email": email.sender(notify.SendResult{State: "sent"})})
	w.Tick()
	for name, r := range map[string]*recorder{"telegram": telegram, "email": email} {
		expect(t, name+" reminded", r.count(), 1)
		expect(t, name+" knows the match", r.rows[0].SanctionsMatch, "SAMPLE EXCHANGE LLC")
		expect(t, name+" has no pay link", r.rows[0].PayURL(), "")
	}
}

// eip55 writes an address in its checksummed mixed case.
func eip55(address string) string {
	digits := strings.ToLower(address[2:])
	hash := wallet.KeccakHex(digits)
	out := []byte(digits)
	for i, c := range out {
		if c >= 'a' && c <= 'f' && hash[i] >= '8' {
			out[i] = c - 32
		}
	}
	return "0x" + string(out)
}
