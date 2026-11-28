package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"auth/internal/common/config"
	"auth/internal/common/redact"
	"github.com/XSAM/otelsql"
	"github.com/lib/pq"
)

const postgresDriver = "postgres"

type Store struct {
	DB *sql.DB
}

type SQLExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func New(ctx context.Context, cfg *config.Config) (*Store, func(), error) {
	logger := slog.Default()
	dsn := strings.TrimSpace(cfg.Database.DSN)
	if dsn == "" {
		return nil, nil, errors.New("database dsn is required")
	}
	// Validate before opening a connection. A parser error may contain fragments of
	// malformed credentials; do not wrap it where startup logging can unwrap it.
	if _, err := pq.NewConnector(dsn); err != nil {
		return nil, nil, errors.New("invalid database dsn")
	}
	var db *sql.DB
	var err error
	if cfg.Tracer.Enabled {
		db, err = otelsql.Open(postgresDriver, dsn)
	} else {
		db, err = sql.Open(postgresDriver, dsn)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("open database: %w", err)
	}
	if cfg.Database.MaxOpenConns > 0 {
		db.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	}
	if cfg.Database.MaxIdleConns > 0 {
		db.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	}
	if cfg.Database.ConnMaxLifetime > 0 {
		db.SetConnMaxLifetime(cfg.Database.ConnMaxLifetime)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	pingErr := db.PingContext(pingCtx)
	if pingErr != nil && cfg.Database.AutoCreate && isMissingDatabase(pingErr) {
		if err := createDatabase(pingCtx, dsn); err != nil {
			_ = db.Close()
			return nil, nil, err
		}
		pingErr = db.PingContext(pingCtx)
	}
	if pingErr != nil {
		_ = db.Close()
		return nil, nil, databaseConnectionError(pingErr, dsn)
	}

	if cfg.Database.Migrate {
		if err := MigrateUp(ctx, db); err != nil {
			_ = db.Close()
			return nil, nil, err
		}
	}

	cleanup := func() {
		if err := db.Close(); err != nil {
			logger.Error("close database failed: "+err.Error(), slog.String("operation", "database_close"), slog.String("outcome", "failure"), slog.String("driver", postgresDriver), slog.Any("error", err))
		}
	}
	loggedDSN := redact.DSN(dsn)
	logger.InfoContext(ctx, "database initialized: "+loggedDSN, slog.String("operation", "database_init"), slog.String("outcome", "success"), slog.String("driver", postgresDriver), slog.String("dsn", loggedDSN))
	return &Store{DB: db}, cleanup, nil
}

func databaseConnectionError(err error, dsn string) error {
	var target *pq.Error
	if errors.As(err, &target) && target.Code == "28P01" {
		return fmt.Errorf("%v; dsn: %s", err, redact.DSN(dsn))
	}
	return fmt.Errorf("ping database: %w", err)
}
