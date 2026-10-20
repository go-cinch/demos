package server

import (
	"auth/internal/common/apperror"
	"auth/internal/common/i18n"
	"errors"

	"auth/internal/common/auditctx"
	"log/slog"

	"net/http"
	"strings"

	"auth/internal/common/authn"
	"auth/internal/common/idempotency"

	"auth/internal/common/config"
	"auth/internal/common/redact"
	"auth/internal/modules"

	"github.com/go-chi/chi/v5"
)

func NewRouter(cfg *config.Config, authenticator *authn.Manager, idempotencyKeys idempotency.Store, mounted ...modules.Module) (http.Handler, error) {

	permissionAuthorizer, permissionEndpoint, err := newHTTPPermissionAuthorizer(cfg, mounted)
	if err != nil {
		return nil, err
	}

	r := chi.NewRouter()
	policy := redact.New(cfg.Redact.Keys...)
	r.Use(TraceID(cfg.Server.Name, policy))
	r.Use(ClientIP(), Locale(httpTranslator(mounted)), AccessLog(policy), Audit(auditRecorder(mounted), policy), Recoverer())

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
				next = Idempotency(idempotencyKeys, cfg.Idempotency.TTL)(next)
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

func authenticationMiddleware(authenticator *authn.Manager, authorizer modules.HTTPPermissionAuthorizer, permissionEndpoint, modulePath string, module modules.Module, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if anonymous, ok := module.(modules.AnonymousHTTPModule); ok && anonymous.AllowAnonymousHTTP(r) {
			next.ServeHTTP(w, r)
			return
		}
		if isPublicEndpoint(r.URL.Path, modulePath) {
			next.ServeHTTP(w, r)
			return
		}
		request, err := authenticator.AuthenticateRequest(r)
		if err != nil {
			writeAuthenticationError(w, r, err)
			return
		}
		request, err = authn.ScopeRequest(request)
		if err != nil {
			WriteError(w, r, http.StatusBadRequest, err)
			return
		}
		identity, _ := authn.FromContext(request.Context())
		auditctx.Identity(request.Context(), identity.UserID, identity.Username)
		if authorizer != nil && request.URL.Path != permissionEndpoint {
			allowed, err := authorizer.AuthorizeHTTP(request.Context(), request.Method, request.URL.Path)
			if err != nil {
				slog.ErrorContext(request.Context(), "authorize http request failed: "+err.Error(),
					"operation", "authorize_http_request", "outcome", "failure", "method", request.Method, "error", err)
				WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
				return
			}
			if !allowed {
				WriteError(w, r, http.StatusForbidden, apperror.Forbidden)
				return
			}
		}
		next.ServeHTTP(w, request)
	})
}

func newHTTPPermissionAuthorizer(cfg *config.Config, mounted []modules.Module) (modules.HTTPPermissionAuthorizer, string, error) {
	if !cfg.Auth.Authorization.Enabled {
		return nil, "", nil
	}
	var found modules.HTTPPermissionAuthorizer
	for _, module := range mounted {
		candidate, ok := module.(modules.HTTPPermissionAuthorizer)
		if !ok {
			continue
		}
		if found != nil {
			return nil, "", errors.New("http permission authorizer is duplicated")
		}
		found = candidate
	}
	if found == nil {
		return nil, "", errors.New("http permission authorizer is required")
	}
	endpoint := strings.TrimSpace(found.PermissionEndpoint())
	if endpoint == "" || !strings.HasPrefix(endpoint, "/") {
		return nil, "", errors.New("http permission endpoint must start with /")
	}
	return found, strings.TrimSuffix(found.Name(), "/") + endpoint, nil
}

func isPublicModule(module modules.Module) bool {
	public, ok := module.(modules.PublicHTTPModule)
	return ok && public.Public()
}

func isIdempotentModule(module modules.Module) bool {
	idempotent, ok := module.(modules.IdempotentHTTPModule)
	return ok && idempotent.Idempotent()
}

func isPublicEndpoint(path, modulePath string) bool {
	publicPath := strings.TrimSuffix(modulePath, "/") + "/pub"
	return path == publicPath || strings.HasPrefix(path, publicPath+"/")
}

func httpTranslator(mounted []modules.Module) i18n.Translator {
	for _, module := range mounted {
		if source, ok := module.(modules.HTTPLocalizer); ok {
			return source.Translator()
		}
	}
	return nil
}

func writeAuthenticationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, authn.ErrPasswordResetRequired):
		WriteError(w, r, http.StatusForbidden, err)
	case errors.Is(err, authn.ErrUnauthorized):
		WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
	default:
		slog.ErrorContext(r.Context(), "authenticate http request failed: "+err.Error(),
			"operation", "authenticate_http_request", "outcome", "failure", "method", r.Method, "error", err)
		WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
	}
}
