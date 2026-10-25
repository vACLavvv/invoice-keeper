package store

import (
	"database/sql/driver"
	"strings"

	"modernc.org/sqlite"
)

// SQLite's built-in lower/NOCASE only fold ASCII. Keep API search semantics for
// Cyrillic and other Unicode text without fetching/decrypting every payment.
func init() {
	sqlite.MustRegisterDeterministicScalarFunction("keeper_contains", 2, func(_ *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
		a, _ := args[0].(string)
		b, _ := args[1].(string)
		if strings.Contains(strings.ToLower(a), strings.ToLower(b)) {
			return int64(1), nil
		}
		return int64(0), nil
	})
	sqlite.MustRegisterDeterministicScalarFunction("keeper_equal", 2, func(_ *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
		a, _ := args[0].(string)
		b, _ := args[1].(string)
		if strings.EqualFold(a, b) {
			return int64(1), nil
		}
		return int64(0), nil
	})
}
