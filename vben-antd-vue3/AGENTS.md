# Vben Frontend Rules

## 1. Route API requests through a client for each service

- Use `authRequestClient.get('/info')` for Auth and `orderRequestClient.get('/list')` for Order. Each client owns its independently configured `baseURL`; API functions and page components must not repeat `/api/auth`, `/api/order`, or a service origin.
- Configure Auth through `VITE_GLOB_AUTH_API_URL` (default `/api/auth`) and Order through `VITE_GLOB_ORDER_API_URL` (default `/api/order`). Create future service clients with `createServiceRequestClient` in `src/api/request.ts` and a service-specific environment variable.
- Reuse shared token, language, scope, refresh, response, and error handling. Login and refresh requests always use Auth clients; concurrent clients share one refresh request for the same session. Set a service's response options explicitly when its response contract differs.
- The default backend `auth.path` is empty: use `/info`, `/pub/login`, `/pub/refresh`, and the other service-internal endpoints. Keep `/user` and `/role` unchanged. An explicitly configured backend module prefix must be handled consistently in that module's API layer.
- Keep frontend page routes such as `/auth/login` independent of API paths. New services also need gateway routing and, for direct local development, a corresponding proxy configuration.

## Validation

Run the affected request and API unit tests, the application's type check, and its production build. This file's `src` paths refer to `apps/web-antd/src` in the Vben workspace.
