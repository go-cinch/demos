package db

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"auth/internal/common/config"

	"github.com/lib/pq"
)

func TestNewRequiresDSN(t *testing.T) {
	if _, _, err := New(t.Context(), &config.Config{}); err == nil || err.Error() != "database dsn is required" {
		t.Fatalf("New() error = %v", err)
	}
}

func TestInvalidDSNDoesNotExposeParserCredentials(t *testing.T) {
	for _, dsn := range []string{
		"host=localhost user=test password=prefix private-password-fragment",
		"postgres://test:private-password-fragment@localhost:invalid/db",
		"postgres://test:private-password-fragment@localhost/db?sslmode=invalid",
	} {
		cfg := &config.Config{Database: config.DatabaseConfig{DSN: dsn}}

		for _, tracing := range []bool{false, true} {
			cfg.Tracer.Enabled = tracing

			store, cleanup, err := New(t.Context(), cfg)
			if store != nil || cleanup != nil || err == nil || err.Error() != "invalid database dsn" {
				t.Fatalf("invalid DSN result: %v", err)
			}
			for cause := err; cause != nil; cause = errors.Unwrap(cause) {
				if strings.Contains(cause.Error(), "private-password-fragment") {
					t.Fatal("parser credentials remain reachable through error unwrapping")
				}
			}

		}

	}
}

func TestDatabaseConnectionError(t *testing.T) {
	dsn := "postgresql://root:password@127.0.0.1:5432/app?sslmode=disable"
	err := databaseConnectionError(&pq.Error{Code: "28P01"}, dsn)
	if strings.Contains(err.Error(), "root:password") || !strings.Contains(err.Error(), "root:pas***ord") {
		t.Fatalf("authentication error = %q", err)
	}

	err = databaseConnectionError(io.EOF, dsn)
	if !errors.Is(err, io.EOF) || strings.Contains(err.Error(), "dsn:") {
		t.Fatalf("ordinary connection error = %v", err)
	}
}

func TestNewReturnsPingError(t *testing.T) {
	cfg := &config.Config{Database: config.DatabaseConfig{
		DSN: "postgresql://root:password@127.0.0.1:1/app?sslmode=disable",
	}}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, _, err := New(ctx, cfg); err == nil || !strings.Contains(err.Error(), "ping database") {
		t.Fatalf("New() error = %v", err)
	}
	cfg.Tracer.Enabled = true
	ctx, cancel = context.WithCancel(t.Context())
	cancel()
	if _, _, err := New(ctx, cfg); err == nil || !strings.Contains(err.Error(), "ping database") {
		t.Fatalf("traced New() error = %v", err)
	}
}
