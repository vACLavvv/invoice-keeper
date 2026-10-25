package app

import (
	"database/sql"
	"errors"
	"mime"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"unicode"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/webhooks"
)

const webhookEndpointLimit = 50
const webhookTestBody = `{"event":"webhook.test","message":"Invoice Keeper webhook test"}`

type webhookDeliverySummary struct {
	State       string  `json:"state"`
	AttemptedAt *int64  `json:"attempted_at"`
	SentAt      *string `json:"sent_at"`
	Error       string  `json:"error"`
}

type webhookEndpointItem struct {
	ID            int64                   `json:"id"`
	Name          string                  `json:"name"`
	URL           string                  `json:"url"`
	URLReadonly   bool                    `json:"url_readonly"`
	Enabled       bool                    `json:"enabled"`
	NotifyDue     bool                    `json:"notify_due"`
	NotifyOverdue bool                    `json:"notify_overdue"`
	HasSecret     bool                    `json:"has_secret"`
	AllowPrivate  bool                    `json:"allow_private"`
	LegacySource  bool                    `json:"legacy_source"`
	CreatedAt     string                  `json:"created_at"`
	UpdatedAt     string                  `json:"updated_at"`
	LastDelivery  *webhookDeliverySummary `json:"last_delivery"`
}

type webhookDeliveryItem struct {
	webhookDeliverySummary
	OccurrenceID int64  `json:"occurrence_id"`
	Kind         string `json:"kind"`
	Attempts     int    `json:"attempts"`
	RetryAfter   int64  `json:"retry_after"`
}

// The original environment-owned URL may contain credentials that were never
// entered in the panel. Show a safe address; omitting URL on PATCH preserves it.
func webhookVisibleURL(endpoint webhooks.Endpoint) string {
	if !endpoint.LegacySource {
		return endpoint.URL
	}
	u, err := url.Parse(endpoint.URL)
	if err != nil {
		return ""
	}
	visible := *u
	visible.User, visible.RawQuery, visible.Fragment, visible.RawFragment = nil, "", "", ""
	visible.ForceQuery = false
	return consoleRedactor(&config.Settings{WebhookSecret: endpoint.Secret}, u, nil)(visible.String())
}

func webhookItem(q store.Querier, endpoint webhooks.Endpoint) (webhookEndpointItem, error) {
	item := webhookEndpointItem{ID: endpoint.ID, Name: endpoint.Name, URL: webhookVisibleURL(endpoint), URLReadonly: endpoint.LegacySource,
		Enabled: endpoint.Enabled, NotifyDue: endpoint.NotifyDue, NotifyOverdue: endpoint.NotifyOverdue,
		HasSecret: endpoint.Secret != "", AllowPrivate: endpoint.AllowPrivate, LegacySource: endpoint.LegacySource,
		CreatedAt: endpoint.CreatedAt, UpdatedAt: endpoint.UpdatedAt}
	var last webhookDeliverySummary
	err := q.QueryRow(`SELECT state,attempted_at,sent_at,COALESCE(error,'') FROM deliveries WHERE channel=?
		ORDER BY attempted_at DESC,occurrence_id DESC,kind LIMIT 1`, webhooks.Channel(endpoint.ID)).Scan(&last.State, &last.AttemptedAt, &last.SentAt, &last.Error)
	if err == nil {
		item.LastDelivery = &last
	} else if !errors.Is(err, sql.ErrNoRows) {
		return item, err
	}
	return item, nil
}

func (s *Server) webhooksList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.consoleAdmin(r, false); err != nil {
		return err
	}
	items := []webhookEndpointItem{}
	err := s.readSnapshot(r.Context(), func(q store.Querier) error {
		endpoints, err := webhooks.List(q)
		if err != nil {
			return err
		}
		for _, endpoint := range endpoints {
			item, err := webhookItem(q, endpoint)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		return nil
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, map[string]any{"items": items, "limit": webhookEndpointLimit})
}

type webhookPatch struct {
	name, address, secret *string
	enabled, due, overdue *bool
}

func readWebhookPatch(r *http.Request, create bool) (webhookPatch, error) {
	var patch webhookPatch
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return patch, fail(415, "Ожидается Content-Type: application/json")
	}
	f, err := readForm(r, "name", "url", "secret", "enabled", "notify_due", "notify_overdue")
	if err != nil {
		return patch, err
	}
	if create {
		f.require("name", "url")
	}
	for name := range f.values {
		if f.isNull(name) {
			f.add(name, "Значение не может быть null", "value_error")
		}
	}
	patch.name, patch.address = f.text("name", textRule{trim: true, min: 1, max: 120}), f.text("url", textRule{trim: true, min: 1, max: 4096})
	patch.secret = f.text("secret", textRule{max: 4096})
	patch.enabled, patch.due, patch.overdue = f.boolean("enabled"), f.boolean("notify_due"), f.boolean("notify_overdue")
	if patch.name != nil && strings.IndexFunc(*patch.name, unicode.IsControl) >= 0 {
		f.add("name", "Название содержит недопустимые символы", "value_error")
	}
	if patch.secret != nil && (len(*patch.secret) > 4096 || security.IsSealedText(*patch.secret)) {
		f.add("secret", "Ожидается незашифрованный секрет не более 4096 байт", "value_error")
	}
	return patch, f.err()
}

