package app

// Contract checks: every JSON response the tests receive is validated against docs/openapi.json
// (status documented for the operation, body matching its schema). The whole suite thus doubles
// as a contract test: a handler that drifts from the spec fails whichever test touches it.

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"

	"invoice-keeper/internal/api"
)

var contractRouter = sync.OnceValues(func() (routers.Router, error) {
	doc, err := api.GetSwagger()
	if err != nil {
		return nil, err
	}
	doc.Servers = nil // match by path only: the test server has a random port
	return legacy.NewRouter(doc)
})

type responseRecorder struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
}

func (r *responseRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
func (r *responseRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = 200
	}
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}

// validateContract wraps the handler under test and reports responses that break the spec.
func validateContract(t *testing.T, next http.Handler) http.Handler {
	router, err := contractRouter()
	if err != nil {
		t.Fatal(err)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &responseRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if !strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/healthz" {
			return
		}
		if !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
			return // files, CSV and the Swagger page are not JSON schemas
		}
		route, params, err := router.FindRoute(r)
		if err != nil {
			return // an undocumented path answers the generic 404, checked elsewhere
		}
		input := &openapi3filter.ResponseValidationInput{
			RequestValidationInput: &openapi3filter.RequestValidationInput{Request: r, PathParams: params, Route: route},
			Status:                 rec.status,
			Header:                 rec.Header(),
			Options:                &openapi3filter.Options{IncludeResponseStatus: true, MultiError: true},
		}
		input.SetBodyBytes(rec.body.Bytes())
		if err := openapi3filter.ValidateResponse(context.Background(), input); err != nil {
			t.Errorf("response breaks docs/openapi.json: %s %s → %d: %v\nbody: %.300s", r.Method, r.URL.Path, rec.status, err, rec.body.String())
		}
	})
}

func TestContractCatchesDrift(t *testing.T) {
	inner := &testing.T{}
	broken := validateContract(inner, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"status": 42}) // /healthz documents status as the string "ok"
	}))
	broken.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/healthz", nil))
	expect(t, "a wrong body is reported", inner.Failed(), true)
}
