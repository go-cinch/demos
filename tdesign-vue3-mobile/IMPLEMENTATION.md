# TDesign Mobile · 月白 implementation

Source: Tencent/tdesign-mobile-vue, develop 99cacdfeb13fd563991b97353cf550e2fba67bd0 (1.16.2). The upstream repository is a component library, so the application consumes its published package. Its MIT license is preserved verbatim in LICENSE_TDESIGN. Upstream declares pnpm 10.2.0 and has no committed application lockfile; this application's dependency lock is generated with that pnpm version.

Visual source: `/Users/eric/dev/learning/go-cinch/mobile-admin/index.html` and `DESIGN.md`. The implementation preserves moonwhite/night-blue colors, the halo overview, floating four-entry navigation, 24px margins, mobile list/detail/editor sheets and a left-aligned mobile window at desktop widths. Prototype-only fixtures, fake audit activity and demo sign-in are replaced with real data and authentication.

Functional source: ../vben-antd-vue3/apps/web-antd/src. Resource field/filter/column metadata and both locale catalogs are ported directly. Prototype presentation overrides desktop table layout; original routes and backend contracts remain.

Delivery audit completed on 2026-09-27:

- [x] Vue 3 / TDesign app, locked install, typecheck, formatting, build
- [x] Scaffold selector, preset, Make local, flattened generation, artifact/collision tests
- [x] Auth login/register/reset/change, JWE, slider/point captcha, remember/refresh/logout
- [x] User, role, user-group, action, dictionary, whitelist CRUD, associations, filters, permissions
- [x] Review/reject, temporary/permanent lock/unlock, password-change unlock
- [x] Overview/workspace/profile, mobile management/security navigation, shell settings/locales
- [x] Search suggestions/history, grouped pagination and page size, result density/columns/style, batch selection
- [x] Browser visual review, responsive and dark/reduced modes
- [x] Full headless black-box E2E, cleanup verified

## Functional inventory

| Area                | Maintained behavior and verification                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes              | `/`, `/auth`, `/auth/login`, `/auth/register`, `/auth/reset-password`, `/dashboard`, `/dashboard/overview`, `/dashboard/workspace`, `/system`, six `/system/<resource>` routes and `/profile`; original business paths and user-group permission mapping are retained.                           |
| Authentication      | RSA-OAEP-256 / A256GCM JWE, purpose-specific credential types, real server slider proof, immediate point verification and refreshed challenges, registration availability, required reset, rotated refresh tokens, memory-only access tokens, logout and hostname-scoped remembered credentials. |
| Management          | Original fields, columns, filters and validation schemas; real CRUD and idempotency; changed-field PATCH payloads; remote role/action/member/group pickers; review/rejection, temporary/permanent locks, unlock and password-change unlock preserve unrelated metadata.                          |
| Presentation        | Chinese/English catalogs and language headers; baseline semantic tag colors, action/member/role links and plain date-time format; mobile sheets and cards follow the supplied prototype.                                                                                                         |
| Navigation/settings | Overview remains available to every authenticated user; menu/button/route guards, four mobile entries, page tabs, pin/close, shell actions, persisted appearance and copyright settings, and reload-persistent screen lock.                                                                      |
| Lists               | Server pagination and page-size selection, delayed blur search, suggestions with highlights/history, multiline tags, batch operations, JSON scroll limits, density, visible fields and table styles. Mobile-only controls use icon-labelled touch targets and intentionally omit fullscreen.     |

`/dashboard/overview` uses the requested prototype's layout and real backend counts. Its former simulated activity timeline displays real recently created users. Display name and department use existing user metadata. No fake audit API, mock authentication or demo-data reset is shipped.

## Local runtime

- Template: `/Users/eric/dev/learning/go-cinch/pc-admin-fe-layout/{{ .Project }}/tdesign-vue3-mobile`
- Generated demo: `/Users/eric/dev/learning/go-cinch/demos/tdesign-vue3-mobile`
- Frontend: `http://127.0.0.1:5670/`
- Backend/proxy target: `http://127.0.0.1:8081`
- Generation: `make local DEMO=tdesign-vue3-mobile`
- The ignored generated `.env.development.local` preserves its assigned port and proxy on regeneration.
- The generated backend was validated with `make lint test build` and started with `SERVICE_HTTP_ADDR=:8081 ./bin/auth -c ./conf`, since its existing HTTP config specified port 8080. Auth switches were not changed and `enableE2ETest` remained false.

## Verified checks

From the layout repository, `scaffold lint scaffold.yml` and the complete `make test` passed. The suite covers all five UI families, selectors/aliases/presets, production API substitution, flattened output, exact source/asset copies, excluded artifacts, collision protection, `make local` selection, explicit UI overrides and preservation of the local environment.

From the generated demo, all passed:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm check:type
pnpm test
pnpm build
```

Eight unit tests cover decryptable JWE transport for all four purposes, encrypted administrator credentials, challenge-free ordinary edits, concurrent refresh rotation, and late responses after sign-out. Production build completed without a large-chunk warning; the main JavaScript chunk is approximately 426 KB before gzip.

From `/Users/eric/dev/learning/go-cinch/e2e`, all passed:

```sh
pnpm typecheck
E2E_FRONTEND=tdesign-vue3-mobile E2E_MODE=full E2E_BASE_URL=http://127.0.0.1:5670 pnpm exec playwright test --list
pnpm test:tdesign-vue3-mobile:full -- http://127.0.0.1:5670/
```

The complete headless full suite reports **38 passed, 0 failed, 0 skipped**. Every intended full-mode case passed. This includes both built-in-record restoration cases, six-resource CRUD, trimmed credential flows, associations, encrypted auth/reset/change, session invalidation, captcha interactions, review and temporary locking, permission boundaries, direct-entry/refresh and recoverable-error behavior, pagination/page size, table controls, batch cleanup, locale/copyright and responsive behavior. Dedicated Mobile Chromium and Mobile WebKit projects exercise touch verification, dock navigation and nested sheets.

An additional UI-only cleanup audit searched all six resources for this task's unique test prefixes and found no residual records. The administrator identity and built-in dictionary switch were restored to their original values. Existing E2E worktree changes were preserved; only the new target suite, its package entry and documentation were added.

Independent Chromium and WebKit checks passed real login, touch and keyboard verification, nested-sheet behavior, all six editor sheets, Escape behavior, desktop layout, logout and absence of page errors. The full suite covers 320, 375, 390, 430, 768, 844 (landscape) and 1440px, plus dark mode, reduced transparency and reduced motion. Physical-device acceptance was not run.

Tencent and Vben license contents are preserved in `LICENSE_TDESIGN` and `LICENSE_VBEN`; see `THIRD_PARTY_NOTICES.md` for provenance.

## UI audit follow-up

The later 25-item UI audit is addressed in [UI_FIXES.md](UI_FIXES.md). The full-suite result above describes the earlier delivery; it does not claim that the full state-changing suite was rerun for the UI follow-up. Current focused validation is recorded separately.
