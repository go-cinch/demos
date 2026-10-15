package server

import (
	"auth/internal/common/apperror"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
)

func Recoverer() func(http.Handler) http.Handler {
	logger := slog.Default()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writer := wrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				if recovered := recover(); recovered != nil {
					if recovered == http.ErrAbortHandler {
						logger.WarnContext(r.Context(), "http request aborted",
							"operation", "handle_http_request", "outcome", "aborted", "method", r.Method)
						// Let net/http abort the connection without writing a response.
						panic(recovered)
					}
					panicMessage := fmt.Sprint(recovered)
					logger.ErrorContext(r.Context(), "panic recovered: "+panicMessage,
						"operation", "recover_http_panic", "outcome", "failure", "method", r.Method, "error", panicMessage, "stack", string(debug.Stack()))
					if !responseWritten(writer) {
						WriteError(writer, r, http.StatusInternalServerError, apperror.Internal)
					}
				}
			}()
			next.ServeHTTP(writer, r)
		})
	}
}
