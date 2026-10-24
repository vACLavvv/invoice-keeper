package app

// Sanctions screening of payee wallets against the OFAC SDN list (U.S. Treasury). The list is
// downloaded as XML, the "Digital Currency Address - …" identifiers are kept in sanctioned_addresses
// and payments are matched by a join on the normalized address, so a refreshed list applies at once.
// It catches only addresses OFAC has published; it is not a risk score of a wallet's history.

import (
	"database/sql"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"
)

const sanctionsSchema = `
CREATE TABLE IF NOT EXISTS sanctioned_addresses (
    address_key TEXT PRIMARY KEY, address TEXT NOT NULL, currency TEXT NOT NULL,
    sdn_uid INTEGER NOT NULL, sdn_name TEXT NOT NULL
);
`

const (
	defaultOFACURL   = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML"
	maxOFACListBytes = 200 << 20
	digitalPrefix    = "Digital Currency Address - "
)

type sanctionedAddress struct {
	Key, Address, Currency, Name string
	UID                          int64
}

// parseSDN streams the SDN XML and returns its digital currency addresses and the publish date.
func parseSDN(r io.Reader) ([]sanctionedAddress, string, error) {
	decoder := xml.NewDecoder(r)
	var addresses []sanctionedAddress
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
				addresses = append(addresses, sanctionedAddress{Key: walletKey(address), Address: address,
					Currency: strings.TrimSpace(currency), Name: name, UID: entry.UID})
			}
		}
	}
	return addresses, strings.TrimSpace(published), nil
}

// replaceSanctions swaps the whole list in one transaction; an empty parse never wipes a good list.
// It returns the number of distinct addresses: OFAC lists some of them under several entries.
func replaceSanctions(db *DB, addresses []sanctionedAddress, published, source string) (int, error) {
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
			"ofac_updated_at": timestamp(), "ofac_publish_date": published, "ofac_source": source, "ofac_error": "",
		} {
			if err := setState(tx, key, value); err != nil {
				return err
			}
		}
		return audit(tx, "server", "sanctions.update", len(distinct))
	})
}

// ImportSanctions loads the list from a URL or a local file (`invoice-keeper ofac-update --file`).
func ImportSanctions(db *DB, source string, client *http.Client) (int, error) {
	var body io.ReadCloser
	if strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://") {
		if client == nil {
			// OFAC answers with a redirect to a signed file in cloud storage, so redirects are followed.
			client = &http.Client{Timeout: 5 * time.Minute}
		}
		response, err := client.Get(source)
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
	addresses, published, err := parseSDN(io.LimitReader(body, maxOFACListBytes))
	if err != nil {
		return 0, err
	}
	return replaceSanctions(db, addresses, published, source)
}

// --- background refresh ---

// Sanctions keeps the list fresh: it downloads it only while some payment has a wallet,
// so an installation without crypto payments never contacts OFAC.
type Sanctions struct {
	DB       *DB
	Settings *Settings
	Client   *http.Client

	mu   sync.Mutex
	stop chan struct{}
	done chan struct{}
}

func (s *Sanctions) walletsInUse() (bool, error) {
	var n int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM recurring_payments WHERE wallet_key IS NOT NULL AND active=1").Scan(&n)
	return n > 0, err
}

func (s *Sanctions) stale() bool {
	var updated string
	err := s.DB.QueryRow("SELECT value FROM app_state WHERE key='ofac_updated_at'").Scan(&updated)
	if err != nil {
		return true
	}
	at, err := time.Parse("2006-01-02T15:04:05.000000-07:00", updated)
	return err != nil || time.Since(at) >= time.Duration(s.Settings.OFACRefreshHours)*time.Hour
}

// Refresh downloads the list now; one refresh at a time. A failure keeps the previous list.
func (s *Sanctions) Refresh() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count, err := ImportSanctions(s.DB, s.Settings.OFACListURL, s.Client)
	if err != nil {
		log.Printf("OFAC: %v", err)
		if stateErr := setState(s.DB, "ofac_error", err.Error()); stateErr != nil {
			return 0, stateErr
		}
	}
	return count, err
}

func (s *Sanctions) tick() {
	if !s.Settings.OFACEnabled {
		return
	}
	used, err := s.walletsInUse()
	if err != nil || !used || !s.stale() {
		return
	}
	s.Refresh()
}

func (s *Sanctions) Start() {
	s.stop, s.done = make(chan struct{}), make(chan struct{})
	go func() {
		defer close(s.done)
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			s.tick()
			select {
			case <-s.stop:
				return
			case <-ticker.C:
			}
		}
	}()
}

func (s *Sanctions) Stop() {
	if s.stop == nil {
		return
	}
	close(s.stop)
	select {
	case <-s.done:
	case <-time.After(2 * time.Second):
	}
}

// --- API ---

