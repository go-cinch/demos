<!-- BEGIN SHARED FRONTEND RULES -->

# Frontend Template Rules

## 1. Route API requests through a client for each service

- Each backend service has its own named request client and configurable `baseURL`, for example `authRequestClient` with `/api/auth` and `orderRequestClient` with `/api/order`.
- API functions pass only the path within that service: `authRequestClient.get('/info')` and `orderRequestClient.get('/list')`. Keep gateway prefixes and service origins in client configuration, outside API functions and page components.
- Reuse the shared request factory for token injection, language and scope headers, token refresh, response handling, and errors. Login and token refresh continue to use the Auth service; concurrent clients must share a refresh request for the same session.
- With the default empty backend `auth.path`, authentication endpoints use `/info`, `/pub/login`, `/pub/refresh`, etc. Resources such as `/user` and `/role` remain on the Auth service client. Frontend page routes such as `/auth/login` are independent.
- Adding a service requires its own configured base URL and gateway route. Add development proxy configuration when a local upstream is needed; declaring a client does not create a backend endpoint.

## 2. Keep interface copy concise and necessary

- Prefer a clear title, field label, and action over explanatory paragraphs. Do not add hints that repeat information already conveyed by the page, control, progress indicator, or interaction.
- Add guidance only when it changes a user's decision, explains a non-obvious requirement, helps recover from a current error, or communicates a meaningful consequence. Keep it short and next to the relevant control.
- Do not announce ordinary capabilities such as typing, scanning, pasting, copying, or clicking when the control already makes the action clear. Do not repeat a completed step as prose below its completed progress indicator.
- Keep actionable validation errors and essential warnings, such as recovery codes being shown only once. Concise copy must not hide requirements or consequences.
- Remove redundant copy together with its empty spacing and skeleton placeholders. Loading states must match the remaining content's layout and preserve the user's disclosure state.
- Apply these rules to every frontend family and every supported language.

### Positive examples

- Authenticator setup: "Bind an authenticator", a QR code, "Verification code", and "Confirm binding".
- Manual setup: expand "Cannot scan?" to show the setup key and a copy button, without an additional paragraph introducing the key.
- Validation: show "Enter all 6 digits" only when the submitted code is incomplete.
- Recovery codes: keep "These codes are shown only once. Save them before continuing."

### Negative examples

- Adding "Your password has been reset. Bind an authenticator to continue" beneath a progress indicator and a heading that already communicate those steps.
- Adding "Enter the digits displayed in your authenticator. Pasting is supported" below a field already labeled "Verification code".
- Adding "You can also manually enter the following key in your authenticator" directly above a visible setup key inside the manual-setup disclosure.
- Replacing deleted helper text with an empty reserved row or a skeleton bar that has no corresponding content.

## 3. Keep loading skeletons aligned with loaded content

- Loading skeletons must preserve the loaded page's layout and positions: reuse the same containers, column proportions, spacing, field alignment, control sizes, and responsive breakpoints. Place placeholders where the corresponding titles, fields, editors, previews, and actions will appear; do not replace a structured page with unrelated full-width paragraph bars. Verify initial loading and previous/next record navigation under delayed requests, keeping stable controls in place and preventing content from jumping when loading finishes.

## Template source and shared rules

- In this template repository, edit the selected UI sources inside the project placeholder directory. Preserve existing local changes when synchronizing a generated demo, and validate the selected template's generated output. Independently generated projects use their own source tree.
- This root `AGENTS.md` is the single source of shared frontend rules. The project template links to it as `.shared-agents.md`; the generation hook copies its current contents into a managed block in every generated project's `AGENTS.md`.
- Keep framework-specific instructions in each UI template's own `AGENTS.md`. Generation appends them after the shared block instead of overwriting them. Do not hand-maintain copies of shared rules in individual UI templates.
- In the template repository, after editing shared rules, use `make sync-agents` to update the managed block in existing canonical demo projects without regenerating their application code. Existing project-specific or locally added instructions outside the managed block must be preserved.

<!-- END SHARED FRONTEND RULES -->
