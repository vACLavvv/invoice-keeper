package app

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"invoice-keeper/internal/app/store"
)

func TestOccurrenceSpoolPrivateAndRemovedOnFailure(t *testing.T) {
	dir := t.TempDir()
	s := &Server{DB: &store.DB{Path: filepath.Join(dir, "test.sqlite3")}}
	sentinel := errors.New("storage failed")
	w := httptest.NewRecorder()
	err := s.spoolOccurrenceResponse(w, httptest.NewRequest("GET", "/", nil), "application/json", "", func(out io.Writer) error {
		files, _ := filepath.Glob(filepath.Join(dir, ".invoice-keeper-response-*"))
		if len(files) != 1 {
			t.Fatalf("private spool count %d", len(files))
		}
		info, err := os.Stat(files[0])
		if err != nil {
			t.Fatal(err)
		}
		expect(t, "private permissions", info.Mode().Perm(), os.FileMode(0o600))
		if _, err := io.WriteString(out, "partial"); err != nil {
			return err
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("got %v", err)
	}
	expect(t, "no partial HTTP response", w.Body.Len(), 0)
	files, _ := filepath.Glob(filepath.Join(dir, ".invoice-keeper-response-*"))
	expect(t, "cleanup after failure", len(files), 0)
	expect(t, "slot released", len(occurrenceSpoolSlots), 0)
}

func TestOccurrenceSpoolMemoryDatabaseUsesTempDirectory(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)
	s := &Server{DB: &store.DB{Path: ":memory:"}}
	err := s.spoolOccurrenceResponse(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil), "application/json", "", func(out io.Writer) error {
		files, _ := filepath.Glob(filepath.Join(tmp, ".invoice-keeper-response-*"))
		expect(t, "memory DB spool outside repository", len(files), 1)
		_, err := io.WriteString(out, "[]")
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(tmp, ".invoice-keeper-response-*"))
	expect(t, "cleanup", len(files), 0)
}

func TestOccurrenceSpoolWaitingHonorsCancellation(t *testing.T) {
	occurrenceSpoolSlots <- struct{}{}
	occurrenceSpoolSlots <- struct{}{}
	defer func() { <-occurrenceSpoolSlots; <-occurrenceSpoolSlots }()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := &Server{DB: &store.DB{Path: filepath.Join(t.TempDir(), "test.sqlite3")}}
	err := s.spoolOccurrenceResponse(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil).WithContext(ctx), "application/json", "", func(io.Writer) error { t.Fatal("cancelled request must not create spool"); return nil })
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
}

type slowSpoolClient struct {
	header           http.Header
	entered, release chan struct{}
	once             sync.Once
}

func (w *slowSpoolClient) Header() http.Header { return w.header }
func (w *slowSpoolClient) WriteHeader(int)     {}
func (w *slowSpoolClient) Write(p []byte) (int, error) {
	w.once.Do(func() { close(w.entered); <-w.release })
	return len(p), nil
}

func TestSlowLegacyResponseReleasesDatabaseConnection(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"frequency": "once"})
	e.server.Worker.Wait()
	e.db.SetMaxOpenConns(1)
	w := &slowSpoolClient{header: make(http.Header), entered: make(chan struct{}), release: make(chan struct{})}
	response := make(chan error, 1)
	go func() {
		response <- e.server.occurrenceJSON(w, httptest.NewRequest("GET", "/", nil), occurrenceFilter{includeArchived: true})
	}()
	select {
	case <-w.entered:
	case <-time.After(2 * time.Second):
		close(w.release)
		t.Fatal("response did not start")
	}
	write := make(chan error, 1)
	go func() {
		write <- e.db.Write(func(tx *sql.Tx) error {
			_, err := tx.Exec("INSERT INTO app_state(key,value) VALUES('slow_client_probe','ok')")
			return err
		})
	}()
	select {
	case err := <-write:
		if err != nil {
			t.Error(err)
		}
	case <-time.After(2 * time.Second):
		t.Error("slow legacy client retained the only DB connection")
	}
	close(w.release)
	if err := <-response; err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(filepath.Dir(e.db.Path), ".invoice-keeper-response-*"))
	expect(t, "successful response cleanup", len(files), 0)
}

func TestSpoolCSVMatchesFiltersAndEscapesSpreadsheetCells(t *testing.T) {
	e := setup(t)
	c := e.client()
	c.signIn()
	c.createPayment(map[string]any{"title": "=SUM(1)", "currency": "EUR", "amount": "12.34", "frequency": "once", "first_due_date": "2026-01-20"})
	c.createPayment(map[string]any{"title": "Other", "currency": "USD", "frequency": "once"})
	response := c.get("/api/v1/payment-occurrences/export?currency=EUR&view=open")
	expect(t, "csv status", response.status, 200)
	if !strings.HasPrefix(string(response.body), "\uFEFF") {
		t.Fatal("Excel BOM missing")
	}
	if !strings.Contains(string(response.body), "'=SUM(1)") || !strings.Contains(string(response.body), "12,34") || strings.Contains(string(response.body), "Other") {
		t.Fatalf("CSV mismatch %s", response.body)
	}
}
