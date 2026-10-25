package app

import (
	"database/sql"
	"errors"
	"net/http"
	"slices"

	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/wallet"
)

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
	if _, err := s.Sanctions.Refresh(r.Context()); err != nil {
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

func (s *Server) screen(q store.Querier, address string) (sanctionMatch, error) {
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
	err := q.QueryRow("SELECT sdn_name,sdn_uid,currency FROM sanctioned_addresses WHERE address_key=?", wallet.Key(address)).Scan(&name, &uid, &currency)
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

// sanctionsCheck screens any address without saving it: from the payment form while typing
// and from the extension (its key may call this and the two extension endpoints only).
func (s *Server) sanctionsCheck(w http.ResponseWriter, r *http.Request) error {
	check := s.writeUser
	if hasBearer(r) {
		check = s.keyUser
	}
	if _, err := check(r); err != nil {
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
	if match.Sanctioned == nil {
		s.Sanctions.Request()
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
	case network != nil && !slices.Contains(wallet.Networks, *network):
		f.add(networkField, "Допустимые сети: BTC, ETH, TRON", "literal_error")
	case (network == nil) != (address == nil):
		f.add(addressField, "Укажите и сеть, и адрес кошелька — или оставьте оба поля пустыми", "value_error")
	case network != nil && !wallet.Valid(*network, *address):
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
