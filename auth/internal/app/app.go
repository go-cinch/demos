package app

import (
	"auth/internal/common/config"
	"auth/internal/modules/localization"
	"context"
	"fmt"
	"google.golang.org/grpc"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"auth/internal/common/authn"
	"auth/internal/common/idempotency"
	actionmodule "auth/internal/modules/action"
	auditmodule "auth/internal/modules/audit"
	authmodule "auth/internal/modules/auth"
	dictionarymodule "auth/internal/modules/dictionary"
	msgmodule "auth/internal/modules/msg"
	rolemodule "auth/internal/modules/role"
	usermodule "auth/internal/modules/user"
	groupmodule "auth/internal/modules/usergroup"

	"auth/internal/common/logging"
	"auth/internal/common/pagination"
	"auth/internal/common/rpc"
	"auth/internal/common/server"
	"auth/internal/common/tracing"
	"auth/internal/modules"

	"auth/internal/infra/db"
	"auth/internal/infra/rds"
)

type Application struct {
	authPath     string
	localization *localization.Module
	auditModule  *auditmodule.Module
	msgModule    *msgmodule.Module
	pagination   pagination.Limits

	authenticator    *authn.Manager
	idempotencyKeys  idempotency.Store
	credentials      *authmodule.Credentials
	loginSessions    *authmodule.Sessions
	loginCaptcha     *authmodule.PointCaptcha
	sliderCaptcha    *authmodule.SliderCaptcha
	passwordGuard    *authmodule.PasswordChangeGuard
	actionModule     *actionmodule.Module
	authModule       *authmodule.Module
	dictionaryModule *dictionarymodule.Module
	roleModule       *rolemodule.Module
	userModule       *usermodule.Module
	groupModule      *groupmodule.Module

	server          *http.Server
	profilerServer  *http.Server
	grpcServer      *grpc.Server
	grpcAddr        string
	shutdownTimeout time.Duration

	db       *db.Store
	rds      *rds.Client
	cleanups []func()
}

