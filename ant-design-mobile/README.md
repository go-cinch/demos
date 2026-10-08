# Go Cinch · 绛钛 / Ant Design Mobile

React 18 + Ant Design Mobile 5.43 implementation of **`mobile-admin/index2.html` (绛钛 / Garnet Titanium)**. The warm titanium and burgundy palette and mobile bottom sheets retain that visual direction. The September 2026 usability revision reserves layout space for the mobile dock and presents the mobile app inside a centered phone frame on desktop. The backend, credentials and business data are real; no prototype accounts or local mock records are included.

```sh
cd /Users/eric/dev/learning/go-cinch/pc-admin-fe-layout
make local DEMO=ant-design-mobile
cd ../demos/ant-design-mobile
pnpm install --frozen-lockfile
pnpm dev
```

The generated `.env.development.local` preserves the selected port and `AUTH_PROXY_TARGET=http://127.0.0.1:8081` on regeneration. The local assignment is **5671**, following the existing assignments 5666–5670. The native Vite proxy removes `/api/auth` once: `/api/auth/auth/pub/login` reaches backend `/auth/pub/login`, while browser `/auth/login` remains an application route. Follow `chi-auth-layout/LOCAL_DEV_WORKFLOW.md` for backend setup.

The maintained template is `pc-admin-fe-layout/{{ .Project }}/ant-design-mobile`; the generated runnable output is `demos/ant-design-mobile`. Ant Design Mobile is an upstream component library rather than a ready-made admin application, so this template uses its published components in a standalone Vite application. Its MIT license is preserved in `LICENSE_ANT_DESIGN_MOBILE`; see `THIRD_PARTY_NOTICES.md`.

## Routes and behavior

- `/dashboard/overview`, `/dashboard/workspace`: distinct account statistics / pending reviews and a workspace with quick entries. The management and security dock sections use `?tab=manage` and `?tab=security`.
- `/system/user`, `/system/role`, `/system/user-group`, `/system/action`, `/system/dictionary`, `/system/whitelist`: search, remote suggestions and history, filters, pagination, selection, CRUD sheets, association pickers and display controls. User management includes registration review, temporary/permanent locks and password-change unlocking.
- `/profile`: current account details, password change and sign out. Global appearance and language remain in the upper-right configuration tools.
- `/auth/login`, `/auth/register`, `/auth/reset-password`: registration availability, server slider proof, one-time compact JWE, point captchas and restricted first-login sessions.

Access tokens remain in memory; refresh tokens rotate and persist separately. The login username field offers a hostname-scoped history of the ten most recently signed-in accounts, with filtering, keyboard selection and individual removal. Only successful login usernames are saved. After successful registration, the new username and password are filled into login once through memory only; refreshing or leaving the login page discards the password, and choosing a history account clears it. Passwords are never persisted, and former plaintext credential entries are removed at startup. Every request sends `Accept-Language`. Create requests use idempotency keys, administrator password changes are encrypted, and unchanged fields are omitted from updates. Route and button visibility follow server permissions.

The application supports Chinese and English, light/dark garnet themes, reduced transparency/motion, keyboard-managed verification and nested sheets, a persisted screen lock, opened-page tabs, and shared copyright settings. Forms protect unsaved edits; nested sheets consume browser Back; actions remain visible outside long form scrollers. Mobile fullscreen controls are omitted. Association pickers support backend pagination. Timestamp values use the selected timezone while preserving the plain `YYYY-MM-DD HH:mm:ss` display format; already-plain wall-time strings are preserved because they do not identify an instant. The message center is explicitly marked unavailable until a real notification capability exists.

## Checks

```sh
pnpm lint
pnpm check:type
pnpm test
pnpm build
cd ../../e2e
pnpm typecheck
E2E_FRONTEND=ant-design-mobile E2E_MODE=full E2E_BASE_URL=http://127.0.0.1:5671 pnpm exec playwright test --list
pnpm test:ant-design-mobile:full -- http://127.0.0.1:5671/
```

The headless central E2E suite exercises the visible UI on the loopback service, observes security-sensitive traffic, restores built-in resources and removes test-owned data in failure-path cleanup. Validation status and evidence are recorded in `IMPLEMENTATION.md`.

## Usability revision

See `UI_FIXES.md` for the disposition of all 35 audit findings and the validation scope. `IMPLEMENTATION.md` describes the original delivery; its historical full-suite result is not a test result for the current revision.
