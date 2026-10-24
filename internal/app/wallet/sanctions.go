package wallet

import (
	"context"
	"database/sql"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

const (
	maxOFACListBytes = 200 << 20
	digitalPrefix    = "Digital Currency Address - "
)

type Address struct {
	Key, Address, Currency, Name string
	UID                          int64
}

// ParseSDN streams the SDN XML and returns its digital currency addresses and the publish date.
func ParseSDN(r io.Reader) ([]Address, string, error) {
	decoder := xml.NewDecoder(r)
	var addresses []Address
	var published string
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, "", fmt.Errorf("список OFAC повреждён: %w", err)
		}
		start, ok := token.(xml.StartElement)
		if !ok {
			continue
		}
		switch start.Name.Local {
		case "Publish_Date":
			if err := decoder.DecodeElement(&published, &start); err != nil {
				return nil, "", err
			}
		case "sdnEntry":
			var entry struct {
				UID       int64  `xml:"uid"`
				FirstName string `xml:"firstName"`
				LastName  string `xml:"lastName"`
				IDs       []struct {
					Type   string `xml:"idType"`
					Number string `xml:"idNumber"`
				} `xml:"idList>id"`
			}
			if err := decoder.DecodeElement(&entry, &start); err != nil {
				return nil, "", fmt.Errorf("список OFAC повреждён: %w", err)
			}
			name := strings.TrimSpace(entry.FirstName + " " + entry.LastName)
			for _, id := range entry.IDs {
				currency, ok := strings.CutPrefix(id.Type, digitalPrefix)
				address := strings.TrimSpace(id.Number)
				if !ok || address == "" {
					continue
				}
				addresses = append(addresses, Address{Key: Key(address), Address: address,
					Currency: strings.TrimSpace(currency), Name: name, UID: entry.UID})
			}
		}
	}
	return addresses, strings.TrimSpace(published), nil
}

// replaceSanctions swaps the whole list in one transaction; an empty parse never wipes a good list.
// It returns the number of distinct addresses: OFAC lists some of them under several entries.
func replaceSanctions(db *store.DB, addresses []Address, published, source string) (int, error) {
	if len(addresses) == 0 {
		return 0, errors.New("в списке OFAC не найдено ни одного криптоадреса — список не заменён")
	}
	distinct := map[string]bool{}
	for _, a := range addresses {
		distinct[a.Key] = true
	}
	return len(distinct), db.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM sanctioned_addresses"); err != nil {
			return err
		}
		for _, a := range addresses {
			if _, err := tx.Exec("INSERT OR IGNORE INTO sanctioned_addresses(address_key,address,currency,sdn_uid,sdn_name) VALUES(?,?,?,?,?)",
				a.Key, a.Address, a.Currency, a.UID, a.Name); err != nil {
				return err
			}
		}
		for key, value := range map[string]string{
			"ofac_updated_at": schedule.Timestamp(), "ofac_publish_date": published, "ofac_source": source, "ofac_error": "",
		} {
			if err := store.SetState(tx, key, value); err != nil {
				return err
			}
		}
		return audit.Record(tx, "server", "sanctions.update", len(distinct))
	})
}

// Import loads the list from a URL or a local file (`invoice-keeper ofac-update --file`).
func Import(ctx context.Context, db *store.DB, source string, client *http.Client) (int, error) {
	var body io.ReadCloser
	if strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://") {
		if client == nil {
			// OFAC answers with a redirect to a signed file in cloud storage, so redirects are followed.
			client = &http.Client{Timeout: 5 * time.Minute}
		}
		request, err := http.NewRequestWithContext(ctx, "GET", source, nil)
		if err != nil {
			return 0, errors.New("неверный адрес списка OFAC")
		}
		response, err := client.Do(request)
		if err != nil {
			return 0, errors.New("не удалось скачать список OFAC: нет соединения")
		}
		if response.StatusCode != 200 {
			response.Body.Close()
			return 0, fmt.Errorf("не удалось скачать список OFAC: HTTP %d", response.StatusCode)
		}
		body = response.Body
	} else {
		file, err := os.Open(source) // #nosec G304 -- the path is given by the server administrator (ofac-update --file)
		if err != nil {
			return 0, fmt.Errorf("не удалось открыть файл списка OFAC: %w", err)
		}
		body = file
	}
	defer body.Close()
	addresses, published, err := ParseSDN(io.LimitReader(body, maxOFACListBytes))
	if err != nil {
		return 0, err
	}
	return replaceSanctions(db, addresses, published, source)
}

// --- background refresh ---

// Refresher keeps the list fresh: it downloads it only while some payment has a wallet,
// so an installation without crypto payments never contacts OFAC.
type Refresher struct {
	DB       *store.DB
	Settings *config.Settings
	Client   *http.Client

	mu sync.Mutex
}

func (s *Refresher) walletsInUse() (bool, error) {
	var n int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM recurring_payments WHERE wallet_key IS NOT NULL AND active=1").Scan(&n)
	return n > 0, err
}

func (s *Refresher) stale() bool {
	var updated string
	err := s.DB.QueryRow("SELECT value FROM app_state WHERE key='ofac_updated_at'").Scan(&updated)
	if err != nil {
		return true
	}
	at, err := time.Parse("2006-01-02T15:04:05.000000-07:00", updated)
	return err != nil || time.Since(at) >= time.Duration(s.Settings.OFACRefreshHours)*time.Hour
}

// Refresh downloads the list now; one refresh at a time. A failure keeps the previous list.
func (s *Refresher) Refresh(ctx context.Context) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count, err := Import(ctx, s.DB, s.Settings.OFACListURL, s.Client)
	if err != nil {
		log.Printf("OFAC: %v", err)
		if stateErr := store.SetState(s.DB, "ofac_error", err.Error()); stateErr != nil {
			return 0, stateErr
		}
	}
	return count, err
}

// Tick downloads the list when a wallet is in use and the list is stale.
func (s *Refresher) Tick(ctx context.Context) {
	if !s.Settings.OFACEnabled {
		return
	}
	used, err := s.walletsInUse()
	if err != nil || !used || !s.stale() {
		return
	}
	s.Refresh(ctx)
}

// Run checks the list every hour until ctx is cancelled; a download in progress is aborted.
func (s *Refresher) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for ctx.Err() == nil {
		s.Tick(ctx)
		select {
		case <-ctx.Done():
		case <-ticker.C:
		}
	}
}
