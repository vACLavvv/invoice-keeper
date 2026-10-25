// Package webhooks stores automatic notification destinations. It does not make
// outbound requests; the delivery worker resolves an endpoint at dispatch time.
package webhooks

import (
	"database/sql"
	"errors"
	"net"
	"net/url"
	"strconv"
	"strings"
	"unicode"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

type Endpoint struct {
	ID                                                            int64
	Name, URL, Secret, URLKey                                     string
	Enabled, NotifyDue, NotifyOverdue, AllowPrivate, LegacySource bool
	CreatedAt, UpdatedAt                                          string
	DeletedAt                                                     *string
}

const Columns = `id,name,url,secret,url_key,enabled,notify_due,notify_overdue,allow_private,legacy_source,created_at,updated_at,deleted_at`

func Scan(scanner interface{ Scan(...any) error }) (Endpoint, error) {
	var e Endpoint
	err := scanner.Scan(&e.ID, &e.Name, &e.URL, &e.Secret, &e.URLKey, &e.Enabled, &e.NotifyDue, &e.NotifyOverdue, &e.AllowPrivate, &e.LegacySource, &e.CreatedAt, &e.UpdatedAt, &e.DeletedAt)
	if err != nil {
		return e, err
	}
	if e.URL, err = security.DecryptText("webhook_endpoints.url", e.URL); err != nil {
		return Endpoint{}, err
	}
	if e.Secret, err = security.DecryptText("webhook_endpoints.secret", e.Secret); err != nil {
		return Endpoint{}, err
	}
	return e, nil
}

// Get also reads soft-deleted rows for delivery history; callers must check
// DeletedAt before allowing mutations or dispatching a request.
func Get(q store.Querier, id int64) (Endpoint, error) {
	return Scan(q.QueryRow("SELECT "+Columns+" FROM webhook_endpoints WHERE id=?", id))
}

func List(q store.Querier) ([]Endpoint, error) {
	rows, err := q.Query("SELECT " + Columns + " FROM webhook_endpoints WHERE deleted_at IS NULL ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Endpoint{}
	for rows.Next() {
		e, err := Scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, e)
	}
	return items, rows.Err()
}

func (e Endpoint) EnabledFor(kind string) bool {
	return e.Enabled && e.DeletedAt == nil && ((kind == "due" && e.NotifyDue) || (kind == "overdue" && e.NotifyOverdue))
}

func Channel(id int64) string { return "webhook:" + strconv.FormatInt(id, 10) }
func ParseChannel(channel string) (int64, bool) {
	if !strings.HasPrefix(channel, "webhook:") {
		return 0, false
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(channel, "webhook:"), 10, 64)
	return id, err == nil && id > 0 && channel == Channel(id)
}

// NormalizeURL changes only HTTP-equivalent spelling: host/scheme case, default
// port, an empty path, and the fragment which is never sent to the server. Query
// order and escaped paths are preserved because receivers may sign them.
func NormalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 4096 || strings.IndexFunc(raw, unicode.IsControl) >= 0 {
		return "", errors.New("некорректный URL webhook")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", errors.New("некорректный URL webhook")
	}
	u.Scheme = strings.ToLower(u.Scheme)
	if (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.Opaque != "" || strings.Contains(u.Hostname(), "%") {
		return "", errors.New("webhook должен использовать HTTP или HTTPS")
	}
	host, port := strings.ToLower(u.Hostname()), u.Port()
	if port != "" {
		p, err := strconv.Atoi(port)
		if err != nil || p < 1 || p > 65535 {
			return "", errors.New("некорректный порт webhook")
		}
		if (u.Scheme == "http" && p == 80) || (u.Scheme == "https" && p == 443) {
			port = ""
		} else {
			port = strconv.Itoa(p)
		}
	}
	if port != "" {
		u.Host = net.JoinHostPort(host, port)
	} else if strings.Contains(host, ":") {
		u.Host = "[" + host + "]"
	} else {
		u.Host = host
	}
	if u.Path == "" {
		u.Path = "/"
	}
	u.Fragment, u.RawFragment = "", ""
	return u.String(), nil
}

func URLKey(raw string) (string, error) {
	normalized, err := NormalizeURL(raw)
	if err != nil {
		return "", err
	}
	return security.Digest("webhook-url:v1:" + normalized), nil
}

// ImportLegacy is a one-time, atomic bridge from WEBHOOK_URL to database-managed
// destinations. It runs after ConfigureKey. A stale .env can never resurrect a
// removed/disabled destination on a later restart.
func ImportLegacy(db *store.DB, s *config.Settings) error {
	return db.Write(func(tx *sql.Tx) error {
		var done bool
		if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM app_state WHERE key='webhook_endpoints_initialized')").Scan(&done); err != nil {
			return err
		}
		if done {
			return nil
		}
		if s.WebhookURL != "" {
			key, err := URLKey(s.WebhookURL)
			if err != nil {
				return err
			}
			now := schedule.Timestamp()
			_, err = tx.Exec(`INSERT INTO webhook_endpoints(name,url,secret,url_key,enabled,notify_due,notify_overdue,allow_private,legacy_source,created_at,updated_at)
				VALUES('Webhook из настроек сервера',?,?,?,1,1,?,?,1,?,?) ON CONFLICT(url_key) WHERE deleted_at IS NULL DO NOTHING`,
				security.EncryptText("webhook_endpoints.url", s.WebhookURL), security.EncryptText("webhook_endpoints.secret", s.WebhookSecret), key, s.OverdueReminders, s.WebhookAllowPrivate, now, now)
			if err != nil {
				return err
			}
			var id int64
			if err := tx.QueryRow("SELECT id FROM webhook_endpoints WHERE url_key=? AND deleted_at IS NULL", key).Scan(&id); err != nil {
				return err
			}
			channel := Channel(id)
			if _, err := tx.Exec("UPDATE deliveries SET channel=?,recipient=CASE WHEN COALESCE(recipient,'')='' THEN ? ELSE recipient END WHERE channel='webhook'", channel, key); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO app_state(key,value) SELECT ?,value FROM app_state WHERE key='notify_backoff:webhook'
				ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(app_state.value AS INTEGER)<CAST(excluded.value AS INTEGER)`, "notify_backoff:"+channel); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM app_state WHERE key='notify_backoff:webhook'"); err != nil {
				return err
			}
		}
		_, err := tx.Exec("INSERT INTO app_state(key,value) VALUES('webhook_endpoints_initialized','1')")
		return err
	})
}
