package server

import (
	"auth/internal/common/apperror"
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"auth/internal/common/redact"
	"github.com/go-chi/chi/v5"
)

func TestAccessLogRedactsPath(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	r := chi.NewRouter()
	r.Use(AccessLog(redact.New()), Recoverer())
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { WriteError(w, r, 404, apperror.NotFound) })
	r.Get("/reset/{token}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	r.Get("/user/{id}", func(w http.ResponseWriter, req *http.Request) {
		WriteOK(w, map[string]string{"id": chi.URLParam(req, "id")})
	})
	r.Get("/panic", func(http.ResponseWriter, *http.Request) { panic("boom") })
	resetRoute, userRoute := "/reset/{token}", "/user/{id}"
	for _, test := range []struct {
		path, route, loggedPath string
		status                  int
	}{
		{"/reset/abcdef", resetRoute, "/reset/abc***", 204},
		{"/user/42", userRoute, "/user/42", 200},
		{"/missing", "-", "/missing", 404},
		{"/panic", "/panic", "/panic", 500},
	} {
		output.Reset()
		request := httptest.NewRequest(http.MethodGet, test.path, nil)
		request.RemoteAddr = "127.0.0.1:12345"
		request.Header.Set("User-Agent", "SummaryTest/1")
		r.ServeHTTP(httptest.NewRecorder(), request)
		lines := strings.Split(strings.TrimSpace(output.String()), "\n")
		var entry map[string]json.RawMessage
		if err := json.Unmarshal([]byte(lines[len(lines)-1]), &entry); err != nil {
			t.Fatal(err)
		}
		var message string
		if err := json.Unmarshal(entry["msg"], &message); err != nil {
			t.Fatal(err)
		}
		pattern := fmt.Sprintf(`^GET %d [0-9]+ms %s %s$`, test.status, regexp.QuoteMeta(test.route), regexp.QuoteMeta(test.loggedPath))
		if !regexp.MustCompile(pattern).MatchString(message) {
			t.Fatalf("message: %q, want %q", message, pattern)
		}
		if strings.Contains(output.String(), "abcdef") {
			t.Fatalf("secret leaked: %s", output.String())
		}
		for _, key := range []string{"method", "status", "duration_ms", "route", "path", "bytes", "client"} {
			if _, exists := entry[key]; exists {
				t.Errorf("unexpected top-level attribute %q: %s", key, output.String())
			}
		}
		for key, want := range map[string]string{"remote_addr": request.RemoteAddr, "user_agent": request.UserAgent()} {
			var value string
			if err := json.Unmarshal(entry[key], &value); err != nil {
				t.Fatal(err)
			}
			if value != want {
				t.Errorf("%s = %q, want %q", key, value, want)
			}
		}
	}
	request := httptest.NewRequest(http.MethodGet, "/plain", nil)
	path := redactedPath(request, redact.New())
	if path != "/plain" {
		t.Fatalf("plain path: %s", path)
	}
}
