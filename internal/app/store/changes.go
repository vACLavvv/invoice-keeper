package store

import "sync"

// changeFeed sends invalidations, not a durable event log or transaction data.
// One pending signal is enough: clients re-read the authoritative API state.
// Keeping channels bounded means a slow browser cannot block a database writer.
type changeFeed struct {
	mu        sync.Mutex
	revision  uint64
	closed    bool
	listeners map[chan struct{}]struct{}
}

func (f *changeFeed) publish() {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.closed {
		return
	}
	f.revision++
	for ch := range f.listeners {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// ChangeRevision is local to this process/DB handle. It is suitable for cache
// invalidation; a fresh SSE connection must always synchronize using the API.
func (db *DB) ChangeRevision() uint64 {
	db.changes.mu.Lock()
	defer db.changes.mu.Unlock()
	return db.changes.revision
}

// SubscribeChanges observes non-empty successful Write transactions. Unsubscribe
// is idempotent. A closed DB closes all subscriptions, including future ones.
func (db *DB) SubscribeChanges() (<-chan struct{}, func()) {
	f := &db.changes
	ch := make(chan struct{}, 1)
	f.mu.Lock()
	if f.closed {
		close(ch)
		f.mu.Unlock()
		return ch, func() {}
	}
	if f.listeners == nil {
		f.listeners = make(map[chan struct{}]struct{})
	}
	f.listeners[ch] = struct{}{}
	f.mu.Unlock()
	var once sync.Once
	return ch, func() {
		once.Do(func() {
			f.mu.Lock()
			defer f.mu.Unlock()
			if _, ok := f.listeners[ch]; ok {
				delete(f.listeners, ch)
				close(ch)
			}
		})
	}
}

// Close releases streaming observers as well as the SQL connections. It does
// not publish an artificial revision after shutdown.
func (db *DB) Close() error {
	f := &db.changes
	f.mu.Lock()
	f.closed = true
	for ch := range f.listeners {
		close(ch)
		delete(f.listeners, ch)
	}
	f.mu.Unlock()
	return db.DB.Close()
}
