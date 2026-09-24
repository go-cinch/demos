package server

import (
	"auth/internal/common/apperror"
	"context"
	"log/slog"
	"net/http"
	"time"
)

const healthCheckTimeout = 5 * time.Second

type HealthCheck func(context.Context) error

type Health struct {
	checks []HealthCheck
}

func NewHealth(checks ...HealthCheck) *Health {
	return &Health{checks: checks}
}

func (*Health) Name() string {
	return "/healthz"
}

func (*Health) Public() bool { return true }

func (h *Health) HTTP() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			WriteError(w, r, http.StatusMethodNotAllowed, apperror.MethodNotAllowed)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), healthCheckTimeout)
		defer cancel()

		healthy := true
		for _, check := range h.checks {
			if err := check(ctx); err != nil {
				slog.WarnContext(ctx, "health check failed: "+err.Error())
				healthy = false
			}
		}
		if !healthy {
			WriteError(w, r, http.StatusServiceUnavailable, apperror.ServiceUnavailable)
			return
		}
		WriteOK(w)
	})
}