func New(ctx context.Context, confPath string) (*Application, error) {
	cfg, overrides, err := config.LoadDir(confPath)
	if err != nil {
		return nil, err
	}

	authPath, err := config.NormalizeHTTPPath(cfg.Auth.Path)
	if err != nil {
		return nil, err
	}

	if err := logging.Init(os.Stdout, cfg.Log.Level); err != nil {
		return nil, err
	}
	config.LogOverrides(overrides)
	limits, err := pagination.New(cfg.Pagination.MaxP, cfg.Pagination.MaxS)
	if err != nil {
		return nil, err
	}
	cleanups := make([]func(), 0, 3)
	cleanup := func() {
		for index := len(cleanups) - 1; index >= 0; index-- {
			cleanups[index]()
		}
	}
	if cfg.Tracer.Enabled {
		provider, err := tracing.NewProvider(ctx, cfg)
		if err != nil {
			return nil, err
		}
		cleanups = append(cleanups, func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := provider.Shutdown(shutdownCtx); err != nil {
				slog.ErrorContext(shutdownCtx, "shutdown tracer failed: "+err.Error(), slog.String("operation", "tracer_shutdown"), slog.String("outcome", "failure"), slog.Any("error", err))
			}
		})
	}

	dbStore, cleanupDB, err := db.New(ctx, cfg)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize database: %w", err)
	}
	cleanups = append(cleanups, cleanupDB)
	rdsClient, cleanupRDS, err := rds.New(ctx, cfg)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize redis: %w", err)
	}
	cleanups = append(cleanups, cleanupRDS)

	var idempotencyKeys idempotency.Store = idempotency.NewMemoryStore()
	idempotencyKeys = rds.NewIdempotencyStore(rdsClient)
	var challengeStore authmodule.ChallengeStore = authmodule.NewMemoryChallengeStore()
	var sessionStore authmodule.SessionStore = authmodule.NewRedisSessionStore(rdsClient)
	var pointCaptchaStore authmodule.PointCaptchaStore = authmodule.NewMemoryPointCaptchaStore()
	var passwordFailureStore authmodule.PasswordFailureStore = authmodule.NewMemoryPasswordFailureStore()
	var dictionaryCache dictionarymodule.ValueCache = dictionarymodule.NewMemoryValueCache()
	challengeStore = authmodule.NewRedisChallengeStore(rdsClient)
	pointCaptchaStore = authmodule.NewRedisPointCaptchaStore(rdsClient)
	passwordFailureStore = authmodule.NewRedisPasswordFailureStore(rdsClient)
	redisDictionaryCache, cleanupDictionaryCache, err := rds.NewRedisNamespaceCache(cfg.Redis.DSN, cfg.Redis.Prefix, "dictionary:cache")
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize dictionary cache: %w", err)
	}
	dictionaryCache = redisDictionaryCache
	cleanups = append(cleanups, cleanupDictionaryCache)
	localizer := localization.New(authmodule.AuthHTTPPaths(authPath))
	dictionaryModule, err := dictionarymodule.New(dbStore, dictionaryCache, dictionarymodule.CacheTTL, limits, localizer)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize dictionary module: %w", err)
	}
	if err := dictionaryModule.LoadLocalization(ctx); err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize localization: %w", err)
	}
	credentials, err := authmodule.NewCredentials(
		cfg.Auth.ChallengeEncryption.KeyID,
		cfg.Auth.ChallengeEncryption.PrivateKeyFile,
		cfg.Auth.ChallengeEncryption.TTL,
		challengeStore,
	)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize challenge encryption: %w", err)
	}
	loginCaptcha, err := authmodule.NewPointCaptcha(
		pointCaptchaStore,
		dictionaryModule,
		int64(cfg.Auth.PointCaptcha.Threshold),
		cfg.Auth.PointCaptcha.TTL,
		cfg.Auth.PointCaptcha.Width,
		cfg.Auth.PointCaptcha.Height,
		cfg.Auth.PointCaptcha.Tolerance,
		e2eTestEnabledFromConfig(cfg),
	)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize point captcha: %w", err)
	}
	sliderCaptcha, err := initializeSliderCaptcha(cfg, pointCaptchaStore, cleanup)
	if err != nil {
		return nil, err
	}
	passwordGuard, err := authmodule.NewPasswordChangeGuard(
		passwordFailureStore,
		loginCaptcha,
		int64(cfg.Auth.PasswordChange.Threshold),
		int64(cfg.Auth.PasswordChange.LockThreshold),
		cfg.Auth.PasswordChange.FailureTTL,
	)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize password change protection: %w", err)
	}
	loginSessions, err := authmodule.NewSessions(
		sessionStore,
		authmodule.SessionConfig{
			Issuer:           cfg.Auth.Jwt.Issuer,
			Key:              cfg.Auth.Jwt.Key,
			SessionLifetime:  cfg.Auth.Refresh.SessionLifetime,
			RememberLifetime: cfg.Auth.Refresh.RememberLifetime,
			RetryWindow:      cfg.Auth.Refresh.RetryWindow,
		},
	)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize login sessions: %w", err)
	}
	authenticator, err := authn.New(cfg.Auth.Jwt.Issuer, cfg.Auth.Jwt.Key, cfg.Auth.Jwt.Lifetime, authmodule.NewIdentityValidator(dbStore, loginSessions, authPath))
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize authentication: %w", err)
	}

	application := &Application{
		authPath:   authPath,
		pagination: limits,

		authenticator:    authenticator,
		idempotencyKeys:  idempotencyKeys,
		credentials:      credentials,
		loginSessions:    loginSessions,
		loginCaptcha:     loginCaptcha,
		sliderCaptcha:    sliderCaptcha,
		passwordGuard:    passwordGuard,
		dictionaryModule: dictionaryModule, localization: localizer,

		db:       dbStore,
		rds:      rdsClient,
		cleanups: cleanups,
	}

	application.wireBusinessModules()

	httpModules, grpcModules := application.generatedModules()
	if err := application.configureTransports(cfg, httpModules, grpcModules); err != nil {
		cleanup()
		return nil, err
	}
	return application, nil
}

