package app

import (
	"context"
	"net/http"

	"auth/internal/common/config"
	"auth/internal/common/server"
	"auth/internal/docs"
	"auth/internal/modules"
)

func (a *Application) NewRouter(cfg *config.Config) (http.Handler, error) {
	mounted, _ := a.generatedModules()
	return a.newRouter(cfg, mounted)
}

func (a *Application) newRouter(cfg *config.Config, mounted []modules.HTTPModule) (http.Handler, error) {
	healthChecks := make([]server.HealthCheck, 0, 2)

	healthChecks = append(healthChecks, a.db.DB.PingContext)
	healthChecks = append(healthChecks, func(ctx context.Context) error {
		return a.rds.Ping(ctx).Err()
	})
	mounted = append([]modules.Module{server.NewHealth(healthChecks...)}, mounted...)
	if cfg.HTTP.Docs.Enabled {
		documentation, err := docs.New(cfg.HTTP.Docs.Servers, a.pagination)
		if err != nil {
			return nil, err
		}
		mounted = append(mounted, documentation)
	}
	return server.NewRouter(cfg, a.authenticator, a.idempotencyKeys, mounted...)
}
