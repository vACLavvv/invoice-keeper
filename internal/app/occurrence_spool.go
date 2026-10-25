package app

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"invoice-keeper/internal/app/store"
)

// Legacy full lists/exports remain compatible, but must not keep the entire
// response in RAM. Limit concurrent spool files; page endpoints do not use them.
var occurrenceSpoolSlots = make(chan struct{}, 2)

func (s *Server) spoolOccurrenceResponse(w http.ResponseWriter, r *http.Request, contentType, filename string, fill func(io.Writer) error) error {
	select {
	case occurrenceSpoolSlots <- struct{}{}:
	case <-r.Context().Done():
		return r.Context().Err()
	}
	defer func() { <-occurrenceSpoolSlots }()
	// The SQLite directory is already writable by the service and disk-backed in
	// the supplied container. /tmp may be a small memory-backed filesystem.
	directory := filepath.Dir(s.DB.Path)
	if s.DB.Path == "" || s.DB.Path == ":memory:" || strings.Contains(s.DB.Path, "mode=memory") {
		directory = ""
	}
	file, err := os.CreateTemp(directory, ".invoice-keeper-response-*")
	if err != nil {
		return err
	}
	defer func() { file.Close(); os.Remove(file.Name()) }()
	buffered := bufio.NewWriterSize(file, 64<<10)
	if err := fill(buffered); err != nil {
		return err
	}
	if err := buffered.Flush(); err != nil {
		return err
	}
	size, err := file.Seek(0, io.SeekCurrent)
	if err != nil {
		return err
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := r.Context().Err(); err != nil {
		return err
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	if filename != "" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}
	w.WriteHeader(http.StatusOK)
	// A disconnected client cannot receive an additional JSON error. The complete
	// response already exists and all database rows/transactions are closed.
	if _, err := io.Copy(w, file); err != nil {
		log.Printf("Payment response interrupted: %v", err)
	}
	return nil
}

func (s *Server) eachOccurrence(q store.Querier, filter occurrenceFilter, accept func(Occurrence) error) error {
	where, args := s.occurrenceWhere(filter)
	rows, err := q.Query(occurrenceSelect+where+occurrenceOrder(filter.sort), args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	today := s.Today()
	for rows.Next() {
		item, err := scanOccurrence(rows, today)
		if err != nil {
			return err
		}
		if err := accept(item); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (s *Server) occurrenceJSON(w http.ResponseWriter, r *http.Request, filter occurrenceFilter) error {
	return s.spoolOccurrenceResponse(w, r, "application/json", "", func(out io.Writer) error {
		if _, err := io.WriteString(out, "["); err != nil {
			return err
		}
		encoder := json.NewEncoder(out)
		first := true
		err := s.readSnapshot(r.Context(), func(q store.Querier) error {
			return s.eachOccurrence(q, filter, func(item Occurrence) error {
				if err := r.Context().Err(); err != nil {
					return err
				}
				if !first {
					if _, err := io.WriteString(out, ","); err != nil {
						return err
					}
				}
				first = false
				return encoder.Encode(item)
			})
		})
		if err != nil {
			return err
		}
		_, err = io.WriteString(out, "]\n")
		return err
	})
}
