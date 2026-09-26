# Go Cinch Shadcn Admin

Next.js 16 + React 19 + Shadcn/Tailwind administration frontend for the Go Cinch auth service. It is based on the open-source edition of [next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) and does not require Clerk or any Pro-only package.

## Local development

The auth backend is expected at `http://127.0.0.1:8081`. Next.js rewrites browser requests from `/api/auth/*` to that backend and removes the `/api/auth` prefix.

```bash
npm install
npm run dev -- -p 5669
```

Open <http://localhost:5669>. Override the backend when necessary:

```bash
AUTH_PROXY_TARGET=http://127.0.0.1:8081 npm run dev -- -p 5669
```

See `env.example.txt` for the remaining optional variables.

## Features

- Login, registration, remembered credentials, logout and rotating refresh sessions.
- Native Web Crypto compact JWE using `RSA-OAEP-256` and `A256GCM`; password fields are never sent in plaintext.
- Server-issued slider proof and point-selection captcha with immediate verification.
- Required first-login password reset and self-service password change.
- Permission-aware navigation, route fallback and create/read/update/delete controls.
- User, role, user-group, action, dictionary and whitelist management.
- User registration review, timed/permanent lock, unlock and password-change unlock.
- Search history, backend suggestions, relationship pickers, pagination, bulk deletion, column visibility, density, fullscreen and table styles.
- Chinese and English locale switching, theme switching and responsive dashboard layout.

## Verification

```bash
npm run typecheck
npm run lint
NEXT_PUBLIC_SENTRY_DISABLED=true npm run build
```

The access token remains in memory. Only the rotating refresh token is persisted. “Remember me” intentionally stores the username and password so the login form can restore them, matching the backend workflow.
