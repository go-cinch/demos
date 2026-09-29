# Implementation audit

> Updated 2026-09-29 after aligning the template with the current Go Cinch mobile design and E2E requirements. See [UI_FIXES.md](UI_FIXES.md) for the detailed UI review.

Visual authority: `/Users/eric/dev/learning/go-cinch/mobile-admin/index2.html`, **绛钛 / Garnet Titanium**. Its light/dark palette, metal team card, glass dock, desktop presentation and sheet placement are preserved. No source from the 月白 `mobile-admin/index.html` is used.

Functional authority: the current Vben template's core/system/dashboard/profile routes, system management configuration, auth APIs, locale catalogs and shared product requirements. The six resources' fields, filters, columns, entities and titles were evaluated directly from both templates and compared; their definitions match. Both languages' `system`, `app` and `page` catalogs also match the Vben source.

| Capability                 | Implementation and evidence                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ant Design Mobile          | React 18 + Ant Design Mobile 5.43.0, Vite, pnpm 10.2.0 with a frozen lockfile. Upstream MIT license preserved verbatim in `LICENSE_ANT_DESIGN_MOBILE`.                                                                                                            |
| Garnet visual system       | Exact `index2.html` theme tokens; metal card, glass dock, mobile sheets, desktop phone frame and landscape layout. Chromium and WebKit screenshots inspected.                                                                                                     |
| Six management resources   | Original Vben routes and API contracts; create/edit/delete, remote associations, inline validation, permission controls, colored tags and bounded JSON views. All six CRUD journeys pass.                                                                         |
| Authentication             | Login, registration, first-login reset, password change, one-time RSA-OAEP-256 / A256GCM JWE, server slider proofs and point captchas. Eight unit tests cover encryption, rotation and late-session responses; browser tests verify encrypted request boundaries. |
| User moderation            | Reject/approve registrations, temporary/permanent locks, unlock and password-change unlocking. Browser checks cover validation, encrypted credential updates and cross-session invalidation.                                                                      |
| Search and result controls | Remote suggestions, matching highlights, removable history, deduplicated collapsible filters, grouped pagination, redesigned batch selection, density, column visibility and style controls. Mobile fullscreen is intentionally omitted.                          |
| Shell and permissions      | Overview/profile availability, protected-route and button guards, wildcard workspace permission, ordered tools, pin/close tabs, avatar menu and persistent screen lock. Guest and read-only accounts are covered.                                                 |
| Localization and branding  | Chinese/English, reactive validation messages, current-language API headers, logo variants, shared editable copyright and persisted appearance settings. Timestamp values use the selected timezone; plain wall-time strings remain unchanged.                    |
| Scaffold integration       | Selector `ant-design-mobile`, alias `antd-mobile`, presets, Make selection, flat generation, persisted local environment and first-free-port allocation. Complete layout suite passes.                                                                            |

## Runtime and generation

- Template: `/Users/eric/dev/learning/go-cinch/pc-admin-fe-layout/{{ .Project }}/ant-design-mobile`
- Demo: `/Users/eric/dev/learning/go-cinch/demos/ant-design-mobile`
- Frontend: `http://127.0.0.1:5671/`
- Backend/proxy target: `http://127.0.0.1:8081`
- Generate: `make local DEMO=ant-design-mobile`
- Start: `pnpm dev` in the generated demo.

The ignored `.env.development.local` preserves port 5671 and the proxy target across regeneration. Source/demo integrity and the flattened generated root were checked. Existing TDesign and unrelated worktree changes were preserved. The auth backend was reused without editing its configuration or enabling captcha bypasses. One earlier run encountered a temporary backend outage; the complete suite was rerun successfully after service recovery.

## Verified commands

From the layout repository:

```sh
scaffold lint scaffold.yml
make test
make local DEMO=ant-design-mobile
```

The complete layout suite covers all UI families, selectors/aliases/presets, custom production URLs, Make entry points, flat output, source/asset integrity, artifact exclusion, collision safety and local environment preservation.

From the generated demo:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm check:type
pnpm test
pnpm build
```

All pass; **27 unit tests passed**. The production build completes without a large-chunk warning.

From `/Users/eric/dev/learning/go-cinch/e2e`:

```sh
pnpm typecheck
E2E_FRONTEND=ant-design-mobile E2E_MODE=full E2E_BASE_URL=http://127.0.0.1:5671 pnpm exec playwright test --list
pnpm test:ant-design-mobile:full -- http://127.0.0.1:5671/
```

The final headless full run reports **38 passed, 0 failed, 0 skipped**. Every intended full-mode case passed. JUnit evidence is `e2e/test-results/ant-design-mobile.xml`; coverage is in `e2e/tests/ant-design-mobile`.

Responsive coverage includes 320, 375, 390, 430, 768, 844, 1024 and 1440px, portrait/landscape, dark mode, reduced transparency/motion, nested-sheet Escape behavior, viewport zoom configuration, copyright scroll boundaries and a desktop sheet-boundary assertion. Chromium and WebKit checks passed real login, keyboard verification, all six editor sheets, loading deadlines, independent skeletons, timezone behavior, desktop frame placement and zero page errors. Physical-device acceptance was not run.

After the final suite, an independent UI-only audit searched all six resources for this task's unique test prefixes and found **zero remaining test-owned business records**. Administrator identity was verified; built-in dictionary restoration is asserted in the passing suite. The audit session was signed out. Auth health and the frontend proxy were checked successfully.
