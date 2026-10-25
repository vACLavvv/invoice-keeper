package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"invoice-keeper/internal/app/security"
)

const idempotencyLifetime = 24 * time.Hour

var idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)

// false permits ordinary users; true requires an administrator on every replay.
var idempotentRoutes = map[string]bool{
	"POST /api/v1/recurring-payments":                                         true,
	"PATCH /api/v1/recurring-payments/{payment_id}":                           true,
	"DELETE /api/v1/recurring-payments/{payment_id}":                          true,
	"POST /api/v1/recurring-payments/{payment_id}/pause":                      true,
	"POST /api/v1/recurring-payments/{payment_id}/resume":                     true,
	"PATCH /api/v1/payment-occurrences/{occurrence_id}":                       false,
	"POST /api/v1/recurring-payments/{payment_id}/periods":                    false,
	"POST /api/v1/recurring-payments/{payment_id}/restore":                    true,
	"DELETE /api/v1/recurring-payments/{payment_id}/periods/{due_date}":       true,
	"POST /api/v1/recurring-payments/{payment_id}/periods/{due_date}/restore": true,
}

type idempotencyContextKey struct{}
type idempotentRequest struct{ principal, key, hash string }

func (s *Server) replayStored(w http.ResponseWriter, r *http.Request, key *idempotentRequest) (bool, error) {
	var requestHash, response string
	var status int
	err := s.DB.QueryRowContext(r.Context(), "SELECT request_hash,status,response FROM idempotency_keys WHERE principal=? AND key_hash=? AND expires_at>?", key.principal, key.key, s.Now().Unix()).Scan(&requestHash, &status, &response)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if requestHash != key.hash {
		return false, idempotencyConflict()
	}
	plain, err := security.DecryptText("idempotency_keys.response", response)
	if err != nil {
		return false, err
	}
	w.Header().Set("X-Idempotency-Replayed", "true")
	if status == 204 {
		w.WriteHeader(status)
		return true, nil
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, err = io.WriteString(w, plain+"\n")
	return true, err
}
func idempotencyConflict() error {
	return &apiError{Status: 409, Code: "idempotency_conflict", Detail: "Этот ключ запроса уже использован для другого действия. Для нового действия нужен новый ключ."}
}

// Authenticate before looking up a stored response, even when replaying after a restart.
func (s *Server) withIdempotency(next handlerFunc) handlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		admin, supported := idempotentRoutes[r.Pattern]
		values := r.Header.Values("X-Idempotency-Key")
		if !supported || len(values) == 0 {
			return next(w, r)
		}
		var user *User
		var err error
		if admin {
			user, err = s.adminWrite(r)
		} else {
			user, err = s.writeUser(r)
		}
		if err != nil {
			return err
		}
		if len(values) != 1 || !idempotencyKeyPattern.MatchString(values[0]) {
			return fail(422, "X-Idempotency-Key: от 8 до 128 букв, цифр или . _ : -")
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
		if err != nil {
			return fail(413, "Слишком большой запрос")
		}
		r.Body = io.NopCloser(bytes.NewReader(raw))
		// Canonical JSON accepts insignificant whitespace and property-order changes.
		canonical := raw
		if len(bytes.TrimSpace(raw)) > 0 {
			var value any
			decoder := json.NewDecoder(bytes.NewReader(raw))
			decoder.UseNumber()
			if decoder.Decode(&value) == nil {
				if more := decoder.Decode(new(any)); more == io.EOF {
					canonical, _ = json.Marshal(value)
				}
			}
		}
		credential := s.adminFingerprint()
		if user.Role != "admin" {
			if err = s.DB.QueryRowContext(r.Context(), "SELECT password_hash FROM users WHERE id=?", user.ID).Scan(&credential); err != nil {
				return err
			}
		}
		principal := security.Digest(user.Role + ":" + user.Username + ":" + credential)
		key := &idempotentRequest{principal: principal, key: security.Digest(values[0]), hash: security.Digest(r.Method + "\n" + r.URL.EscapedPath() + "?" + r.URL.Query().Encode() + "\n" + string(canonical))}
		if replayed, err := s.replayStored(w, r, key); replayed || err != nil {
			return err
		}
		return next(w, r.WithContext(context.WithValue(r.Context(), idempotencyContextKey{}, key)))
	}
}

// paymentWrite saves the original successful response in the SAME transaction as
// the mutation and audit entry. There is no crash window between the two commits.
func (s *Server) paymentWrite(w http.ResponseWriter, r *http.Request, status int, result any, mutate func(*sql.Tx) error) error {
	key, _ := r.Context().Value(idempotencyContextKey{}).(*idempotentRequest)
	replayed := false
	err := s.DB.Write(func(tx *sql.Tx) error {
		if key != nil {
			var hash, stored string
			var previousStatus int
			err := tx.QueryRow("SELECT request_hash,status,response FROM idempotency_keys WHERE principal=? AND key_hash=? AND expires_at>?", key.principal, key.key, s.Now().Unix()).Scan(&hash, &previousStatus, &stored)
			if err == nil {
				if hash != key.hash {
					return idempotencyConflict()
				}
				if previousStatus != status {
					return errors.New("idempotency response status mismatch")
				}
				plain, err := security.DecryptText("idempotency_keys.response", stored)
				if err != nil {
					return err
				}
				if result != nil {
					if err = json.Unmarshal([]byte(plain), result); err != nil {
						return err
					}
				}
				replayed = true
				return nil
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
		}
		if err := mutate(tx); err != nil {
			return err
		}
		if key == nil {
			return nil
		}
		response := ""
		if result != nil {
			data, err := json.Marshal(result)
			if err != nil {
				return err
			}
			response = string(data)
		}
		now := s.Now().Unix()
		if _, err := tx.Exec("DELETE FROM idempotency_keys WHERE expires_at<=?", now); err != nil {
			return err
		}
		_, err := tx.Exec("INSERT INTO idempotency_keys(principal,key_hash,request_hash,status,response,created_at,expires_at) VALUES(?,?,?,?,?,?,?)", key.principal, key.key, key.hash, status, security.EncryptText("idempotency_keys.response", response), now, now+int64(idempotencyLifetime/time.Second))
		return err
	})
	if err == nil && replayed {
		w.Header().Set("X-Idempotency-Replayed", "true")
	}
	return err
}

// Used only in tests and docs to check every advertised operation is wired.
func idempotencyOperation(pattern string) bool {
	_, ok := idempotentRoutes[strings.TrimSpace(pattern)]
	return ok
}
