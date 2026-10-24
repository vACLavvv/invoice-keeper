package wallet

import (
	"context"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/store"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
		if got := Valid(c.network, c.address); got != c.valid {
			t.Errorf("%s %s: got %v, want %v", c.network, c.address, got, c.valid)
		}
	}
}

func TestParseSDN(t *testing.T) {
	file, _ := os.Open("testdata/sdn_sample.xml")
	defer file.Close()
	list, published, err := ParseSDN(file)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, "published", published, "10/21/2026")
	expect(t, "only digital currency ids", len(list), 3)
	expect(t, "person name", list[0].Name, "Ivan SAMPLE")
	expect(t, "hex is case-insensitive", list[1].Key, "0x252a8bd2319d8a555b872990601221b3a2053bce")
	expect(t, "currency", list[2].Currency, "USDT")
}

func expect[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}

func TestRefresherAbortsDownloadOnShutdown(t *testing.T) {
	released := make(chan struct{})
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-released:
		}
	}))
	t.Cleanup(func() {
		close(released)
		slow.Close()
	})
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "w.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at,wallet_network,wallet_address,wallet_key) VALUES('x',1,'USD','2026-01-01',1,'x','TRON','T','T')")
	refresher := &Refresher{DB: db, Settings: &config.Settings{OFACEnabled: true, OFACListURL: slow.URL, OFACRefreshHours: 24}}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		refresher.Run(ctx)
		close(done)
	}()
	time.Sleep(200 * time.Millisecond) // the download hangs
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("the OFAC download was not aborted")
	}
}
