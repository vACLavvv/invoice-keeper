package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/notify"
)

const consolePath = "/api/v1/webhook-console"
const consoleSendPath = consolePath + "/requests"

func consoleResult(t *testing.T, response response) consoleResponse {
	t.Helper()
	if response.status != 200 {
		t.Fatalf("console status %d: %s", response.status, response.body)
	}
	var result consoleResponse
	response.json(t, &result)
	if result.Headers == nil {
		t.Fatal("headers must be a non-null array")
	}
	return result
}

func TestWebhookConsoleOnlyAdminSessionAndCSRF(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	var calls atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer receiver.Close()
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL, true
	body := consoleRequest{Destination: "configured", Method: "POST", Body: `{}`}
	for _, path := range []string{consolePath, consoleSendPath} {
		if path == consolePath {
			expect(t, "anonymous GET", e.client().get(path).status, 401)
		} else {
			expect(t, "anonymous POST", e.client().post(path, body).status, 401)
		}
	}
	admin.post("/api/v1/users", map[string]any{"username": "alex", "display_name": "User", "email": "user@example.com", "password": "User-password123!"})
	user := e.client()
	user.signIn("alex", "User-password123!")
	expect(t, "regular user GET", user.get(consolePath).status, 403)
	expect(t, "regular user POST", user.post(consoleSendPath, body).status, 403)
	for _, access := range []string{"read", "write"} {
		token := e.keyClient(admin.createToken(access, 30))
		expect(t, access+" token GET", token.get(consolePath).status, 403)
		expect(t, access+" token POST", token.post(consoleSendPath, body).status, 403)
	}
	withoutCSRF := *admin
	withoutCSRF.csrf = ""
	expect(t, "CSRF required", withoutCSRF.post(consoleSendPath, body).status, 403)
	expect(t, "foreign origin", admin.do("POST", consoleSendPath, body, "Origin", "https://evil.example").status, 403)
	expect(t, "no unauthorized external request", calls.Load(), int32(0))
	expect(t, "no side effect on settings read", admin.get(consolePath).status, 200)
	expect(t, "read stays read-only", calls.Load(), int32(0))
}

