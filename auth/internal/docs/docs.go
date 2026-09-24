package docs

import (
	"auth/internal/common/apperror"
	"bytes"
	"embed"
	"net/http"
	"time"

	"auth/internal/common/config"
	"auth/internal/common/pagination"
	"auth/internal/common/server"
	"auth/internal/modules"
)

//go:embed index.html openapi.yaml
var files embed.FS

type Module struct {
	handler http.Handler
	spec    []byte
}

var _ modules.Module = (*Module)(nil)

func New(servers []config.HTTPDocsServersItemConfig, limits ...pagination.Limits) (*Module, error) {
	embedded, err := files.ReadFile("openapi.yaml")
	if err != nil {
		return nil, err
	}
	spec, err := renderOpenAPI(embedded, servers, limits...)
	if err != nil {
		return nil, err
	}
	fileServer := http.FileServer(http.FS(files))
	return &Module{handler: http.StripPrefix("/docs/", fileServer), spec: spec}, nil
}

func (*Module) Name() string {
	return "/docs"
}

func (*Module) Public() bool { return true }

func (m *Module) HTTP() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			server.WriteError(w, r, http.StatusMethodNotAllowed, apperror.MethodNotAllowed)
			return
		}
		if r.URL.Path == "/docs" {
			http.Redirect(w, r, "/docs/", http.StatusMovedPermanently)
			return
		}
		if r.URL.Path == "/docs/openapi.yaml" {
			w.Header().Set("Content-Type", "application/yaml")
			http.ServeContent(w, r, "openapi.yaml", time.Time{}, bytes.NewReader(m.spec))
			return
		}
		m.handler.ServeHTTP(w, r)
	})
}
