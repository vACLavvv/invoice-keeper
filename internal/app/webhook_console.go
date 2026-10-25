package app

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/notify"
	"invoice-keeper/internal/app/webhooks"
)

const consoleBodyLimit = 64 << 10
const consoleResponseLimit = 128 << 10
const consoleHeaderLimit = 8 << 10
const consoleTimeout = 10 * time.Second

type consoleHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
type consoleRequest struct {
	Destination string          `json:"destination"`
	Method      string          `json:"method"`
	URL         string          `json:"url"`
	Headers     []consoleHeader `json:"headers"`
	Body        string          `json:"body"`
}
type consoleResponse struct {
	Status     int             `json:"status"`
	StatusText string          `json:"status_text"`
	DurationMS int64           `json:"duration_ms"`
	Headers    []consoleHeader `json:"headers"`
	Body       string          `json:"body"`
	Truncated  bool            `json:"truncated"`
	Error      string          `json:"error"`
}

func (s *Server) consoleAdmin(r *http.Request, write bool) (*User, error) {
	// An API token grants business API access, not the operator's network tools.
	if hasBearer(r) {
		return nil, fail(403, "Откройте консоль в сессии администратора")
	}
	if write {
		return s.adminWrite(r)
	}
	return s.adminUser(r)
}

func (s *Server) webhookConsoleSettings(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.consoleAdmin(r, false); err != nil {
		return err
	}
	target := ""
	u, err := consoleURL(s.Settings.WebhookURL, false)
	configured := err == nil && s.Settings.WebhookURL != ""
	if configured {
		display := *u
		display.User = nil
		display.RawQuery = ""
		display.ForceQuery = false
		display.Fragment = ""
		display.RawFragment = ""
		target = consoleRedactor(s.Settings, u, nil)(display.String())
	}
	return writeJSON(w, 200, map[string]any{"configured": configured, "target": target, "signing_enabled": configured && s.Settings.WebhookSecret != "", "health_available": configured && s.Settings.WebhookAllowPrivate, "max_body_bytes": consoleBodyLimit, "max_response_bytes": consoleResponseLimit, "timeout_seconds": int(consoleTimeout / time.Second)})
}

func consoleURL(raw string, custom bool) (*url.URL, error) {
	if raw == "" || len(raw) > 4096 || strings.IndexFunc(raw, unicode.IsControl) >= 0 {
		return nil, fail(422, "Укажите корректный URL HTTP или HTTPS")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Opaque != "" || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || strings.Contains(u.Hostname(), "%") || (custom && u.User != nil) {
		return nil, fail(422, "Укажите URL HTTP или HTTPS без логина и пароля в адресе")
	}
	if u.Port() != "" {
		port, err := strconv.Atoi(u.Port())
		if err != nil || port < 1 || port > 65535 {
			return nil, fail(422, "Неверный порт URL")
		}
	}
	return u, nil
}

func decodeConsoleRequest(r *http.Request) (consoleRequest, error) {
	var input consoleRequest
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		return input, fail(415, "Ожидается Content-Type: application/json")
	}
	// Escaped JSON can be six times larger than the actual UTF-8 request body.
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 512<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return input, fail(413, "Запрос слишком большой")
		}
		return input, fail(422, "Ожидается JSON-объект с параметрами запроса")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return input, fail(422, "Ожидается один JSON-объект")
	}
	if input.Method != "GET" && input.Method != "POST" {
		return input, fail(422, "Доступны только GET и POST")
	}
	if input.Destination != "custom" && input.Destination != "configured" && input.Destination != "health" {
		return input, fail(422, "Выберите адрес запроса")
	}
	if input.Method == "GET" && input.Body != "" {
		return input, fail(422, "GET-запрос отправляется без тела")
	}
	if len(input.Body) > consoleBodyLimit {
		return input, fail(413, "Тело запроса превышает 64 КиБ")
	}
	if len(input.Headers) > 20 {
		return input, fail(422, "Не более 20 заголовков")
	}
	size := 0
	seen := map[string]bool{}
	for _, header := range input.Headers {
		size += len(header.Name) + len(header.Value)
		name := strings.ToLower(header.Name)
		if !consoleHeaderName(header.Name) || strings.IndexFunc(header.Value, unicode.IsControl) >= 0 {
			return input, fail(422, "Заголовок содержит недопустимые символы")
		}
		if seen[name] {
			return input, fail(422, "Названия заголовков не должны повторяться")
		}
		seen[name] = true
		if consoleBlockedHeader(name, input.Destination) {
			return input, fail(422, "Этот заголовок управляется сервером и недоступен в консоли")
		}
	}
	if size > consoleHeaderLimit {
		return input, fail(413, "Заголовки превышают 8 КиБ")
	}
	return input, nil
}

