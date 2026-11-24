/** Mirror Auth's sensitive-target classification for an early UI prompt only.
 * The server independently authorizes every actual request. */
export function needsSensitivePreflight(
  method: string | undefined,
  url: string | undefined,
  authService: boolean,
) {
  const verb = (method ?? 'GET').toUpperCase();
  const path =
    ((url ?? '').split(/[?#]/, 1)[0] ?? '').replace(/\/+$/, '') || '/';
  if (verb === 'DELETE') return true;
  if (!authService || !['PATCH', 'POST', 'PUT'].includes(verb)) return false;
  // Creating and editing drafts never changes the published mail content.
  if (
    (verb === 'POST' && path === '/mail-template') ||
    (verb === 'PATCH' && /^\/mail-template\/[^/]+$/.test(path))
  )
    return false;
  if (verb === 'PATCH' && path === '/change/pwd') return true;
  if (
    verb === 'POST' &&
    ['/email/bind', '/totp/confirm', '/totp/setup'].includes(path)
  )
    return true;
  if (verb === 'POST' && /^\/totp\/reset\/[^/]+$/.test(path)) return true;
  return [
    '/user',
    '/role',
    '/user-group',
    '/action',
    '/dictionary',
    '/mail-template',
  ].some((root) => path === root || path.startsWith(`${root}/`));
}

export function isVerificationFailure(code: unknown) {
  return [
    'AUTH_EMAIL_INVALID',
    'AUTH_STEP_UP_REQUIRED',
    'AUTH_VERIFICATION_INVALID',
    'AUTH_VERIFICATION_RATE_LIMITED',
  ].includes(String(code));
}
