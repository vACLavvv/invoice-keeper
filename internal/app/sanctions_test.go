package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestWalletAddressValidation(t *testing.T) {
	for _, c := range []struct {
		network, address string
		valid            bool
	}{
		{"BTC", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", true},
		{"BTC", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", true},
		{"BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", true},
		{"BTC", "BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ", true},
		{"BTC", "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297", true},
		{"BTC", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", false},         // checksum
		{"BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdx", false}, // checksum
		{"BTC", "bc1qAr0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", false}, // mixed case
		{"BTC", "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz", false},         // a TRON address
		{"ETH", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", true},  // EIP-55
		{"ETH", "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed", true},  // lowercase
		{"ETH", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD", false}, // broken checksum
		{"ETH", "0x5aaeb6053f3e94c9b9a09f33669435e7ef1bea", false},
		{"TRON", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", true},
		{"TRON", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u", false},
		{"TRON", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", false},
		{"XRP", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh", false},
	} {
		if got := validWallet(c.network, c.address); got != c.valid {
			t.Errorf("%s %s: got %v, want %v", c.network, c.address, got, c.valid)
		}
	}
}

func TestParseSDN(t *testing.T) {
	file, _ := os.Open("testdata/sdn_sample.xml")
	defer file.Close()
	list, published, err := parseSDN(file)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "published", published, "10/21/2026")
	expect(t, "only digital currency ids", len(list), 3)
	expect(t, "person name", list[0].Name, "Ivan SAMPLE")
	expect(t, "hex is case-insensitive", list[1].Key, "0x252a8bd2319d8a555b872990601221b3a2053bce")
	expect(t, "currency", list[2].Currency, "USDT")
}

// ofacServer serves the sample list the way OFAC does: through a redirect to the file.
func ofacServer(t *testing.T) (*httptest.Server, *atomic.Int32) {
	sample, err := os.ReadFile("testdata/sdn_sample.xml")
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
	e.server.Sanctions.tick()
	expect(t, "no wallets, no download", downloads.Load(), int32(0))

	clean := admin.createPayment(map[string]any{"title": "Хостинг", "wallet_network": "TRON", "wallet_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"})
	wallet := clean["wallet"].(map[string]any)
	expect(t, "not screened before the list", wallet["sanctioned"], nil)

	e.server.Sanctions.tick()
	expect(t, "downloaded for the first wallet", downloads.Load(), int32(1))
	e.server.Sanctions.tick()
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
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "Алексей", "password": "User-password123!"})
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

func TestSanctionsReminderBlocksPayButton(t *testing.T) {
	row := ReminderRow{OccurrenceID: 5, Title: "Подрядчик", AmountCents: 100, Currency: "USD", DueDate: "2026-01-31",
		PaymentURL: "https://pay.me", WalletNetwork: "TRON", WalletAddress: "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz", SanctionsMatch: "SAMPLE EXCHANGE LLC"}
	text := reminderText(row)
	if !strings.Contains(text, "⛔ Кошелёк получателя в санкционном списке OFAC (SAMPLE EXCHANGE LLC)") || !strings.Contains(text, "Кошелёк (TRON)") {
		t.Fatalf("text: %s", text)
	}
	for name, keyboard := range map[string]any{"telegram": paidKeyboard(row), "max": maxKeyboard(row)} {
		if strings.Contains(must(jsonString(keyboard)), "pay.me") {
			t.Fatalf("%s keeps the pay button for a sanctioned wallet", name)
		}
	}
	if strings.Contains(string(emailMessage(&Settings{SMTPFrom: "a@b.c", SMTPTo: []string{"d@e.f"}}, row, nowForTest())), "pay.me") {
		t.Fatal("email keeps the pay link")
	}
}

func TestSanctionsBadListKeepsTheOldOne(t *testing.T) {
	e := setup(t)
	server, _ := ofacServer(t)
	if _, err := ImportSanctions(e.db, server.URL+"/SDN.XML", nil); err != nil {
		t.Fatal(err)
	}
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<?xml version="1.0"?><sdnList><sdnEntry><uid>1</uid></sdnEntry></sdnList>`))
	}))
	defer broken.Close()
	if _, err := ImportSanctions(e.db, broken.URL, nil); err == nil {
		t.Fatal("an empty list must be refused")
	}
	var n int
	e.db.QueryRow("SELECT COUNT(*) FROM sanctioned_addresses").Scan(&n)
	expect(t, "old list kept", n, 3)
}

func jsonString(v any) (string, error) {
	raw, err := json.Marshal(v)
	return string(raw), err
}

func nowForTest() time.Time { return time.Date(2026, 1, 28, 9, 0, 0, 0, time.UTC) }

// eip55 writes an address in its checksummed mixed case.
func eip55(address string) string {
	digits := strings.ToLower(address[2:])
	hash := keccakHex(digits)
	out := []byte(digits)
	for i, c := range out {
		if c >= 'a' && c <= 'f' && hash[i] >= '8' {
			out[i] = c - 32
		}
	}
	return "0x" + string(out)
}

func TestSanctionedWalletReachesReminders(t *testing.T) {
	e := setup(t)
	server, _ := ofacServer(t)
	if _, err := ImportSanctions(e.db, server.URL+"/SDN.XML", nil); err != nil {
		t.Fatal(err)
	}
	admin := e.client()
	admin.signIn()
	admin.createPayment(map[string]any{"wallet_network": "TRON", "wallet_address": "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz", "payment_url": "https://pay.me"})
	telegram, email := &recorder{}, &recorder{}
	w := channelWorker(e, telegram, map[string]Sender{"email": email.sender(SendResult{State: "sent"})})
	w.Tick()
	for name, r := range map[string]*recorder{"telegram": telegram, "email": email} {
		expect(t, name+" reminded", r.count(), 1)
		expect(t, name+" knows the match", r.rows[0].SanctionsMatch, "SAMPLE EXCHANGE LLC")
		expect(t, name+" has no pay link", r.rows[0].payURL(), "")
	}
}
