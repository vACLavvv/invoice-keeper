package app

import (
	"context"
	"database/sql"
	"time"

	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/store"
)

// Most GETs do not need a writer: schedules are materialized after mutations and
// on a new business day. A writer rechecks the transactional dirty marker.
func (s *Server) ensureMaterialized() error {
	needed, err := schedule.NeedsMaterialize(s.DB, s.Today())
	if err != nil || !needed {
		return err
	}
	return s.DB.Write(func(tx *sql.Tx) error { return schedule.Materialize(tx, s.Today()) })
}

// One read snapshot for counts and page contents, without SQLite's writer lock.
func (s *Server) readSnapshot(ctx context.Context, fn func(store.Querier) error) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	conn, err := s.DB.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err = conn.ExecContext(ctx, "BEGIN"); err != nil {
		return err
	}
	defer conn.ExecContext(context.Background(), "ROLLBACK")
	return fn(budgetQuery{ctx, conn})
}
