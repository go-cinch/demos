# vben-antd-vue3

Built with Vben Admin, Vue 3, and Ant Design Vue 4, integrated with Go Cinch
chi-auth-layout.

Run these commands from the generated project root:

```bash
pnpm install --frozen-lockfile
AUTH_PROXY_TARGET=http://127.0.0.1:8080 pnpm dev
pnpm check:type
pnpm build
pnpm preview
```

Requires Node.js `^22.18.0 || ^24.12.0` and pnpm `11.16.0`.
The application lives in `apps/web-antd`; `packages` and `internal` provide
shared components and build tools. Dependencies are installed after generation;
node_modules and package manager caches are not part of the template.

The development browser API base defaults to `/api/auth`. Set `AUTH_PROXY_TARGET`
to your backend URL during development, either in the shell or in
`apps/web-antd/.env.development.local`. When unset, use an external gateway.
Vite removes the outer `/api/auth` prefix, forwarding `/api/auth/pub/login`
to `/pub/login` and `/api/auth/user` to `/user`, preserving backend module
paths without colliding with frontend routes such as `/auth/login`.

For production, replace `auth-service:8080` in `scripts/deploy/nginx.conf` with
your upstream service address. Keep the trailing `/` in `proxy_pass`.
Build output is written to `apps/web-antd/dist`. Production
`VITE_GLOB_API_URL` and `VITE_GLOB_AUTH_API_URL` default to
`https://entry.go-cinch.top/api/auth`; rebuild after changing either value.

Each backend service has its own client and base URL. Authentication uses the
backend's default empty `auth.path`:

```ts
authRequestClient.get('/info'); // /api/auth/info
orderRequestClient.get('/list'); // /api/order/list
```

`VITE_GLOB_AUTH_API_URL` configures Auth. `VITE_GLOB_ORDER_API_URL` independently
configures Order and defaults to `/api/order`; set an absolute URL if the gateway
is on another origin. Add future service clients through
`createServiceRequestClient(baseURL)` in `apps/web-antd/src/api/request.ts` to
reuse token, language, scope, refresh, and error handling. API functions pass only
service-internal paths. Login and token refresh always use Auth clients.
Declaring an Order client does not provision an Order backend or its route:
configure APISIX `/api/order` forwarding when connecting the service, or add a
Vite development proxy when connecting directly to a local upstream.

Mock services are disabled. The application uses frontend menus and backend
permissions. Backend menu mode requires a custom `/menu/all` endpoint.
Run existing tests with `pnpm test:unit`. Vben's original MIT notice is
available in `LICENSE_VBEN`.
