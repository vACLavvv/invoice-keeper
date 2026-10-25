package app

// Per-route rules of the generated API routing: the query parameters each operation accepts are
// read from the spec (so they are documented by construction), and the three endpoints used by
// the browser extension answer CORS without credentials.

import (
	"errors"
	"net/http"
	"strings"
	"sync"

	"invoice-keeper/internal/api"
)

// corsRoutes are called by the extension popup with an API key, never with cookies.
var corsRoutes = map[string]bool{
	"GET /api/v1/extension/whoami":          true,
	"POST /api/v1/payment-suggestions":      true,
	"POST /api/v1/extension/pairings/claim": true,
}

// specQuery maps "METHOD /path" to the query parameters the spec documents for it.
var specQuery = sync.OnceValues(func() (map[string][]string, error) {
	doc, err := api.GetSwagger()
	if err != nil {
		return nil, err
	}
	params := map[string][]string{}
	for path, item := range doc.Paths.Map() {
		for method, op := range item.Operations() {
			key := strings.ToUpper(method) + " " + path
			params[key] = nil
			for _, p := range op.Parameters {
				if p.Value != nil && p.Value.In == "query" {
					params[key] = append(params[key], p.Value.Name)
				}
			}
		}
	}
	return params, nil
})

// serveAPI runs a handler for the operation matched by the generated routes (r.Pattern).
func (s *Server) serveAPI(w http.ResponseWriter, r *http.Request, h handlerFunc) {
	query, err := specQuery()
	if err != nil {
		handlerFunc(func(http.ResponseWriter, *http.Request) error { return err }).ServeHTTP(w, r)
		return
	}
	if corsRoutes[r.Pattern] {
		h = cors(h)
	}
	onlyQuery(query[r.Pattern], s.withIdempotency(h)).ServeHTTP(w, r)
}

// parameterError renders a parameter the generated wrapper could not parse (e.g. a non-numeric id)
// in the same 422 format as the handlers' own validation.
func parameterError(w http.ResponseWriter, r *http.Request, err error) {
	name, msg := "", "Неверное значение"
	var format *api.InvalidParamFormatError
	var required *api.RequiredParamError
	switch {
	case errors.As(err, &format):
		name, msg = format.ParamName, "Неверный формат"
	case errors.As(err, &required):
		name, msg = required.ParamName, "Обязательный параметр"
	}
	where := "query"
	if name != "" && r.PathValue(name) != "" {
		where, msg = "path", "Ожидается целое число"
	}
	handlerFunc(func(http.ResponseWriter, *http.Request) error {
		return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{where, name}, Msg: msg, Type: "value_error"}}}
	}).ServeHTTP(w, r)
}