// Saving does not perform DNS or network I/O. Literal private/reserved addresses
// are rejected here; DNS results are validated again by the sending transport.
func validateWebhookURL(raw string) (string, error) {
	u, err := consoleURL(raw, true)
	if err != nil {
		return "", err
	}
	if strings.Contains(raw, "#") {
		return "", fail(422, "URL webhook не должен содержать фрагмент после #")
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if ip, err := netip.ParseAddr(host); err == nil {
		if !consolePublic(ip) {
			return "", fail(422, "Для нового webhook нужен публичный адрес")
		}
	} else if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || !strings.Contains(host, ".") {
		return "", fail(422, "Для нового webhook нужен публичный адрес")
	}
	normalized, err := webhooks.NormalizeURL(raw)
	if err != nil {
		return "", fail(422, "Укажите корректный URL HTTP или HTTPS")
	}
	return normalized, nil
}

func liveWebhook(q store.Querier, id int64) (webhooks.Endpoint, error) {
	endpoint, err := webhooks.Get(q, id)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && endpoint.DeletedAt != nil) {
		return endpoint, fail(404, "Получатель webhook не найден")
	}
	return endpoint, err
}

func webhookDuplicate(q store.Querier, key string, except int64) error {
	var exists bool
	if err := q.QueryRow("SELECT EXISTS(SELECT 1 FROM webhook_endpoints WHERE url_key=? AND deleted_at IS NULL AND id<>?)", key, except).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return fail(409, "Получатель с таким URL уже добавлен")
	}
	return nil
}

func cancelWebhookPending(tx *sql.Tx, id int64) error {
	_, err := tx.Exec(`UPDATE deliveries SET state='cancelled' WHERE channel=? AND
		(state='pending' OR (state='sending' AND dispatch_started_at IS NULL))`, webhooks.Channel(id))
	return err
}

func (s *Server) webhooksCreate(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.consoleAdmin(r, true)
	if err != nil {
		return err
	}
	patch, err := readWebhookPatch(r, true)
	if err != nil {
		return err
	}
	address, err := validateWebhookURL(*patch.address)
	if err != nil {
		return err
	}
	key, err := webhooks.URLKey(address)
	if err != nil {
		return err
	}
	endpoint := webhooks.Endpoint{Name: *patch.name, URL: address, URLKey: key, Enabled: true, NotifyDue: true, NotifyOverdue: true, CreatedAt: schedule.Timestamp()}
	endpoint.UpdatedAt = endpoint.CreatedAt
	applyWebhookPatch(&endpoint, patch)
	var item webhookEndpointItem
	err = s.DB.Write(func(tx *sql.Tx) error {
		var count int
		if err := tx.QueryRow("SELECT count(*) FROM webhook_endpoints WHERE deleted_at IS NULL").Scan(&count); err != nil {
			return err
		}
		if count >= webhookEndpointLimit {
			return fail(409, "Можно добавить не более 50 получателей")
		}
		if err := webhookDuplicate(tx, key, 0); err != nil {
			return err
		}
		result, err := tx.Exec(`INSERT INTO webhook_endpoints(name,url,secret,url_key,enabled,notify_due,notify_overdue,allow_private,legacy_source,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,0,0,?,?)`, endpoint.Name, security.EncryptText("webhook_endpoints.url", endpoint.URL), security.EncryptText("webhook_endpoints.secret", endpoint.Secret), endpoint.URLKey,
			endpoint.Enabled, endpoint.NotifyDue, endpoint.NotifyOverdue, endpoint.CreatedAt, endpoint.UpdatedAt)
		if err != nil {
			return err
		}
		endpoint.ID, err = result.LastInsertId()
		if err != nil {
			return err
		}
		if err := audit.Record(tx, admin.Username, "webhook.create", itoa(endpoint.ID)); err != nil {
			return err
		}
		item, err = webhookItem(tx, endpoint)
		return err
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return writeJSON(w, 201, item)
}

func applyWebhookPatch(endpoint *webhooks.Endpoint, patch webhookPatch) {
	if patch.name != nil {
		endpoint.Name = *patch.name
	}
	if patch.secret != nil {
		endpoint.Secret = *patch.secret
	}
	if patch.enabled != nil {
		endpoint.Enabled = *patch.enabled
	}
	if patch.due != nil {
		endpoint.NotifyDue = *patch.due
	}
	if patch.overdue != nil {
		endpoint.NotifyOverdue = *patch.overdue
	}
}

func (s *Server) webhooksUpdate(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.consoleAdmin(r, true)
	if err != nil {
		return err
	}
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	patch, err := readWebhookPatch(r, false)
	if err != nil {
		return err
	}
	var item webhookEndpointItem
	changed := false
	err = s.DB.Write(func(tx *sql.Tx) error {
		before, err := liveWebhook(tx, id)
		if err != nil {
			return err
		}
		next := before
		applyWebhookPatch(&next, patch)
		if patch.address != nil && *patch.address != before.URL {
			next.URL, err = validateWebhookURL(*patch.address)
			if err != nil {
				return err
			}
			next.URLKey, err = webhooks.URLKey(next.URL)
			if err != nil {
				return err
			}
			next.AllowPrivate, next.LegacySource = false, false
		}
		changed = before != next
		if changed {
			if next.URL != before.URL || next.Secret != before.Secret {
				var dispatched bool
				if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM deliveries WHERE channel=? AND state='sending' AND dispatch_started_at IS NOT NULL)", webhooks.Channel(id)).Scan(&dispatched); err != nil {
					return err
				}
				if dispatched {
					return fail(409, "Доставка уже выполняется. Дождитесь её завершения перед изменением адреса или секрета")
				}
			}
			if err := webhookDuplicate(tx, next.URLKey, id); err != nil {
				return err
			}
			next.UpdatedAt = schedule.Timestamp()
			_, err := tx.Exec(`UPDATE webhook_endpoints SET name=?,url=?,secret=?,url_key=?,enabled=?,notify_due=?,notify_overdue=?,allow_private=?,legacy_source=?,updated_at=? WHERE id=?`,
				next.Name, security.EncryptText("webhook_endpoints.url", next.URL), security.EncryptText("webhook_endpoints.secret", next.Secret), next.URLKey, next.Enabled, next.NotifyDue, next.NotifyOverdue, next.AllowPrivate, next.LegacySource, next.UpdatedAt, id)
			if err != nil {
				return err
			}
			if next.URL != before.URL || next.Secret != before.Secret || next.Enabled != before.Enabled || next.NotifyDue != before.NotifyDue || next.NotifyOverdue != before.NotifyOverdue {
				if err := cancelWebhookPending(tx, id); err != nil {
					return err
				}
			}
			if err := audit.Record(tx, admin.Username, "webhook.update", itoa(id)); err != nil {
				return err
			}
		}
		item, err = webhookItem(tx, next)
		return err
	})
	if err != nil {
		return err
	}
	if changed {
		s.Worker.Kick()
	}
	return writeJSON(w, 200, item)
}

