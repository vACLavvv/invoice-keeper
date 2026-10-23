package app

import (
	"crypto/sha256"
	"encoding/base64"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
)

// The panel is a Next.js static export (frontend/ → web/app). Each page is served with its own CSP:
// inline bootstrap scripts are allowed by their SHA-256 only, so script-src never needs 'unsafe-inline'.
// style-src does allow inline styles, which styled-components injects at runtime.

const csp = "default-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; " +
	"frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"

type page struct {
	html []byte
	csp  string
}

// panelPages require a session; everything else under / is public or 404.
var panelPages = map[string]string{
	"/": "index.html", "/recurring": "recurring.html", "/calendar": "calendar.html",
	"/team": "team.html", "/activity": "activity.html",
}

var inlineScript = regexp.MustCompile(`(?s)<script([^>]*)>(.*?)</script>`)

func loadPages(app fs.FS) (map[string]page, error) {
	names, err := fs.Glob(app, "*.html")
	if err != nil {
		return nil, err
	}
	pages := map[string]page{}
	for _, name := range names {
		html, err := fs.ReadFile(app, name)
		if err != nil {
			return nil, err
		}
		var hashes []string
		for _, match := range inlineScript.FindAllSubmatch(html, -1) {
			attrs := string(match[1])
			if strings.Contains(attrs, "src=") || strings.Contains(attrs, "application/json") {
				continue
			}
			sum := sha256.Sum256(match[2])
			hashes = append(hashes, "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'")
		}
		policy := csp + "; script-src 'self' " + strings.Join(hashes, " ") + "; style-src 'self' 'unsafe-inline'"
		pages[strings.TrimSuffix(name, ".html")] = page{html: html, csp: policy}
	}
	return pages, nil
}

func (s *Server) servePage(w http.ResponseWriter, name string, status int) error {
	p, ok := s.pages[name]
	if !ok {
		return fail(404, "Not Found")
	}
	w.Header().Set("Content-Security-Policy", p.csp)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, err := w.Write(p.html)
	return err
}

func (s *Server) panelPage(w http.ResponseWriter, r *http.Request) error {
	name, ok := panelPages[r.URL.Path]
	if !ok {
		return s.notFound(w, r)
	}
	if _, err := s.currentUser(r); err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return nil
	}
	return s.servePage(w, strings.TrimSuffix(name, ".html"), 200)
}

func (s *Server) loginPage(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.currentUser(r); err == nil {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return nil
	}
	return s.servePage(w, "login", 200)
}

// notFound answers JSON for the API and the styled 404 page for everything else.
func (s *Server) notFound(w http.ResponseWriter, r *http.Request) error {
	if strings.HasPrefix(r.URL.Path, "/api/") || r.Method != http.MethodGet {
		return fail(404, "Not Found")
	}
	return s.servePage(w, "404", 404)
}

// nextAssets serves hashed build files; their names change on every build, so they may be cached forever.
func nextAssets(app fs.FS) http.Handler {
	assets := files(app)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(path.Clean(r.URL.Path), "/_next/static/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		assets.ServeHTTP(w, r)
	})
}