func sliderCaptchaFromConfig(cfg *config.Config, store authmodule.PointCaptchaStore) (*authmodule.SliderCaptcha, error) {
	return authmodule.NewSliderCaptcha(store, authmodule.SliderCaptchaConfig{
		TTL:             cfg.Auth.SliderCaptcha.TTL,
		MinimumDuration: cfg.Auth.SliderCaptcha.MinimumDuration,
		EnableE2ETest:   e2eTestEnabledFromConfig(cfg),
	})
}

func initializeSliderCaptcha(cfg *config.Config, store authmodule.PointCaptchaStore, cleanup func()) (*authmodule.SliderCaptcha, error) {
	sliderCaptcha, err := sliderCaptchaFromConfig(cfg, store)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize slider captcha: %w", err)
	}
	return sliderCaptcha, nil
}

func (a *Application) wireBusinessModules() {
	// Build in dependency order; generatedModules registers these same instances.
	// The dictionary is initialized earlier because captcha construction needs it.
	a.actionModule = actionmodule.New(a.db, a.pagination, a.localization)
	a.authModule = authmodule.New(a.db, a.authenticator, a.credentials, a.loginSessions, a.loginCaptcha, a.sliderCaptcha, a.passwordGuard, a.localization, a.actionModule, a.authPath)
	a.auditModule = auditmodule.New(a.db, a.pagination)
	a.auditModule.SetAuthHTTPPath(a.authPath)
	if a.dictionaryModule != nil {
		a.actionModule.SetNameLocalization(a.dictionaryModule)
		a.actionModule.SetDefinitionCatalog(a.dictionaryModule)
	}
	if a.dictionaryModule != nil {
		a.dictionaryModule.SetPermissionGroups(a.actionModule)
		a.dictionaryModule.SetResourcePermissions(a.actionModule)
	}
	a.roleModule = rolemodule.New(a.db, a.pagination, a.actionModule)
	a.userModule = usermodule.New(a.db, a.pagination, a.credentials, a.passwordGuard, a.actionModule, a.roleModule)
	a.groupModule = groupmodule.New(a.db, a.pagination, a.actionModule, a.userModule)
	a.actionModule.SetPermissionAdministration(a.authModule)
	if a.dictionaryModule != nil {
		a.dictionaryModule.SetPermissionAdministration(a.authModule)
	}
	a.userModule.SetPermissionAdministration(a.authModule)
	a.roleModule.SetPermissionAdministration(a.authModule)
	a.groupModule.SetPermissionAdministration(a.authModule)
	a.msgModule = msgmodule.New(a.db, a.pagination)
}

func SignalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

func (a *Application) Close() {
	for index := len(a.cleanups) - 1; index >= 0; index-- {
		a.cleanups[index]()
	}
}

func (a *Application) configureTransports(cfg *config.Config, httpModules []modules.HTTPModule, grpcModules []modules.GRPCModule) error {
	// Start HTTP for HTTP modules or an empty scaffold; helpers do not enable it.
	if len(httpModules) > 0 || len(grpcModules) == 0 {
		handler, err := a.newRouter(cfg, httpModules)
		if err != nil {
			return fmt.Errorf("initialize http router: %w", err)
		}
		a.server = &http.Server{Addr: cfg.HTTP.Addr, Handler: handler, ReadHeaderTimeout: cfg.HTTP.ReadHeaderTimeout, IdleTimeout: cfg.HTTP.IdleTimeout}
	}
	if len(grpcModules) > 0 {
		var err error
		a.grpcServer, err = rpc.NewServer(cfg, grpcModules...)
		if err != nil {
			return fmt.Errorf("initialize grpc server: %w", err)
		}
		a.grpcAddr = cfg.GRPC.Addr
	}
	a.shutdownTimeout = cfg.GRPC.ShutdownTimeout
	if cfg.HTTP.Profiler.Enabled {
		a.profilerServer = &http.Server{
			Addr:              cfg.HTTP.Profiler.Addr,
			Handler:           server.NewProfilerHandler(),
			ReadHeaderTimeout: cfg.HTTP.ReadHeaderTimeout,
			IdleTimeout:       cfg.HTTP.IdleTimeout,
		}
	}

	return nil
}