func (s *Server) webhooksDelete(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.consoleAdmin(r, true)
	if err != nil {
		return err
	}
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := liveWebhook(tx, id); err != nil {
			return err
		}
		now := schedule.Timestamp()
		if _, err := tx.Exec("UPDATE webhook_endpoints SET enabled=0,deleted_at=?,updated_at=? WHERE id=?", now, now, id); err != nil {
			return err
		}
		if err := cancelWebhookPending(tx, id); err != nil {
			return err
		}
		return audit.Record(tx, admin.Username, "webhook.delete", itoa(id))
	})
	if err != nil {
		return err
	}
	s.Worker.Kick()
	return noContent(w)
}

func (s *Server) webhooksTest(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.consoleAdmin(r, true)
	if err != nil {
		return err
	}
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	endpoint, err := liveWebhook(s.DB, id)
	if err != nil {
		return err
	}
	target, err := consoleURL(endpoint.URL, false)
	if err != nil {
		return err
	}
	if err := s.DB.Write(func(tx *sql.Tx) error { return audit.Record(tx, admin.Username, "webhook.test", itoa(id)) }); err != nil {
		return err
	}
	result, err := s.executeWebhookConsole(r, admin, consoleRequest{Destination: "configured", Method: "POST", Body: webhookTestBody}, target, endpoint.AllowPrivate, endpoint.Secret, target)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}

func (s *Server) webhooksHistory(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.consoleAdmin(r, false); err != nil {
		return err
	}
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	page, size, err := pageParams(r)
	if err != nil {
		return err
	}
	result := pageResult[webhookDeliveryItem]{Items: []webhookDeliveryItem{}, Page: page, PageSize: size}
	err = s.readSnapshot(r.Context(), func(q store.Querier) error {
		if _, err := webhooks.Get(q, id); errors.Is(err, sql.ErrNoRows) {
			return fail(404, "Получатель webhook не найден")
		} else if err != nil {
			return err
		}
		channel := webhooks.Channel(id)
		if err := q.QueryRow("SELECT count(*) FROM deliveries WHERE channel=?", channel).Scan(&result.Total); err != nil {
			return err
		}
		result.Pages = pageCount(result.Total, size)
		rows, err := q.Query(`SELECT occurrence_id,kind,state,attempts,attempted_at,sent_at,COALESCE(error,''),retry_after FROM deliveries WHERE channel=?
			ORDER BY attempted_at DESC,occurrence_id DESC,kind LIMIT ? OFFSET ?`, channel, size, (page-1)*size)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var item webhookDeliveryItem
			if err := rows.Scan(&item.OccurrenceID, &item.Kind, &item.State, &item.Attempts, &item.AttemptedAt, &item.SentAt, &item.Error, &item.RetryAfter); err != nil {
				return err
			}
			result.Items = append(result.Items, item)
		}
		return rows.Err()
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}
