package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"auth/internal/common/redact"

	"github.com/go-chi/chi/v5"
)

func AccessLog(policy redact.Policy) func(http.Handler) http.Handler {
	logger := slog.Default()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			writer := wrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				recovered := recover()
				aborted := recovered == http.ErrAbortHandler
				if recovered != nil && !aborted {
					panic(recovered)
				}
				status := writer.Status()
				if status == 0 && !aborted {
					status = http.StatusOK
				}
				route := "-"
				if routeContext := chi.RouteContext(r.Context()); routeContext != nil && routeContext.RoutePattern() != "" {
					route = routeContext.RoutePattern()
				}
				durationMS := time.Since(start).Milliseconds()
				path := redactedPath(r, policy)
				message := fmt.Sprintf("%s %d %dms %s %s", r.Method, status, durationMS, route, path)
				entry, level := logger, slog.LevelInfo
				if aborted {
					entry, level = logger.With("outcome", "aborted"), slog.LevelWarn
					message += " aborted"
				}
				entry.Log(r.Context(), level, message,
					"method", r.Method, "status", status, "duration_ms", durationMS, "route", route, "path", path,
					"remote_addr", r.RemoteAddr, "user_agent", r.UserAgent())
				if aborted {
					panic(recovered)
				}
			}()
			next.ServeHTTP(writer, r)
		})
	}
}

func redactedPath(r *http.Request, policy redact.Policy) string {
	routeContext := chi.RouteContext(r.Context())
	// Mount middleware can reject a request before the child route is matched.
	// Catch-all paths cannot supply a complete set of named parameters either.
	if routeContext == nil || routeContext.RoutePattern() == "" || strings.HasSuffix(routeContext.RoutePattern(), "*") {
		return "-"
	}
	replacements := make([]string, 0, len(routeContext.URLParams.Keys)*2)
	for index, name := range routeContext.URLParams.Keys {
		if name == "" || index >= len(routeContext.URLParams.Values) || !policy.IsSensitive(name) {
			continue
		}
		value := routeContext.URLParams.Values[index]
		// Chi matches RawPath when present; redact against the decoded URL.Path.
		if r.URL.RawPath != "" {
			if decoded, err := url.PathUnescape(value); err == nil {
				value = decoded
			}
		}
		if value != "" {
			replacements = append(replacements, value, policy.Value(name, value))
		}
	}
	if len(replacements) == 0 {
		return r.URL.Path
	}
	return strings.NewReplacer(replacements...).Replace(r.URL.Path)
}