type sanctionsStatus struct {
	Enabled     bool    `json:"enabled"`
	Addresses   int     `json:"addresses"`
	UpdatedAt   *string `json:"updated_at"`
	PublishDate *string `json:"publish_date"`
	Error       *string `json:"error"`
	Source      string  `json:"source"`
}

func (s *Server) sanctionsState() (sanctionsStatus, error) {
	status := sanctionsStatus{Enabled: s.Settings.OFACEnabled, Source: s.Settings.OFACListURL}
	if err := s.DB.QueryRow("SELECT COUNT(*) FROM sanctioned_addresses").Scan(&status.Addresses); err != nil {
		return status, err
	}
	for key, target := range map[string]**string{"ofac_updated_at": &status.UpdatedAt, "ofac_publish_date": &status.PublishDate, "ofac_error": &status.Error} {
		value, err := s.state(key)
		if err != nil {
			return status, err
		}
		if value != "" {
			*target = &value
		}
	}
	return status, nil
}

func (s *Server) sanctionsGet(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	status, err := s.sanctionsState()
	if err != nil {
		return err
	}
	return writeJSON(w, 200, status)
}

func (s *Server) sanctionsRefresh(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminWrite(r); err != nil {
		return err
	}
	if _, err := s.Sanctions.Refresh(); err != nil {
		return fail(502, err.Error())
	}
	status, err := s.sanctionsState()
	if err != nil {
		return err
	}
	return writeJSON(w, 200, status)
}

// sanctionMatch is the screening result shown next to a wallet: nil Sanctioned — the list is not loaded.
type sanctionMatch struct {
	Sanctioned *bool   `json:"sanctioned"`
	Name       *string `json:"match_name"`
	UID        *int64  `json:"match_uid"`
	Currency   *string `json:"match_currency"`
}

func (s *Server) screen(q querier, address string) (sanctionMatch, error) {
	var loaded int
	if err := q.QueryRow("SELECT COUNT(*) FROM sanctioned_addresses").Scan(&loaded); err != nil {
		return sanctionMatch{}, err
	}
	if loaded == 0 {
		return sanctionMatch{}, nil
	}
	var m sanctionMatch
	var name, currency string
	var uid int64
	err := q.QueryRow("SELECT sdn_name,sdn_uid,currency FROM sanctioned_addresses WHERE address_key=?", walletKey(address)).Scan(&name, &uid, &currency)
	hit := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return m, err
	}
	m.Sanctioned = &hit
	if hit {
		m.Name, m.UID, m.Currency = &name, &uid, &currency
	}
	return m, nil
}

// sanctionsCheck screens any address without saving it.
func (s *Server) sanctionsCheck(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.writeUser(r); err != nil {
		return err
	}
	f, err := readForm(r, "network", "address")
	if err != nil {
		return err
	}
	f.require("network", "address")
	network, address := walletFields(f, "network", "address")
	if network == nil && len(f.errs) == 0 {
		f.add("address", "Укажите адрес кошелька", "missing")
	}
	if err := f.err(); err != nil {
		return err
	}
	match, err := s.screen(s.DB, *address)
	if err != nil {
		return err
	}
	status, err := s.sanctionsState()
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{"network": *network, "address": *address, "screening": match, "list_updated_at": status.UpdatedAt})
}

// walletFields validates a payee wallet: a supported network and a well-formed address of it.
// Both are given or both are empty (null or "") — the latter clears the wallet.
func walletFields(f *form, networkField, addressField string) (network, address *string) {
	network = f.text(networkField, textRule{trim: true, max: 8})
	address = f.text(addressField, textRule{trim: true, max: 100})
	if network != nil && *network == "" {
		network = nil
	}
	if address != nil && *address == "" {
		address = nil
	}
	switch {
	case network != nil && !slices.Contains(walletNetworks, *network):
		f.add(networkField, "Допустимые сети: BTC, ETH, TRON", "literal_error")
	case (network == nil) != (address == nil):
		f.add(addressField, "Укажите и сеть, и адрес кошелька — или оставьте оба поля пустыми", "value_error")
	case network != nil && !validWallet(*network, *address):
		f.add(addressField, "Адрес не похож на кошелёк сети "+*network+": проверьте символы и контрольную сумму", "value_error")
	default:
		return network, address
	}
	return nil, nil
}

// walletInfo is a payee wallet with its screening, shown on payments and periods.
type walletInfo struct {
	Network string `json:"network"`
	Address string `json:"address"`
	sanctionMatch
}

// makeWallet builds the wallet view from joined columns; loaded tells whether a list exists.
func makeWallet(network, address, name, currency sql.NullString, uid sql.NullInt64, loaded bool) *walletInfo {
	if !network.Valid || !address.Valid {
		return nil
	}
	info := &walletInfo{Network: network.String, Address: address.String}
	if loaded {
		hit := name.Valid
		info.Sanctioned = &hit
		if hit {
			info.Name, info.Currency, info.UID = &name.String, &currency.String, &uid.Int64
		}
	}
	return info
}
