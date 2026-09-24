package modules

import (
	"context"
	"google.golang.org/grpc"
	"net/http"
)

type HTTPModule interface {
	Name() string
	HTTP() http.Handler
}

// Module aliases HTTPModule.
type Module = HTTPModule

// IdempotentHTTPModule opts a module's POST handlers into idempotency-key
// protection. Other HTTP methods pass through unchanged.
type IdempotentHTTPModule interface {
	HTTPModule
	Idempotent() bool
}

// PublicHTTPModule marks infrastructure modules that are public in their
// entirety. Business modules remain authenticated by default and expose any
// unauthenticated handlers below their module-local /pub prefix.
type PublicHTTPModule interface {
	HTTPModule
	Public() bool
}

// HTTPPermissionAuthorizer supplies resource authorization for every protected
// HTTP module. PermissionEndpoint is authenticated but skips authorization so
// gateways can call it without recursively authorizing the check itself.
type HTTPPermissionAuthorizer interface {
	HTTPModule
	AuthorizeHTTP(context.Context, string, string) (bool, error)
	PermissionEndpoint() string
}

// AnonymousHTTPModule handles explicit exceptions at its HTTP boundary.
type AnonymousHTTPModule interface {
	HTTPModule
	AllowAnonymousHTTP(*http.Request) bool
}

// GRPCModule exposes RPC services without requiring an HTTP route or Name.
type GRPCModule interface {
	GRPC(grpc.ServiceRegistrar)
}
