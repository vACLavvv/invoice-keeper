package app

import (
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"invoice-keeper/internal/app/security"
)

const (
	eventHeartbeat    = 15 * time.Second
	eventWriteTimeout = 5 * time.Second
	eventSessionLimit = 6
	eventGlobalLimit  = 128
)

type eventStreams struct {
	mu        sync.Mutex
	sessions  map[string]int
	total     int
	epoch     string
	stop      chan struct{}
	closed    bool
	heartbeat time.Duration // tests may shorten; production uses eventHeartbeat
}

func newEventStreams() eventStreams {
	return eventStreams{sessions: map[string]int{}, epoch: security.RandomHex(8), stop: make(chan struct{})}
}

func (e *eventStreams) reserve(session string) (func(), bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.closed || e.total >= eventGlobalLimit || e.sessions[session] >= eventSessionLimit {
		return nil, false
	}
	e.sessions[session]++
	e.total++
	var once sync.Once
	return func() {
		once.Do(func() {
			e.mu.Lock()
			defer e.mu.Unlock()
			e.sessions[session]--
			if e.sessions[session] == 0 {
				delete(e.sessions, session)
			}
			e.total--
		})
	}, true
}

func (e *eventStreams) active() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.total
}

// CloseEvents lets graceful HTTP shutdown finish without waiting for stream
// clients to disconnect. The browser reconnects and re-fetches on the new server.
func (s *Server) CloseEvents() {
	s.events.mu.Lock()
	defer s.events.mu.Unlock()
	if !s.events.closed {
		s.events.closed = true
		close(s.events.stop)
	}
}

// eventStream carries only invalidations. No record IDs, amounts or personal
// data are broadcast. The API re-checks access for each subsequent data request.
// A new connection always gets ready, even when Last-Event-ID is supplied: this
// process-local feed does not pretend to replay a durable event history.
func (s *Server) eventStream(w http.ResponseWriter, r *http.Request) error {
	if hasBearer(r) {
		return fail(403, "Это действие доступно только в панели, не по токену API")
	}
	if _, err := s.sessionUser(r, false); err != nil {
		return err
	}
	if origin := r.Header.Get("Origin"); origin != "" && !s.sameSite(r, origin) {
		return fail(403, "Запрос с другого сайта запрещён")
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return fail(403, "Запрос с другого сайта запрещён")
	}
	release, ok := s.events.reserve(currentTokenHash(r))
	if !ok {
		return &apiError{Status: 429, Detail: "Слишком много открытых подключений", Header: http.Header{"Retry-After": {"15"}}}
	}
	defer release()
	changed, unsubscribe := s.DB.SubscribeChanges()
	defer unsubscribe()
	controller := http.NewResponseController(w)
	// Replace the server's ordinary 60s WriteTimeout for this endpoint only.
	// Every flush still has a short deadline so a slow client cannot pin a writer.
	if err := controller.SetWriteDeadline(time.Time{}); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	write := func(frame string) bool {
		if err := controller.SetWriteDeadline(time.Now().Add(eventWriteTimeout)); err != nil {
			return false
		}
		if _, err := fmt.Fprint(w, frame); err != nil {
			return false
		}
		if err := controller.Flush(); err != nil {
			return false
		}
		return controller.SetWriteDeadline(time.Time{}) == nil
	}
	frame := func(kind string) string {
		revision := s.DB.ChangeRevision()
		return fmt.Sprintf("id: %s:%d\nevent: %s\ndata: {\"revision\":%d}\n\n", s.events.epoch, revision, kind, revision)
	}
	if !write("retry: 3000\n" + frame("ready")) {
		return nil
	}
	heartbeat := s.events.heartbeat
	if heartbeat <= 0 {
		heartbeat = eventHeartbeat
	}
	ticker := time.NewTicker(heartbeat)
	defer ticker.Stop()
	for {
		kind := ""
		select {
		case <-r.Context().Done():
			return nil
		case <-s.events.stop:
			return nil
		case _, ok := <-changed:
			if !ok {
				return nil
			}
			kind = "changed"
		case <-ticker.C:
		}
		// Expiry, logout, deleted users and revoked sessions terminate existing
		// streams too, not just new connections. Do not refresh the session expiry.
		if _, err := s.sessionUser(r, false); err != nil {
			var authError *apiError
			if errors.As(err, &authError) && authError.Status == http.StatusUnauthorized {
				write("event: session-ended\ndata: {}\n\n")
			}
			// A transient database error ends this connection, but must not log
			// the user out. EventSource reconnects and validates the session again.
			return nil
		}
		if kind == "" {
			if !write(": keep-alive\n\n") {
				return nil
			}
		} else if !write(frame(kind)) {
			return nil
		}
	}
}
