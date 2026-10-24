package app

import (
	"net/http"

	"invoice-keeper/internal/app/audit"
)

func (s *Server) auditVerify(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.adminUser(r); err != nil {
		return err
	}
	check, err := audit.Verify(s.DB)
	if err != nil {
		return err
	}
	return writeJSON(w, 200, check)
}
