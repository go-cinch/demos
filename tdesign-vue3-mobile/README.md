# Go Cinch · 月白 / TDesign Mobile Vue

Vue 3 mobile admin implementation of the `mobile-admin` prototype, using Tencent TDesign Mobile Vue 1.16.2. Authentication and all six management resources use the real Go Cinch auth service. There are no demo accounts, mock APIs or locally fabricated business records in this application.

## Generate and run locally

```sh
cd /Users/eric/dev/learning/go-cinch/pc-admin-fe-layout
make local DEMO=tdesign-vue3-mobile
cd ../demos/tdesign-vue3-mobile
pnpm install --frozen-lockfile
pnpm dev
```

`make local` chooses the first available port above 5666, honoring other demos' persisted assignments and active listeners. The current local assignment is **5670**. It preserves `.env.development.local` and installed dependencies on regeneration. An explicit `UI=` override remains supported.

The generated `.env.development.local` contains `VITE_PORT` and `AUTH_PROXY_TARGET=http://127.0.0.1:8081`. The Vite proxy removes only `/api/auth`; for example the browser path `/api/auth/auth/pub/login` reaches `/auth/pub/login`. `/auth/login` is a frontend route. Follow `chi-auth-layout/LOCAL_DEV_WORKFLOW.md` to run the backend; if its generated HTTP configuration is `:8080`, start with `SERVICE_HTTP_ADDR=:8081 ./bin/auth -c ./conf`. Keep auth switches in the backend's existing configuration.

Use the generated application's supported package manager, pnpm 10.2.0 (Corepack reads `packageManager`). Node 22 or 24 is recommended. The lockfile is committed to the source template; no upstream documentation site or unrelated workspace is imported.

## Pages and behavior

- `/dashboard/overview`: live user counts, quick entries and recent members. Management and security tabs use `?tab=manage` and `?tab=security`; no new business-route contracts are introduced.
- `/dashboard/workspace`: workspace entry for accounts with its permission.
- `/system/user`, `/system/role`, `/system/user-group`, `/system/action`, `/system/dictionary`, `/system/whitelist`: mobile lists, detail/edit sheets, remote association pickers, filters, search history, pagination, batch deletion and display controls.
- `/profile`: account information and password change; appearance stays in the global advanced settings.
- `/auth/login`, `/auth/register`, `/auth/reset-password`: one-time JWE credentials, server slider proof, point challenges and required first-login reset.

The interface provides Chinese and English, moonwhite/night-blue themes, reduced transparency and reduced motion, safe-area navigation, keyboard focus management, configurable copyright and a left-aligned mobile window on desktop widths. Original Vben field definitions, column meanings, permission codes, resource-tag colors and plain date-time formatting are retained. Display name and department are stored in the user's existing metadata object, preserving unrelated keys. The prototype's fake audit timeline becomes a list of real recently created users.

Access tokens stay in memory. Refresh tokens rotate and persist separately. Remembered username/password entries are scoped to the hostname and are cleared when the option is disabled; registration replaces the entry. Credentials never appear in URLs. Creates use `x-idempotent`, and password updates use encrypted credentials. Client permission checks complement the backend's authorization.

## Validation

```sh
pnpm lint
pnpm check:type
pnpm test
pnpm build
cd ../../e2e
pnpm typecheck
E2E_FRONTEND=tdesign-vue3-mobile E2E_MODE=full E2E_BASE_URL=http://127.0.0.1:5670 pnpm exec playwright test --list
pnpm test:tdesign-vue3-mobile:full -- http://127.0.0.1:5670/
```

The central E2E suite is headless and loopback-only. It drives the rendered UI, observes resulting network traffic and removes each test-owned record through the UI in `finally`. See `IMPLEMENTATION.md` for the completion audit. Tencent's upstream MIT license is preserved in `LICENSE_TDESIGN`.

## UI audit fixes

See [UI_FIXES.md](UI_FIXES.md) for the 25-item audit follow-up. Resource lists now separate visible fields from density, use compact business summaries and provide guarded editor closing. Keyboard slider verification uses the same server challenge and proof endpoints. The security page shows real account information; the unimplemented messages entry is hidden.

Focused, UI-only regressions live in the central `tests/tdesign-vue3-mobile/ui-audit-regression.spec.ts`. They do not submit business CRUD, moderation or password changes:

```sh
E2E_FRONTEND=tdesign-vue3-mobile E2E_MODE=full E2E_BASE_URL=http://127.0.0.1:5670 pnpm exec playwright test ui-audit-regression.spec.ts
```
