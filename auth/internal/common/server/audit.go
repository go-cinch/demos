package server

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"auth/internal/common/auditctx"
	"auth/internal/common/redact"
	"auth/internal/modules"
)

func auditRecorder(mounted []modules.Module) modules.HTTPAuditRecorder {
	for _, m := range mounted {
		if recorder, ok := m.(modules.HTTPAuditRecorder); ok {
			return recorder
		}
	}
	return nil
}

func finishAudit(recorder modules.HTTPAuditRecorder, r *http.Request, s *auditctx.State, target auditctx.Target, status int, start time.Time, header http.Header, request, response *auditBuffer, policy redact.Policy) {
	if status == 0 {
		status = http.StatusOK
	}
	e := s.Snapshot()
	e.Kind, e.Module = target.Kind, target.Module
	e.Operation, e.ResourceType, e.ResourceID = target.Operation, target.ResourceType, target.ResourceID
	e.Method, e.Path = r.Method, r.URL.Path
	e.Status, e.DurationMS, e.OccurredAt = status, time.Since(start).Milliseconds(), start.UnixMilli()
	e.IP, _, _ = net.SplitHostPort(r.RemoteAddr)
	if e.IP == "" {
		e.IP = r.RemoteAddr
	}
	e.UserAgent, e.TraceID = r.UserAgent(), header.Get("X-Trace-Id")
	if target.Kind == "operation" {
		e.RequestParams = auditRequest(r, request, policy)
		e.ResponseParams = auditResponse(header, response, policy)
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), time.Second)
	defer cancel()
	if err := recorder.RecordHTTP(ctx, e); err != nil {
		slog.ErrorContext(ctx, fmt.Sprintf("persist %s audit event failed: %s %d %s: %v", target.Kind, r.Method, status, target.Operation, err),
			"operation", "persist_http_audit", "outcome", "failure", "audit_kind", target.Kind,
			"audit_operation", target.Operation, "module", target.Module, "method", r.Method, "status", status, "error", err)
	}
}

func Audit(recorder modules.HTTPAuditRecorder, policy redact.Policy) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if recorder == nil {
				next.ServeHTTP(w, r)
				return

			}

			target := recorder.AuditTarget(r.Method, r.URL.Path)
			if target.Kind == "" {
				next.ServeHTTP(w, r)
				return
			}
			start := time.Now()
			ctx, state := auditctx.WithState(r.Context())
			r = r.WithContext(ctx)
			request, response := &auditBuffer{}, &auditBuffer{}
			writer := wrapResponseWriter(w, r.ProtoMajor)
			if target.Kind == "operation" {
				if r.Body != nil && !auditFile(r.Header) {
					r.Body = &auditBody{ReadCloser: r.Body, buffer: request}
				}
				writer.Tee(response)
			}
			next.ServeHTTP(writer, r)
			finishAudit(recorder, r, state, target, writer.Status(), start, writer.Header(), request, response, policy)
		})

	}
}
