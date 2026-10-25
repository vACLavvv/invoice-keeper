package app

// Running behind a reverse proxy (nginx): the client address comes from X-Forwarded-For only when
// the direct peer is in TRUSTED_PROXIES, and Origin is compared with PUBLIC_BASE_URL. Every request
// is logged in one line without headers, cookies or query values that may carry secrets.

import (
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// realIP replaces RemoteAddr with the client address reported by a trusted proxy.
func (s *Server) realIP(next http.Handler) http.Handler {
	if len(s.Settings.TrustedProxies) == 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if client, ok := s.forwardedClient(r); ok {
			r2 := *r
			r2.RemoteAddr = net.JoinHostPort(client.String(), "0")
			r = &r2
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) trusted(addr netip.Addr) bool {
	for _, p := range s.Settings.TrustedProxies {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// forwardedClient walks X-Forwarded-For from the right: the first address not added by one of our
// proxies is the client. Entries to its left are written by the client and are not believed.
func (s *Server) forwardedClient(r *http.Request) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return netip.Addr{}, false
	}
	peer, err := netip.ParseAddr(host)
	if err != nil || !s.trusted(peer.Unmap()) {
		return netip.Addr{}, false
	}
	var hops []string
	for _, header := range r.Header.Values("X-Forwarded-For") {
		hops = append(hops, strings.Split(header, ",")...)
	}
	for i := len(hops) - 1; i >= 0; i-- {
		addr, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			return netip.Addr{}, false
		}
		if addr = addr.Unmap(); !s.trusted(addr) || i == 0 {
			return addr, true
		}
	}
	return netip.Addr{}, false
}

// sameSite reports whether Origin is this site: PUBLIC_BASE_URL when set, otherwise the Host header.
func (s *Server) sameSite(r *http.Request, origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	if s.Settings.PublicBaseURL != "" {
		return strings.EqualFold(parsed.Scheme+"://"+parsed.Host, s.Settings.PublicBaseURL)
	}
	return parsed.Host == r.Host
}

// loggedQuery keeps only harmless filter values; any other parameter is shown as ***.
var loggedQuery = map[string]bool{"from_date": true, "to_date": true, "status": true, "currency": true,
	"year": true, "dry_run": true, "include_archived": true}

func safeQuery(values url.Values) string {
	if len(values) == 0 {
		return ""
	}
	masked := url.Values{}
	for key, list := range values {
		for _, value := range list {
			if !loggedQuery[key] {
				value = "***"
			}
			masked.Add(key, value)
		}
	}
	return masked.Encode()
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// accessLog writes method, path, masked query, status, size, duration and client address.
func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		if r.URL.Path != "/metrics" && r.URL.Path != "/healthz" && r.URL.Path != "/api/v1/events" {
			s.metrics.observe(rec.status, time.Since(start))
		}
		if !s.Settings.LogRequests {
			return
		}
		level := slog.LevelInfo
		if rec.status >= 500 {
			level = slog.LevelError
		}
		slog.LogAttrs(r.Context(), level, "request",
			slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.String("query", safeQuery(r.URL.Query())),
			slog.Int("status", rec.status), slog.Int("bytes", rec.bytes),
			slog.Duration("duration", time.Since(start).Round(time.Microsecond)), slog.String("ip", clientIP(r)))
	})
}
