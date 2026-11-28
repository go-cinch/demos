package server

import (
	"auth/internal/common/apperror"
	"auth/internal/common/authn"
	"auth/internal/common/config"
	"auth/internal/common/i18n"
	"auth/internal/common/idempotency"
	"auth/internal/common/redact"
	"auth/internal/modules"
	"errors"
	"github.com/go-chi/chi/v5"
	"net/http"
	"strings"
)

func NewRouter(cfg *config.Config, authenticator *authn.Manager, idempotencyKeys idempotency.Store, mounted ...modules.Module) (http.Handler, error) {

	trusted, err := parseTrustedProxies(cfg.HTTP.ClientIP.TrustedProxies)
	if err != nil {
		return nil, err
	}

	bodyLimits, err := config.ResolveHTTPBodyLimits(cfg.HTTP.BodyLimits)
	if err != nil {
		return nil, err
	}
	auditSettings, err := config.ResolveAudit(cfg.Audit)
	if err != nil {
		return nil, err
	}

	permissionAuthorizer, permissionEndpoint, err := newHTTPPermissionAuthorizer(cfg, mounted)
	if err != nil {
		return nil, err
	}

	r := chi.NewRouter()
	policy := redact.New(cfg.Redact.Keys...)
	r.Use(TraceID(cfg.Server.Name, policy))
	r.Use(RequestBodyLimits(bodyLimits), ClientIP(trusted...), Locale(httpTranslator(mounted)), AccessLog(policy), Audit(auditRecorder(mounted), policy, auditSettings), Recoverer())

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, r, http.StatusNotFound, apperror.NotFound)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, r, http.StatusMethodNotAllowed, apperror.MethodNotAllowed)
	})
	routes := r.With(RequestTimeout(cfg.HTTP.Timeout))
	catalog := make([]modules.HTTPPermissionRoute, 0)
	seen := make(map[string]struct{}, len(mounted))
	for _, module := range mounted {
		if module == nil {
			return nil, errors.New("http module is required")
		}
		pattern := strings.TrimSpace(module.Name())
		if _, configured := module.(modules.ConfigurableHTTPModule); configured {
			normalized, err := config.NormalizeHTTPPath(module.Name())
			if err != nil {
				return nil, err
			}
			if policy, ok := module.(modules.HTTPAuthenticationPolicy); ok && authenticator != nil {
				authenticator.SetRestrictedHTTPPolicy(policy.AllowRestrictedHTTP)
			}
			pattern = normalized
			if pattern == "" {
				pattern = "/"
			}
		}
		if pattern == "" || !strings.HasPrefix(pattern, "/") {
			return nil, errors.New("http module pattern must start with /")
		}
		if _, exists := seen[pattern]; exists {
			return nil, errors.New("http module pattern is duplicated")
		}
		seen[pattern] = struct{}{}
		handler := module.HTTP()
		if handler == nil {
			return nil, errors.New("http module handler is required")
		}

		moduleRoutes := make([]modules.HTTPPermissionRoute, 0)
		rootHandlers := make(map[string]http.Handler)
		if registered, ok := handler.(chi.Routes); ok {
			if err := chi.Walk(registered, func(method, path string, endpoint http.Handler, middleware ...func(http.Handler) http.Handler) error {
				route := modules.HTTPPermissionRoute{Method: method, Path: strings.TrimSuffix(pattern, "/") + path}
				catalog = append(catalog, route)
				moduleRoutes = append(moduleRoutes, route)
				rootHandlers[method+" "+route.Path] = chi.Chain(middleware...).Handler(endpoint)
				return nil
			}); err != nil {
				return nil, err
			}
		}

		if isIdempotentModule(module) && (idempotencyKeys == nil || cfg.Idempotency.TTL <= 0) {
			return nil, errors.New("idempotency store and positive ttl are required")
		}
		if !isPublicModule(module) && authenticator == nil {
			return nil, errors.New("http authenticator is required")
		}
		wrapModule := func(next http.Handler) http.Handler {
			if isIdempotentModule(module) {
				next = Idempotency(idempotencyKeys, cfg.Idempotency.TTL, transactionalPOSTPaths(module)...)(next)
			}
			if !isPublicModule(module) {
				next = authenticationMiddleware(authenticator, permissionAuthorizer, permissionEndpoint, pattern, module, next)
			}
			return next
		}
		if _, configured := module.(modules.ConfigurableHTTPModule); configured && pattern == "/" {
			if len(moduleRoutes) == 0 {
				return nil, errors.New("root module must expose discoverable http routes")
			}
			for _, route := range moduleRoutes {
				routes.Method(route.Method, route.Path, wrapModule(rootHandlers[route.Method+" "+route.Path]))
			}
		} else {
			routes.Mount(pattern, wrapModule(handler))
		}
	}

	// Gateway checks need route precedence even when local authorization is disabled.
	for _, module := range mounted {
		if receiver, ok := module.(modules.HTTPPermissionRouteCatalog); ok {
			receiver.SetHTTPPermissionRoutes(catalog)
		}
	}
	return r, nil
}
func isPublicModule(module modules.Module) bool {
	public, ok := module.(modules.PublicHTTPModule)
	return ok && public.Public()
}

func isIdempotentModule(module modules.Module) bool {
	idempotent, ok := module.(modules.IdempotentHTTPModule)
	return ok && idempotent.Idempotent()
}

func httpTranslator(mounted []modules.Module) i18n.Translator {
	for _, module := range mounted {
		if source, ok := module.(modules.HTTPLocalizer); ok {
			return source.Translator()
		}
	}
	return nil
}

func transactionalPOSTPaths(module modules.HTTPModule) []string {
	if transactional, ok := module.(modules.TransactionalPOSTModule); ok {
		return transactional.TransactionalPOSTPaths()
	}
	return nil
}
