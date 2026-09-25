package app

import (
	"auth/internal/common/config"
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
	authmodule "auth/internal/modules/auth"
	dictionarymodule "auth/internal/modules/dictionary"
	rolemodule "auth/internal/modules/role"
	usermodule "auth/internal/modules/user"
	groupmodule "auth/internal/modules/usergroup"
	whitelistmodule "auth/internal/modules/whitelist"

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
	pagination pagination.Limits

	authenticator    *authn.Manager
	idempotencyKeys  idempotency.Store
	credentials      *authmodule.Credentials
	loginSessions    *authmodule.Sessions
	loginCaptcha     *authmodule.PointCaptcha
	sliderCaptcha    *authmodule.SliderCaptcha
	passwordGuard    *authmodule.PasswordChangeGuard
	authSwitches     authmodule.Switches
	actionModule     *actionmodule.Module
	authModule       *authmodule.Module
	dictionaryModule *dictionarymodule.Module
	roleModule       *rolemodule.Module
	userModule       *usermodule.Module
	groupModule      *groupmodule.Module
	whitelistModule  *whitelistmodule.Module

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

	if err := logging.Init(os.Stdout, cfg.Log.Level); err != nil {
		return nil, err
	}
	config.LogOverrides(overrides)
	limits, err := pagination.New(cfg.Pagination.MaxP, cfg.Pagination.MaxS)
	if err != nil {
		return nil, err
	}
	authSwitches := authSwitchesFromConfig(cfg)
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
				slog.Error("shutdown tracer failed: " + err.Error())
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
	var sessionStore authmodule.SessionStore = authmodule.NewMemorySessionStore()
	var pointCaptchaStore authmodule.PointCaptchaStore = authmodule.NewMemoryPointCaptchaStore()
	var passwordFailureStore authmodule.PasswordFailureStore = authmodule.NewMemoryPasswordFailureStore()
	var dictionaryCache dictionarymodule.ValueCache = dictionarymodule.NewMemoryValueCache()
	challengeStore = authmodule.NewRedisChallengeStore(rdsClient)
	sessionStore = authmodule.NewRedisSessionStore(rdsClient)
	pointCaptchaStore = authmodule.NewRedisPointCaptchaStore(rdsClient)
	passwordFailureStore = authmodule.NewRedisPasswordFailureStore(rdsClient)
	redisDictionaryCache, cleanupDictionaryCache, err := rds.NewRedisNamespaceCache(cfg.Redis.DSN, cfg.Redis.Prefix, "dictionary:cache")
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize dictionary cache: %w", err)
	}
	dictionaryCache = redisDictionaryCache
	cleanups = append(cleanups, cleanupDictionaryCache)
	dictionaryModule, err := dictionarymodule.New(dbStore, dictionaryCache, dictionarymodule.CacheTTL, limits, authSwitches.ProtectCaptchaDictionaries)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize dictionary module: %w", err)
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
		cfg.Auth.Refresh.SessionLifetime,
		cfg.Auth.Refresh.RememberLifetime,
	)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize login sessions: %w", err)
	}
	authenticator, err := authn.New(cfg.Auth.Jwt.Issuer, cfg.Auth.Jwt.Key, cfg.Auth.Jwt.Lifetime, authmodule.NewIdentityValidator(dbStore, loginSessions, authSwitches))
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("initialize authentication: %w", err)
	}

	application := &Application{
		pagination: limits,

		authenticator:    authenticator,
		idempotencyKeys:  idempotencyKeys,
		credentials:      credentials,
		loginSessions:    loginSessions,
		loginCaptcha:     loginCaptcha,
		sliderCaptcha:    sliderCaptcha,
		passwordGuard:    passwordGuard,
		authSwitches:     authSwitches,
		dictionaryModule: dictionaryModule,

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

func authSwitchesFromConfig(cfg *config.Config) authmodule.Switches {
	return authmodule.Switches{
		PasswordResetRequired:      cfg.Auth.Switches.PasswordResetRequired,
		ProtectSuper:               cfg.Auth.Switches.ProtectSuper,
		ProtectCaptchaDictionaries: cfg.Auth.Switches.ProtectCaptchaDictionaries,
		EnableE2ETest:              cfg.Auth.Switches.EnableE2ETest,
	}
}

func (a *Application) wireBusinessModules() {
	// Build in dependency order; generatedModules registers these same instances.
	// The dictionary is initialized earlier because captcha construction needs it.
	a.actionModule = actionmodule.New(a.db, a.pagination, a.authSwitches.ProtectSuper)
	a.roleModule = rolemodule.New(a.db, a.pagination, a.actionModule, a.authSwitches.ProtectSuper)
	a.userModule = usermodule.New(a.db, a.pagination, a.credentials, a.passwordGuard, a.actionModule, a.roleModule, a.authSwitches)
	a.groupModule = groupmodule.New(a.db, a.pagination, a.actionModule, a.userModule)
	a.authModule = authmodule.New(a.db, a.authenticator, a.credentials, a.loginSessions, a.loginCaptcha, a.sliderCaptcha, a.passwordGuard, a.authSwitches)
	a.whitelistModule = whitelistmodule.New(a.db, a.pagination)
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
