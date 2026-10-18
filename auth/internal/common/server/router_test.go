package server

import (
	"encoding/json"

	"context"
	"errors"

	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"auth/internal/common/authn"

	"auth/internal/common/config"

	"github.com/go-chi/chi/v5"
)

type testModule struct {
	name    string
	handler http.Handler
}

func (m testModule) Name() string {
	return m.name
}

func (m testModule) HTTP() http.Handler {
	return m.handler
}

func (m testModule) Public() bool { return true }

func TestNewRouter(t *testing.T) {
	var cfg config.Config
	cfg.Server.Name = "test"
	cfg.HTTP.Timeout = time.Second
	module := testModule{name: "/module", handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		WriteOK(w, map[string]bool{"ok": true})
	})}
	handler, err := NewRouter(&cfg, nil, nil, module)
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/module", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
	if _, err := NewRouter(&config.Config{}, nil, nil, testModule{name: "invalid", handler: http.NotFoundHandler()}); err == nil {
		t.Fatal("invalid module was accepted")
	}
	if _, err := NewRouter(&config.Config{}, nil, nil, nil); err == nil {
		t.Fatal("nil module was accepted")
	}
	if _, err := NewRouter(&config.Config{}, nil, nil, testModule{name: "/nil-handler"}); err == nil {
		t.Fatal("nil module handler was accepted")
	}
	if _, err := NewRouter(&config.Config{}, nil, nil, module, module); err == nil {
		t.Fatal("duplicate module was accepted")
	}
}

type permissionTestModule struct {
	allowed          bool
	err              error
	calls            int
	lastMethod       string
	lastPath         string
	permissionSuffix string
}

func (*permissionTestModule) Name() string { return "/auth" }

func (m *permissionTestModule) PermissionEndpoint() string {
	if m.permissionSuffix != "" {
		return m.permissionSuffix
	}
	return "/permission"
}

func (m *permissionTestModule) AuthorizeHTTP(_ context.Context, method, path string) (bool, error) {
	m.calls++
	m.lastMethod, m.lastPath = method, path
	return m.allowed, m.err
}

func (*permissionTestModule) HTTP() http.Handler {
	r := chi.NewRouter()
	r.Get("/permission", func(w http.ResponseWriter, _ *http.Request) { WriteOK(w) })
	return r
}

type protectedTestModule struct{}

func (protectedTestModule) Name() string { return "/private" }

func (protectedTestModule) HTTP() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { WriteOK(w) })
}

func TestHTTPPermissionAuthorization(t *testing.T) {
	authenticator, err := authn.New("test", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := authenticator.Issue(authn.Identity{CredentialVersion: 1, UserID: 7, Username: "guest", Code: "CODE0007"})
	if err != nil {
		t.Fatal(err)
	}
	var cfg config.Config
	cfg.Auth.Authorization.Enabled = true
	authorizer := &permissionTestModule{}
	handler, err := NewRouter(&cfg, authenticator, nil, authorizer, protectedTestModule{})
	if err != nil {
		t.Fatal(err)
	}
	request := func(path string, authenticated bool) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if authenticated {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		handler.ServeHTTP(recorder, req)
		return recorder
	}
	if got := request("/private", false).Code; got != http.StatusUnauthorized {
		t.Fatalf("unauthenticated = %d", got)
	}
	if got := request("/private", true).Code; got != http.StatusForbidden {
		t.Fatalf("denied = %d", got)
	}
	if authorizer.calls != 1 || authorizer.lastMethod != http.MethodGet || authorizer.lastPath != "/private" {
		t.Fatalf("authorization call = %#v", authorizer)
	}
	authorizer.allowed = true
	if got := request("/private", true).Code; got != http.StatusOK {
		t.Fatalf("allowed = %d", got)
	}
	authorizer.err = errors.New("database unavailable")
	if got := request("/private", true).Code; got != http.StatusInternalServerError {
		t.Fatalf("failure = %d", got)
	}
	authorizer.err = nil
	if got := request("/auth/permission", true).Code; got != http.StatusOK {
		t.Fatalf("permission endpoint = %d", got)
	}
	if authorizer.calls != 3 {
		t.Fatalf("permission endpoint authorized recursively: %d", authorizer.calls)
	}

	if _, err := NewRouter(&cfg, authenticator, nil, protectedTestModule{}); err == nil {
		t.Fatal("missing authorizer accepted")
	}
	if _, err := NewRouter(&cfg, authenticator, nil, authorizer, &permissionTestModule{}); err == nil {
		t.Fatal("duplicate authorizer accepted")
	}
	if _, err := NewRouter(&cfg, authenticator, nil, &permissionTestModule{permissionSuffix: "invalid"}); err == nil {
		t.Fatal("invalid permission endpoint accepted")
	}
}

type rootPathTestModule struct{}

func (rootPathTestModule) Name() string           { return "" }
func (rootPathTestModule) HTTPPathConfig() string { return "auth.path" }
func (rootPathTestModule) Public() bool           { return true }

func (rootPathTestModule) HTTP() http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Module-Middleware", "true")
			next.ServeHTTP(w, r)
		})
	})
	middleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Route-Middleware", "true")
			next.ServeHTTP(w, r)
		})
	}
	r.With(middleware).Get("/probe/{id}", func(w http.ResponseWriter, r *http.Request) {
		WriteOK(w, map[string]string{"route": chi.RouteContext(r.Context()).RoutePattern(), "id": chi.URLParam(r, "id")})
	})
	return r
}

func TestConfiguredRootModulePreservesRouteAndMiddleware(t *testing.T) {
	handler, err := NewRouter(&config.Config{}, nil, nil, rootPathTestModule{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/probe/42", nil))
	var body map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	expected := "/probe/{id}"
	if response.Code != 200 || body["route"] != expected || body["id"] != "42" || response.Header().Get("X-Module-Middleware") != "true" || response.Header().Get("X-Route-Middleware") != "true" {
		t.Fatalf("root route lost routing context or middleware: %d %v %v", response.Code, body, response.Header())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/missing", nil))
	if response.Code != 404 {
		t.Fatal(response.Code)
	}
}
