package app

// Receipts: a link or a file (PDF, PNG, JPEG, WebP up to 5 MB) attached to a payment period.
// Files live in SQLite next to the payment, so the backup command copies them too. The type is
// detected from the content, never from the file name; downloads are attachments with nosniff.

import (
	"database/sql"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
)

const (
	maxReceiptBytes     = 5 << 20
	maxReceiptsPerEntry = 20
)

var receiptTypes = map[string]bool{"application/pdf": true, "image/png": true, "image/jpeg": true, "image/webp": true}

type receipt struct {
	ID          int64   `json:"id"`
	Kind        string  `json:"kind"`
	URL         *string `json:"url"`
	FileName    *string `json:"file_name"`
	ContentType *string `json:"content_type"`
	Size        *int64  `json:"size"`
	CreatedBy   string  `json:"created_by"`
	CreatedAt   string  `json:"created_at"`
	DownloadURL *string `json:"download_url"`
}

func (s *Server) receiptsList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	id, err := pathID(r, "occurrence_id")
	if err != nil {
		return err
	}
	if _, err := s.findOccurrence(s.DB, id); err != nil {
		return err
	}
	rows, err := s.DB.Query("SELECT id,kind,url,file_name,content_type,size,created_by,created_at FROM receipts WHERE occurrence_id=? ORDER BY id", id)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []receipt{}
	for rows.Next() {
		var item receipt
		if err := rows.Scan(&item.ID, &item.Kind, &item.URL, &item.FileName, &item.ContentType, &item.Size, &item.CreatedBy, &item.CreatedAt); err != nil {
			return err
		}
		if err := security.DecryptNullable("receipts.url", &item.URL); err != nil {
			return err
		}
		if item.Kind == "file" {
			link := "/api/v1/receipts/" + itoa(item.ID) + "/file"
			item.DownloadURL = &link
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writeJSON(w, 200, items)
}

func cleanFileName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`"/\:*?<>|`, r) {
			return '_'
		}
		return r
	}, name)
	if runes := []rune(name); len(runes) > 120 {
		name = string(runes[:120])
	}
	if name == "" || name == "." {
		name = "receipt"
	}
	return name
}

// receiptsAdd takes JSON {"url": …} or multipart/form-data with a "file" field.
func (s *Server) receiptsAdd(w http.ResponseWriter, r *http.Request) error {
	user, err := s.writeUser(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "occurrence_id")
	if err != nil {
		return err
	}
	var kind string
	var link, name, contentType any
	var size any
	var data []byte
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		r.Body = http.MaxBytesReader(w, r.Body, maxReceiptBytes+1<<20)
		if err := r.ParseMultipartForm(1 << 20); err != nil { // #nosec G120 -- the body is limited by MaxBytesReader above
			return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "file"}, Msg: "Файл больше 5 МБ или повреждён", Type: "file_too_large"}}}
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "file"}, Msg: "Прикрепите файл", Type: "missing"}}}
		}
		defer file.Close()
		if data, err = io.ReadAll(io.LimitReader(file, maxReceiptBytes+1)); err != nil {
			return err
		}
		if len(data) == 0 || len(data) > maxReceiptBytes {
			return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "file"}, Msg: "Файл пустой или больше 5 МБ", Type: "file_too_large"}}}
		}
		detected := http.DetectContentType(data)
		if !receiptTypes[detected] {
			return &apiError{Status: 422, Detail: []fieldError{{Loc: []any{"body", "file"}, Msg: "Подходят PDF, PNG, JPEG и WebP", Type: "file_type"}}}
		}
		kind, name, contentType, size = "file", cleanFileName(header.Filename), detected, int64(len(data))
	} else {
		f, err := readForm(r, "url")
		if err != nil {
			return err
		}
		f.require("url")
		value := f.text("url", textRule{trim: true, min: 1, max: 500})
		if value != nil {
			if parsed, err := url.Parse(*value); err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
				f.add("url", "Ссылка должна начинаться с http:// или https://", "url_scheme")
			}
		}
		if err := f.err(); err != nil {
			return err
		}
		kind, link = "link", *value
	}
	var authorID any
	if user.Role != "admin" {
		authorID = user.ID
	}
	var receiptID int64
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := s.findOccurrence(tx, id); err != nil {
			return err
		}
		var count int
		if err := tx.QueryRow("SELECT COUNT(*) FROM receipts WHERE occurrence_id=?", id).Scan(&count); err != nil {
			return err
		}
		if count >= maxReceiptsPerEntry {
			return fail(409, "К периоду уже прикреплено 20 чеков")
		}
		var blob any
		if data != nil {
			blob = security.EncryptBlob("receipts.data", data)
		}
		if text, ok := link.(string); ok {
			link = security.EncryptText("receipts.url", text)
		}
		result, err := tx.Exec(`INSERT INTO receipts(occurrence_id,kind,url,file_name,content_type,size,data,created_by,author_user_id,created_at)
			VALUES(?,?,?,?,?,?,?,?,?,?)`, id, kind, link, name, contentType, size, blob, user.Username, authorID, schedule.Timestamp())
		if err != nil {
			return err
		}
		receiptID, _ = result.LastInsertId()
		return audit.Record(tx, user.Username, "receipt.add", id)
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 201, map[string]any{"id": receiptID, "kind": kind})
}

func (s *Server) receiptFile(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err != nil {
		return err
	}
	id, err := pathID(r, "receipt_id")
	if err != nil {
		return err
	}
	var name, contentType sql.NullString
	var data []byte
	err = s.DB.QueryRow("SELECT file_name,content_type,data FROM receipts WHERE id=? AND kind='file' AND occurrence_id IN (SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.removed_at IS NULL AND r.removed_at IS NULL)", id).Scan(&name, &contentType, &data)
	if errors.Is(err, sql.ErrNoRows) {
		return fail(404, "Чек не найден")
	}
	if err != nil {
		return err
	}
	if data, err = security.DecryptBlob("receipts.data", data); err != nil {
		return err
	}
	w.Header().Set("Content-Type", contentType.String)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name.String}))
	w.Header().Set("Cache-Control", "private, no-store")
	_, err = w.Write(data)
	return err
}

// receiptsDelete: the author (by id) or the admin.
func (s *Server) receiptsDelete(w http.ResponseWriter, r *http.Request) error {
	user, err := s.writeUser(r)
	if err != nil {
		return err
	}
	id, err := pathID(r, "receipt_id")
	if err != nil {
		return err
	}
	err = s.DB.Write(func(tx *sql.Tx) error {
		var occurrenceID int64
		var author sql.NullInt64
		err := tx.QueryRow("SELECT occurrence_id,author_user_id FROM receipts WHERE id=?", id).Scan(&occurrenceID, &author)
		if errors.Is(err, sql.ErrNoRows) {
			return fail(404, "Чек не найден")
		}
		if err != nil {
			return err
		}
		if _, err := s.findOccurrence(tx, occurrenceID); err != nil {
			return err
		}
		if user.Role != "admin" && (!author.Valid || author.Int64 != user.ID) {
			return fail(403, "Удалить чек может его автор или администратор")
		}
		if _, err := tx.Exec("DELETE FROM receipts WHERE id=?", id); err != nil {
			return err
		}
		return audit.Record(tx, user.Username, "receipt.delete", occurrenceID)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}