func TestWebhookConsoleConfiguredSigningRedactionAndAudit(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	const secret, password, token = "server-signing-secret", "server-basic-password", "server-query-secret"
	const body = `{"event":"webhook.test","message":"Invoice Keeper webhook test"}`
	type captured struct {
		Method, URI, Body string
		Headers           http.Header
	}
	seen := make(chan captured, 1)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		seen <- captured{r.Method, r.RequestURI, string(raw), r.Header.Clone()}
		w.Header().Set("Set-Cookie", "remote-secret-cookie")
		w.Header().Set("X-Echo", secret+" "+token)
		fmt.Fprintf(w, "%s %s %s %s", secret, token, password, r.Header.Get("Authorization"))
	}))
	defer receiver.Close()
	target, _ := url.Parse(receiver.URL + "/exact/receiver?token=" + token + "#private-fragment")
	target.User = url.UserPassword("server-user", password)
	e.settings.WebhookURL, e.settings.WebhookSecret, e.settings.WebhookAllowPrivate = target.String(), secret, true
	settings := admin.get(consolePath).object(t)
	expect(t, "safe target", settings["target"], any(receiver.URL+"/exact/receiver"))
	expect(t, "signing enabled", settings["signing_enabled"], any(true))
	expect(t, "health available", settings["health_available"], any(true))
	result := consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Body: body, Headers: []consoleHeader{{"X-Example", "operator-value"}}}))
	expect(t, "remote status", result.Status, 200)
	expect(t, "no error", result.Error, "")
	request := <-seen
	expect(t, "exact configured path and query", request.URI, "/exact/receiver?token="+token)
	expect(t, "request body unchanged", request.Body, body)
	expect(t, "content type default", request.Headers.Get("Content-Type"), "application/json")
	expect(t, "no ambient cookie", request.Headers.Get("Cookie"), "")
	expect(t, "no panel CSRF token", request.Headers.Get("X-CSRF-Token"), "")
	expect(t, "signature", request.Headers.Get("X-Invoice-Keeper-Signature"), notify.WebhookSignature(secret, []byte(body)))
	expect(t, "event", request.Headers.Get("X-Invoice-Keeper-Event"), "webhook.test")
	if !regexp.MustCompile(`^test:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(request.Headers.Get("X-Invoice-Keeper-Delivery")) {
		t.Fatal("test delivery must contain a canonical UUIDv4")
	}
	encoded, _ := json.Marshal(result)
	for _, value := range []string{secret, token, password, base64.StdEncoding.EncodeToString([]byte("server-user:" + password)), "remote-secret-cookie"} {
		if bytes.Contains(encoded, []byte(value)) {
			t.Fatalf("response leaked server-owned credential %q", value)
		}
	}
	rows, err := e.db.Query("SELECT action,entity FROM audit_log WHERE action LIKE 'webhook.request.%' ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var action, entity string
		if err := rows.Scan(&action, &entity); err != nil {
			t.Fatal(err)
		}
		var data map[string]any
		if err := json.Unmarshal([]byte(entity), &data); err != nil {
			t.Fatal(err)
		}
		expect(t, "safe audit field count", len(data), 4)
		expect(t, "audit hostname only", data["host"], any(target.Hostname()))
		expect(t, "audit method", data["method"], any("POST"))
		expect(t, "shared request identifier", "test:"+data["request_id"].(string), request.Headers.Get("X-Invoice-Keeper-Delivery"))
		wantAction, status := "webhook.request.started", float64(0)
		if count == 1 {
			wantAction, status = "webhook.request.completed", 200
		}
		expect(t, "audit phase", action, wantAction)
		expect(t, "audit status", data["status"], any(status))
		count++
	}
	rows.Close()
	expect(t, "start and completion audit", count, 2)
	expect(t, "authentic trail", admin.get("/api/v1/audit-log/verify").object(t)["ok"], any(true))
}

func TestWebhookConsoleHealthScopeAndSSRF(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	var calls atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		fmt.Fprint(w, r.Method+" "+r.RequestURI)
	}))
	defer receiver.Close()
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL+"/configured?key=secret-query", true
	result := consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "health", Method: "GET"}))
	expect(t, "fixed health path", result.Body, "GET /healthz")
	for _, request := range []consoleRequest{
		{Destination: "configured", Method: "POST", URL: receiver.URL + "/another"},
		{Destination: "health", Method: "GET", URL: receiver.URL + "/another"},
		{Destination: "health", Method: "POST"},
	} {
		expect(t, "cannot change configured scope", admin.post(consoleSendPath, request).status, 422)
	}
	for _, address := range []string{receiver.URL, strings.Replace(receiver.URL, "127.0.0.1", "localhost", 1), "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://192.0.2.1/"} {
		result := consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "custom", Method: "GET", URL: address}))
		expect(t, "custom private network refused", result.Status, 0)
		if result.Error == "" {
			t.Fatal("blocked request must explain its failure")
		}
	}
	expect(t, "only authorized health request reached receiver", calls.Load(), int32(1))
	e.settings.WebhookAllowPrivate = false
	expect(t, "health disabled without private opt-in", admin.get(consolePath).object(t)["health_available"], any(false))
	expect(t, "health request disabled", admin.post(consoleSendPath, consoleRequest{Destination: "health", Method: "GET"}).status, 422)
	result = consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "GET"}))
	expect(t, "configured honors private prohibition", result.Status, 0)
	expect(t, "configured target not contacted", calls.Load(), int32(1))
}

func TestWebhookConsoleNeverFollowsRedirectsOrRetries(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	var redirectCalls, calls atomic.Int32
	redirectTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirectCalls.Add(1) }))
	defer redirectTarget.Close()
	mode := atomic.Int32{}
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch mode.Load() {
		case 0:
			http.Redirect(w, r, redirectTarget.URL, http.StatusTemporaryRedirect)
		case 1:
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
		case 2:
			w.WriteHeader(http.StatusServiceUnavailable)
		case 3:
			io.Copy(io.Discard, r.Body)
			conn, _, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Error(err)
				return
			}
			conn.Close()
		}
	}))
	defer receiver.Close()
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL, true
	for i, want := range []int{307, 429, 503, 0} {
		mode.Store(int32(i))
		result := consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Body: `{}`}))
		expect(t, "one response per click", result.Status, want)
		expect(t, "one network request per click", calls.Load(), int32(i+1))
	}
	expect(t, "redirect target never contacted", redirectCalls.Load(), int32(0))
}

func TestWebhookConsoleValidatesHeadersAndRequestBounds(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	var calls atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		raw, _ := io.ReadAll(r.Body)
		fmt.Fprint(w, len(raw))
	}))
	defer receiver.Close()
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL, true
	for _, name := range []string{"Host", "Cookie", "Proxy-Authorization", "Forwarded", "X-Forwarded-For", "Connection", "Transfer-Encoding", "X-Invoice-Keeper-Signature", "Authorization", "Bad Header"} {
		req := consoleRequest{Destination: "configured", Method: "POST", Headers: []consoleHeader{{name, "x"}}}
		expect(t, "blocked header "+name, admin.post(consoleSendPath, req).status, 422)
	}
	for _, headers := range [][]consoleHeader{
		{{"X-Echo", "x\r\nCookie: secret"}}, {{"X-Echo", "a"}, {"x-echo", "b"}},
	} {
		expect(t, "unsafe headers", admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Headers: headers}).status, 422)
	}
	headers := []consoleHeader{}
	for i := range 21 {
		headers = append(headers, consoleHeader{fmt.Sprintf("X-Test-%d", i), "x"})
	}
	expect(t, "header count", admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Headers: headers}).status, 422)
	expect(t, "header size", admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Headers: []consoleHeader{{"X-Test", strings.Repeat("x", consoleHeaderLimit)}}}).status, 413)
	expect(t, "body size", admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Body: strings.Repeat("x", consoleBodyLimit+1)}).status, 413)
	expect(t, "GET body", admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "GET", Body: "x"}).status, 422)
	expect(t, "no outbound invalid requests", calls.Load(), int32(0))
	// Every NUL is six bytes in outer JSON but one byte in the actual outbound body.
	result := consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST", Body: strings.Repeat("\x00", consoleBodyLimit)}))
	expect(t, "actual body bound permits escaped JSON", result.Body, fmt.Sprint(consoleBodyLimit))
	expect(t, "one valid request", calls.Load(), int32(1))
	expect(t, "JSON media type required", admin.do("POST", consoleSendPath, consoleRequest{Destination: "configured", Method: "GET"}, "Content-Type", "text/plain").status, 415)
}

func TestWebhookConsoleResponseBoundsIncludeRedactionAndUTF8(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	mode := atomic.Int32{}
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch mode.Load() {
		case 0:
			fmt.Fprint(w, strings.Repeat("a", consoleResponseLimit+10))
		case 1:
			fmt.Fprint(w, strings.Repeat("x", 20000))
		case 2:
			w.Write(bytes.Repeat([]byte{0xff, 'a'}, consoleResponseLimit/2))
		case 3:
			for i := range 50 {
				w.Header().Set(fmt.Sprintf("X-Header-%02d", i), "value")
			}
		case 4:
			w.Header().Set("X-Large", strings.Repeat("x", 7000))
		}
	}))
	defer receiver.Close()
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL, true
	for i := range 5 {
		mode.Store(int32(i))
		if i == 1 || i == 4 {
			e.settings.WebhookSecret = "x"
		} else {
			e.settings.WebhookSecret = ""
		}
		result := consoleResult(t, admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "GET"}))
		expect(t, "response reachable", result.Status, 200)
		expect(t, "truncation reported", result.Truncated, true)
		if len(result.Body) > consoleResponseLimit || !utf8.ValidString(result.Body) {
			t.Fatal("response exceeds UTF-8 byte bound")
		}
		headerBytes := 0
		for _, header := range result.Headers {
			headerBytes += len(header.Name) + len(header.Value)
		}
		if headerBytes > consoleHeaderLimit || len(result.Headers) > 40 {
			t.Fatal("response header bound violated")
		}
	}
}

func TestWebhookConsoleRedactorDoesNotCorruptCustomQueryResults(t *testing.T) {
	settings := &config.Settings{WebhookSecret: "server-secret"}
	redact := consoleRedactor(settings, nil, []consoleHeader{{"Authorization", "Bearer operator-secret"}})
	expect(t, "ordinary values retained", redact(`{"limit":1,"total":101}`), `{"limit":1,"total":101}`)
	expect(t, "explicit authorization hidden", redact("Bearer operator-secret server-secret"), "[скрыто] [скрыто]")
	for _, address := range []string{"127.0.0.1", "10.0.0.1", "192.168.2.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "255.255.255.255", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1", "64:ff9b::7f00:1", "2002:7f00:1::1"} {
		if consolePublic(netip.MustParseAddr(address)) {
			t.Errorf("non-public destination accepted: %s", address)
		}
	}
	for _, address := range []string{"8.8.8.8", "2606:4700:4700::1111"} {
		if !consolePublic(netip.MustParseAddr(address)) {
			t.Errorf("public destination rejected: %s", address)
		}
	}
}

func TestWebhookConsoleAuditFailurePreventsSending(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	var calls atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer receiver.Close()
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL, true
	if _, err := e.db.Exec("CREATE TRIGGER block_console_audit BEFORE INSERT ON audit_log WHEN NEW.action='webhook.request.started' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END"); err != nil {
		t.Fatal(err)
	}
	expect(t, "audit unavailable", admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "POST"}).status, 500)
	expect(t, "network side effect prevented", calls.Load(), int32(0))
}

func TestWebhookConsoleBoundsConcurrentRequestsAndCancels(t *testing.T) {
	e := setup(t)
	admin := e.client()
	admin.signIn()
	entered := make(chan struct{}, 3)
	release := make(chan struct{})
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entered <- struct{}{}
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer receiver.Close()
	defer close(release)
	e.settings.WebhookURL, e.settings.WebhookAllowPrivate = receiver.URL, true
	finished := make(chan response, 2)
	for range 2 {
		go func() {
			finished <- admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "GET"})
		}()
	}
	for range 2 {
		select {
		case <-entered:
		case <-time.After(3 * time.Second):
			t.Fatal("request did not enter receiver")
		}
	}
	third := admin.post(consoleSendPath, consoleRequest{Destination: "configured", Method: "GET"})
	expect(t, "concurrency limit", third.status, 429)
	expect(t, "retry advice", third.header.Get("Retry-After"), "1")
	for range 2 {
		release <- struct{}{}
	}
	for range 2 {
		expect(t, "active request completes", (<-finished).status, 200)
	}
	expect(t, "slots released", e.server.webhookConsoleActive.Load(), int32(0))

	// Invoke the production handler with a cancelled caller context to verify that
	// cancellation also releases the shared semaphore and cancels outbound I/O.
	raw, _ := json.Marshal(consoleRequest{Destination: "configured", Method: "GET"})
	request := httptest.NewRequest("POST", consoleSendPath, bytes.NewReader(raw))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", e.http.URL)
	request.Header.Set("X-CSRF-Token", admin.csrf)
	u, _ := url.Parse(e.http.URL)
	for _, cookie := range admin.http.Jar.Cookies(u) {
		request.AddCookie(cookie)
	}
	request.Host = u.Host
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	request = request.WithContext(ctx)
	output := httptest.NewRecorder()
	done := make(chan error, 1)
	go func() { done <- e.server.webhookConsoleRequest(output, request) }()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("cancelled request did not enter receiver")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("caller cancellation ignored")
	}
	var result consoleResponse
	if err := json.Unmarshal(output.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	expect(t, "cancelled response has no status", result.Status, 0)
	expect(t, "cancelled slot released", e.server.webhookConsoleActive.Load(), int32(0))
	if !strings.Contains(result.Error, "отменён") {
		t.Fatal("cancellation warning missing", result.Error)
	}
}
