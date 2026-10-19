import { proxy } from 'valtio';
import { CompactEncrypt, importJWK, type JWK } from 'jose';
import { locale, t } from '../locales';
import { readStored, writeStored } from './storage';
import type {
  AuthInfo,
  SessionResult,
  PageResult,
  ResourceKind,
  RecordData,
  PointCaptcha,
} from './types';

const base = (import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth').replace(/\/$/, '');
const refreshKey = `cinch-garnet-session:${location.hostname}`;
let sessionGeneration = 0;
let pendingRequests = 0;
const pendingListeners = new Set<() => void>();
export const subscribePendingRequests = (listener: () => void) => {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
};
export const getPendingRequests = () => pendingRequests;
function changePendingRequests(delta: number) {
  pendingRequests = Math.max(0, pendingRequests + delta);
  pendingListeners.forEach((listener) => listener());
}
export const session = proxy({
  accessToken: '',
  refreshToken: readStored<string>(refreshKey, ''),
  resetRequired: false,
  user: null as AuthInfo | null,
  ready: false,
});
export class ApiError extends Error {
  constructor(
    public status: number,
    public data: {
      msg?: string;
      error_code?: string;
      captcha?: PointCaptcha;
      captcha_required?: boolean;
    },
  ) {
    super(data.msg || t('app.errors.failed'));
  }
}
export function clearSession() {
  sessionGeneration++;
  session.accessToken = '';
  session.refreshToken = '';
  session.user = null;
  session.resetRequired = false;
  writeStored(refreshKey, undefined);
}
export function acceptSession(value: SessionResult) {
  sessionGeneration++;
  session.accessToken = value.access_token;
  session.refreshToken = value.refresh_token;
  session.resetRequired = value.password_reset_required;
  writeStored(refreshKey, value.refresh_token);
}
let refreshing: Promise<void> | null = null;
export async function refreshSession() {
  if (!refreshing) {
    const generation = sessionGeneration;
    refreshing = request<SessionResult>('/auth/pub/refresh', {
      method: 'POST',
      body: { refresh_token: session.refreshToken },
      public: true,
    })
      .then((value) => {
        if (generation !== sessionGeneration) throw new Error(t('sessionExpired'));
        acceptSession(value);
      })
      .catch((error) => {
        if (generation === sessionGeneration) clearSession();
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
interface RequestOptions {
  method?: string;
  body?: unknown;
  public?: boolean;
  headers?: Record<string, string>;
  retry?: boolean;
  signal?: AbortSignal;
}
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  changePendingRequests(1);
  let response: Response;
  let data: any;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method || 'GET',
      signal: options.signal,
      headers: {
        'Accept-Language': locale.value,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(!options.public && session.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    data =
      response.status === 204
        ? undefined
        : await response.json().catch(() => ({ msg: t('app.errors.failed') }));
  } finally {
    changePendingRequests(-1);
  }
  if (response.ok) return data as T;
  if (data?.error_code === 'AUTH_PASSWORD_RESET_REQUIRED') {
    session.resetRequired = true;
    window.dispatchEvent(new Event('cinch-reset-required'));
  }
  if (
    response.status === 401 &&
    !options.public &&
    options.retry !== false &&
    session.refreshToken
  ) {
    try {
      await refreshSession();
    } catch (error) {
      window.dispatchEvent(new Event('cinch-session-ended'));
      throw error;
    }
    if (session.resetRequired && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('cinch-reset-required'));
      throw new ApiError(403, { error_code: 'AUTH_PASSWORD_RESET_REQUIRED' });
    }
    return request(path, { ...options, retry: false });
  }
  if (response.status === 401 && !options.public) {
    clearSession();
    window.dispatchEvent(new Event('cinch-session-ended'));
  }
  throw new ApiError(response.status, data || {});
}
let initializing: Promise<void> | null = null;
export async function initializeSession() {
  if (session.ready) return;
  initializing ||= (async () => {
    try {
      if (session.refreshToken) {
        await refreshSession();
        if (!session.resetRequired) await loadUser();
      }
    } catch {
      clearSession();
    } finally {
      session.ready = true;
    }
  })();
  return initializing;
}
export async function loadUser(): Promise<void> {
  const generation = sessionGeneration;
  const user = await request<AuthInfo>('/auth/info');
  if (generation === sessionGeneration) session.user = user;
  else if (session.accessToken) await loadUser();
}
export async function logout() {
  try {
    if (refreshing) await refreshing.catch(() => undefined);
    if (session.refreshToken)
      await request('/auth/pub/logout', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
        public: true,
      });
  } finally {
    clearSession();
    window.dispatchEvent(new Event('cinch-session-ended'));
  }
}
const credentialTypes = {
  login: 'login+jwe',
  register: 'register+jwe',
  password_change: 'password+jwe',
  password_reset: 'password-reset+jwe',
};
export async function encryptedCredential(
  purpose: keyof typeof credentialTypes,
  payload: Record<string, unknown>,
) {
  const authenticated = purpose === 'password_change' || purpose === 'password_reset';
  const challenge = await request<{ challenge_id: string; key_id: string; public_key: JWK }>(
    authenticated ? '/auth/challenge' : '/auth/pub/challenge',
    { method: 'POST', body: { purpose }, public: !authenticated },
  );
  const key = await importJWK(challenge.public_key, 'RSA-OAEP-256');
  const credential = await new CompactEncrypt(
    new TextEncoder().encode(JSON.stringify({ ...payload, challenge_id: challenge.challenge_id })),
  )
    .setProtectedHeader({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      kid: challenge.key_id,
      typ: credentialTypes[purpose],
    })
    .encrypt(key);
  return { challenge_id: challenge.challenge_id, credential };
}
export async function submitCredentials(
  purpose: 'login' | 'register' | 'password_change' | 'password_reset',
  payload: Record<string, unknown>,
) {
  const paths = {
    login: '/auth/pub/login',
    register: '/auth/pub/register',
    password_change: '/auth/change/pwd',
    password_reset: '/auth/reset/pwd',
  };
  return request<SessionResult>(paths[purpose], {
    method: purpose.startsWith('password') ? 'PATCH' : 'POST',
    body: await encryptedCredential(purpose, payload),
    public: purpose === 'login' || purpose === 'register',
  });
}
export function listResource(resource: ResourceKind, params: Record<string, unknown> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '' && value !== null)
      query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  return request<PageResult>(`/${resource}?${query}`);
}
export async function saveResource(
  resource: ResourceKind,
  payload: Record<string, unknown>,
  id?: number,
  idempotencyKey?: string,
) {
  let body = { ...payload };
  if (resource === 'user') {
    const password = body.password;
    delete body.password;
    if (typeof password === 'string' && password.trim())
      body = { ...body, ...(await encryptedCredential('register', { password })) };
  }
  return request<RecordData>(`/${resource}${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    body,
    headers: id ? undefined : { 'x-idempotent': idempotencyKey || crypto.randomUUID() },
  });
}
export function deleteResources(resource: ResourceKind, ids: number[]) {
  return request(`/${resource}/${ids.join(',')}`, { method: 'DELETE' });
}
export function canMenu(path: string) {
  if (path === '/dashboard/workspace') return !!session.user?.permission.menus.includes('*');
  return (
    path === '/dashboard/overview' ||
    path === '/profile' ||
    path === '/msg/inbox' ||
    !!session.user?.permission.menus.some(
      (value) =>
        value === '*' || value === (path === '/system/user-group' ? '/system/group' : path),
    )
  );
}
export function can(resource: ResourceKind, operation: string) {
  return !!session.user?.permission.btns.some(
    (value) =>
      value === '*' ||
      value === `system.${resource === 'user-group' ? 'user.group' : resource}.${operation}`,
  );
}