func consoleHeaderName(name string) bool {
	if name == "" {
		return false
	}
	for _, r := range name {
		if r < 33 || r > 126 || strings.ContainsRune("()<>@,;:\\\"/[]?={} ", r) {
			return false
		}
	}
	return true
}
func consoleBlockedHeader(name, destination string) bool {
	if strings.HasPrefix(name, "proxy") || strings.HasPrefix(name, "forwarded") || strings.HasPrefix(name, "x-forwarded") || strings.HasPrefix(name, "sec-") || strings.HasPrefix(name, "x-invoice-keeper-") {
		return true
	}
	switch name {
	case "host", "cookie", "set-cookie", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "expect", "content-length":
		return true
	case "authorization":
		return destination != "custom"
	}
	return false
}

func (s *Server) consoleDestination(input consoleRequest) (*url.URL, bool, error) {
	if input.Destination == "custom" {
		u, err := consoleURL(input.URL, true)
		return u, false, err
	}
	if input.URL != "" {
		return nil, false, fail(422, "Адрес настроенного webhook нельзя переопределить")
	}
	u, err := consoleURL(s.Settings.WebhookURL, false)
	if err != nil {
		return nil, false, fail(422, "Webhook не настроен на сервере")
	}
	if input.Destination == "health" {
		if !s.Settings.WebhookAllowPrivate || input.Method != "GET" {
			return nil, false, fail(422, "Проверка /healthz доступна только как GET для локального настроенного получателя")
		}
		u.Path = "/healthz"
		u.RawPath = ""
		u.RawQuery = ""
		u.ForceQuery = false
		u.Fragment = ""
		u.RawFragment = ""
	}
	return u, s.Settings.WebhookAllowPrivate, nil
}

func consolePublic(ip netip.Addr) bool {
	return webhooks.PublicAddress(ip)
}
func consoleClient(allowPrivate bool) *http.Client {
	client := notify.WebhookClient(&config.Settings{WebhookAllowPrivate: allowPrivate})
	transport := client.Transport.(*http.Transport)
	transport.DisableKeepAlives = true
	transport.ForceAttemptHTTP2 = false
	transport.DisableCompression = true
	transport.MaxResponseHeaderBytes = consoleHeaderLimit
	if !allowPrivate {
		baseDial := transport.DialContext
		transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, notify.ErrPrivateAddress
			}
			ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}
			if len(ips) == 0 {
				return nil, notify.ErrPrivateAddress
			}
			for _, ip := range ips {
				if !consolePublic(ip) {
					return nil, notify.ErrPrivateAddress
				}
			}
			// A single validated destination per console click; no implicit retry
			// across several addresses after a failed connection.
			return baseDial(ctx, network, net.JoinHostPort(ips[0].String(), port))
		}
	}
	return client
}

func consoleRequestID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	x := hex.EncodeToString(raw[:])
	return x[:8] + "-" + x[8:12] + "-" + x[12:16] + "-" + x[16:20] + "-" + x[20:], nil
}

func consoleRedactor(settings *config.Settings, target *url.URL, headers []consoleHeader) func(string) string {
	secrets := []string{settings.WebhookSecret}
	if target != nil && target.User != nil {
		secrets = append(secrets, target.User.Username())
		password, _ := target.User.Password()
		// net/http converts URL userinfo into Basic authentication. Echo endpoints
		// must not turn server-owned credentials into a recoverable browser value.
		basic := base64.StdEncoding.EncodeToString([]byte(target.User.Username() + ":" + password))
		secrets = append(secrets, password, basic, "Basic "+basic)
	}
	if target != nil {
		for _, values := range target.Query() {
			secrets = append(secrets, values...)
		}
	}
	for _, header := range headers {
		if strings.EqualFold(header.Name, "Authorization") {
			secrets = append(secrets, header.Value)
			parts := strings.Fields(header.Value)
			if len(parts) > 1 {
				secrets = append(secrets, parts[len(parts)-1])
			}
		}
	}
	variants := map[string]bool{}
	for _, secret := range secrets {
		if secret == "" {
			continue
		}
		variants[secret] = true
		variants[url.QueryEscape(secret)] = true
		variants[url.PathEscape(secret)] = true
		encoded, _ := json.Marshal(secret)
		variants[string(encoded[1:len(encoded)-1])] = true
	}
	keys := make([]string, 0, len(variants))
	for key := range variants {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool { return len(keys[i]) > len(keys[j]) })
	pairs := make([]string, 0, len(keys)*2)
	for _, key := range keys {
		pairs = append(pairs, key, "[скрыто]")
	}
	replacer := strings.NewReplacer(pairs...)
	return replacer.Replace
}

func consoleBoundBody(body string) (string, bool) {
	if len(body) <= consoleResponseLimit {
		return body, false
	}
	end := consoleResponseLimit
	for end > 0 && !utf8.RuneStart(body[end]) {
		end--
	}
	return body[:end], true
}

func (s *Server) consoleAudit(actor, action, id, method, host string, status int) error {
	entity, _ := json.Marshal(map[string]any{"request_id": id, "method": method, "host": host, "status": status})
	return s.DB.Write(func(tx *sql.Tx) error { return audit.Record(tx, actor, action, string(entity)) })
}

