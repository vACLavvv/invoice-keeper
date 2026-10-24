package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	invoicekeeper "invoice-keeper"
)

const testPassword = "TestAdmin-Only123!"

type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Today() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *clock) Set(t time.Time)  { c.mu.Lock(); defer c.mu.Unlock(); c.now = t }

type harness struct {
	t        *testing.T
	settings *Settings
	db       *DB
	server   *Server
	http     *httptest.Server
	clock    *clock
}

func setup(t *testing.T) *harness {
	t.Helper()
	settings := &Settings{DatabasePath: filepath.Join(t.TempDir(), "test.sqlite3"), AdminUsername: "admin", AdminPassword: testPassword}
	if err := settings.Validate(); err != nil {
		t.Fatal(err)
	}
	e := &harness{t: t, settings: settings, clock: &clock{now: civil(2026, 1, 28)}}
	e.start()
	return e
}

// start opens the database and serves it; calling it again simulates a restart.
func (e *harness) start() {
	e.t.Helper()
	db, err := OpenDB(e.settings.DatabasePath)
	if err != nil {
		e.t.Fatal(err)
	}
	server, err := NewServer(e.settings, db, invoicekeeper.Assets, Options{Today: e.clock.Today})
	if err != nil {
		e.t.Fatal(err)
	}
	e.db, e.server, e.http = db, server, httptest.NewServer(server)
	e.t.Cleanup(func() {
		e.http.Close()
		server.Worker.Wait()
		db.Close()
	})
}

type client struct {
	e     *harness
	http  *http.Client
	csrf  string
	token string // API key, sent as Authorization: Bearer
}

func (e *harness) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{e: e, http: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

type response struct {
	status int
	header http.Header
	body   []byte
}

func (r response) json(t *testing.T, target any) {
	t.Helper()
	if err := json.Unmarshal(r.body, target); err != nil {
		t.Fatalf("decode %s: %v", r.body, err)
	}
}

func (r response) object(t *testing.T) map[string]any {
	var m map[string]any
	r.json(t, &m)
	return m
}

func (r response) list(t *testing.T) []map[string]any {
	var l []map[string]any
	r.json(t, &l)
	return l
}

func (c *client) do(method, path string, body any, headers ...string) response {
	c.e.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	request, _ := http.NewRequest(method, c.e.http.URL+path, reader)
	request.Header.Set("Content-Type", "application/json")
	if c.csrf != "" {
		request.Header.Set("X-CSRF-Token", c.csrf)
	}
	if c.token != "" {
		request.Header.Set("Authorization", "Bearer "+c.token)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}
	result, err := c.http.Do(request)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer result.Body.Close()
	data, _ := io.ReadAll(result.Body)
	// Background reminder passes finish before the test looks at the outcome.
	c.e.server.Worker.Wait()
	return response{result.StatusCode, result.Header, data}
}

func (c *client) get(path string) response             { return c.do("GET", path, nil) }
func (c *client) post(path string, body any) response  { return c.do("POST", path, body) }
func (c *client) patch(path string, body any) response { return c.do("PATCH", path, body) }
func (c *client) delete(path string) response          { return c.do("DELETE", path, nil) }

func (c *client) signIn(credentials ...string) map[string]any {
	c.e.t.Helper()
	username, password := "admin", testPassword
	if len(credentials) == 2 {
		username, password = credentials[0], credentials[1]
	}
	r := c.post("/api/v1/auth/login", map[string]any{"username": username, "password": password})
	if r.status != 200 {
		c.e.t.Fatalf("login %s: %d %s", username, r.status, r.body)
	}
	user := r.object(c.e.t)
	c.csrf = user["csrf_token"].(string)
	return user
}

func (c *client) createPayment(values map[string]any) map[string]any {
	c.e.t.Helper()
	payload := map[string]any{"title": "Аренда", "amount": "100.10", "currency": "RUB", "first_due_date": "2026-01-31"}
	for k, v := range values {
		payload[k] = v
	}
	r := c.post("/api/v1/recurring-payments", payload)
	if r.status != 201 {
		c.e.t.Fatalf("create payment: %d %s", r.status, r.body)
	}
	return r.object(c.e.t)
}

func expect[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}

func id(item map[string]any) string { return itoa(int64(item["id"].(float64))) }
