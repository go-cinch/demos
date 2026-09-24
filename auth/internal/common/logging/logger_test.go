package logging

import (
	"auth/internal/common/tracing"
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

func TestInit(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	t.Cleanup(func() { slog.SetDefault(previous) })
	if err := Init(&output, "info"); err != nil {
		t.Fatalf("Init() error = %v", err)
	}
	slog.Info("test")
	if !strings.Contains(output.String(), `"v":"dev"`) {
		t.Fatalf("log output = %q", output.String())
	}
	ctx, _, ok := tracing.ContextWithNewTraceID(t.Context())
	if !ok {
		t.Fatal("create trace context")
	}
	traceID, spanID := tracing.IDsFromContext(ctx)
	slog.InfoContext(ctx, "traced")
	if !strings.Contains(output.String(), `"trace_id":"`+traceID+`"`) || !strings.Contains(output.String(), `"span_id":"`+spanID+`"`) {
		t.Fatalf("log output = %q", output.String())
	}
	if err := Init(&bytes.Buffer{}, "invalid"); err == nil {
		t.Fatal("invalid level was accepted")
	}
}