func (s *Server) webhookConsoleRequest(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.consoleAdmin(r, true)
	if err != nil {
		return err
	}
	input, err := decodeConsoleRequest(r)
	if err != nil {
		return err
	}
	target, allowPrivate, err := s.consoleDestination(input)
	if err != nil {
		return err
	}
	var secretTarget *url.URL
	if input.Destination != "custom" {
		secretTarget, _ = url.Parse(s.Settings.WebhookURL)
	}
	result, err := s.executeWebhookConsole(r, admin, input, target, allowPrivate, s.Settings.WebhookSecret, secretTarget)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, result)
}

// executeWebhookConsole shares limits and transport protections with one-click
// endpoint tests. It never holds a database transaction while awaiting a receiver.
func (s *Server) executeWebhookConsole(r *http.Request, admin *User, input consoleRequest, target *url.URL, allowPrivate bool, secret string, secretTarget *url.URL) (consoleResponse, error) {
	for {
		active := s.webhookConsoleActive.Load()
		if active >= 2 {
			return consoleResponse{}, &apiError{Status: 429, Detail: "Уже выполняются два запроса. Дождитесь результата.", Header: http.Header{"Retry-After": []string{"1"}}}
		}
		if s.webhookConsoleActive.CompareAndSwap(active, active+1) {
			break
		}
	}
	defer s.webhookConsoleActive.Add(-1)
	id, err := consoleRequestID()
	if err != nil {
		return consoleResponse{}, err
	}
	ctx, cancel := context.WithTimeout(r.Context(), consoleTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, input.Method, target.String(), strings.NewReader(input.Body))
	if err != nil {
		return consoleResponse{}, fail(422, "Не удалось составить HTTP-запрос")
	}
	request.GetBody = nil
	request.Close = true
	request.Header.Set("User-Agent", "InvoiceKeeper-Console/1")
	for _, header := range input.Headers {
		request.Header.Set(header.Name, header.Value)
	}
	if input.Method == "POST" && request.Header.Get("Content-Type") == "" {
		request.Header.Set("Content-Type", "application/json")
	}
	if input.Destination == "configured" && input.Method == "POST" {
		request.Header.Set("X-Invoice-Keeper-Event", "webhook.test")
		request.Header.Set("X-Invoice-Keeper-Delivery", "test:"+id)
		if secret != "" {
			request.Header.Set("X-Invoice-Keeper-Signature", notify.WebhookSignature(secret, []byte(input.Body)))
		}
	}
	if err := s.consoleAudit(admin.Username, "webhook.request.started", id, input.Method, target.Hostname(), 0); err != nil {
		return consoleResponse{}, err
	}
	started := time.Now()
	result := consoleResponse{Headers: []consoleHeader{}}
	client := consoleClient(allowPrivate)
	defer client.CloseIdleConnections()
	response, sendErr := client.Do(request)
	redact := consoleRedactor(&config.Settings{WebhookSecret: secret}, secretTarget, input.Headers)
	if sendErr != nil {
		switch {
		case errors.Is(sendErr, notify.ErrPrivateAddress):
			result.Error = "Запрос к локальной, частной или зарезервированной сети запрещён"
		case errors.Is(ctx.Err(), context.Canceled):
			result.Error = "Запрос отменён. Получатель мог его обработать; автоматического повтора нет."
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			result.Error = "Время ожидания истекло. Получатель мог обработать запрос; автоматического повтора нет."
		default:
			result.Error = "Не удалось получить ответ. Получатель мог обработать запрос; автоматического повтора нет."
		}
	} else {
		defer response.Body.Close()
		result.Status = response.StatusCode
		result.StatusText = http.StatusText(response.StatusCode)
		keys := make([]string, 0, len(response.Header))
		for key := range response.Header {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		headerSize := 0
		for _, key := range keys {
			for _, value := range response.Header.Values(key) {
				switch strings.ToLower(key) {
				case "set-cookie", "authorization", "proxy-authorization", "authentication-info", "proxy-authentication-info":
					value = "[скрыто]"
				}
				safeName, safeValue := redact(key), redact(value)
				if len(result.Headers) >= 40 || headerSize+len(safeName)+len(safeValue) > consoleHeaderLimit {
					result.Truncated = true
					continue
				}
				headerSize += len(safeName) + len(safeValue)
				result.Headers = append(result.Headers, consoleHeader{Name: safeName, Value: safeValue})
			}
		}
		raw, readErr := io.ReadAll(io.LimitReader(response.Body, consoleResponseLimit+1))
		if len(raw) > consoleResponseLimit {
			result.Truncated = true
			raw = raw[:consoleResponseLimit]
		}
		var expanded bool
		result.Body, expanded = consoleBoundBody(redact(strings.ToValidUTF8(string(raw), "�")))
		result.Truncated = result.Truncated || expanded
		if readErr != nil {
			result.Truncated = true
			result.Error = "Ответ получен не полностью. Автоматического повтора нет."
		}
	}
	result.DurationMS = time.Since(started).Milliseconds()
	if err := s.consoleAudit(admin.Username, "webhook.request.completed", id, input.Method, target.Hostname(), result.Status); err != nil {
		log.Print("Webhook console: could not record completion in audit log")
		result.Error = "Запрос завершён, но результат не записан в журнал. Не повторяйте его автоматически."
	}
	return result, nil
}
