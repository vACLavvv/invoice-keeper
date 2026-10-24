package app

// A per-client limit for the whole API (sign-in has its own stricter one): a token bucket
// per IP address, and per API token for scripts. It keeps a runaway script or a scraper from
// loading the server; the panel stays far below it.

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"invoice-keeper/internal/app/security"
)

type bucket struct {
	tokens float64
	seen   time.Time
}

type rateLimiter struct {
	rate  float64 // tokens per second
	burst float64

	mu      sync.Mutex
	buckets map[string]*bucket
	swept   time.Time
	now     func() time.Time
}

func newRateLimiter(rate, burst float64) *rateLimiter {
	return &rateLimiter{rate: rate, burst: burst, buckets: map[string]*bucket{}, now: time.Now}
}

// allow takes one token; it returns how long to wait when the bucket is empty.
func (l *rateLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.swept) > time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.seen) > 10*time.Minute {
				delete(l.buckets, k)
			}
		}
		l.swept = now
	}
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, seen: now}
		l.buckets[key] = b
	}
	b.tokens = min(l.burst, b.tokens+now.Sub(b.seen).Seconds()*l.rate)
	b.seen = now
	if b.tokens < 1 {
		return false, time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
	}
	b.tokens--
	return true, 0
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || s.limiter == nil {
			next.ServeHTTP(w, r)
			return
		}
		key := "ip:" + clientIP(r)
		if token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
			key = "token:" + security.Digest(token)
		}
		if ok, wait := s.limiter.allow(key); !ok {
			seconds := strconv.Itoa(int(wait.Seconds()) + 1)
			handlerFunc(func(http.ResponseWriter, *http.Request) error {
				return &apiError{Status: 429, Detail: "Слишком много запросов. Повторите через " + seconds + " с",
					Header: http.Header{"Retry-After": {seconds}}}
			}).ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
