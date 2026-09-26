const API_BASE = '/api/auth';
const REFRESH_KEY = 'go-cinch-refresh-token';
const rememberKey = () =>
  `go-cinch-remembered-credentials:${typeof location === 'undefined' ? 'server' : location.hostname}`;

let accessToken = '';
let refreshing: Promise<LoginResult> | null = null;

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expired_at: number;
  password_reset_required: boolean;
}

export interface UserInfo {
  id: number;
  code: string;
  username: string;
  role?: { id: number; name: string; word: string };
  permission: { btns: string[]; menus: string[] };
}

export interface CaptchaPoint {
  x: number;
  y: number;
}
export interface PointCaptcha {
  captcha_id: string;
  captcha_image: string;
  expired_at: number;
  height: number;
  hint_text: string;
  target_count: number;
  width: number;
}

function base64url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function encryptCredential(
  purpose: 'login' | 'register' | 'password_change' | 'password_reset',
  payload: Record<string, unknown>
) {
  const authenticated = purpose === 'password_change' || purpose === 'password_reset';
  const challenge = await request<{
    challenge_id: string;
    key_id: string;
    public_key: JsonWebKey;
  }>(
    authenticated ? '/auth/challenge' : '/auth/pub/challenge',
    {
      method: 'POST',
      body: JSON.stringify({ purpose })
    },
    authenticated
  );
  const header = base64url(
    JSON.stringify({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      kid: challenge.key_id,
      typ:
        purpose === 'login'
          ? 'login+jwe'
          : purpose === 'register'
            ? 'register+jwe'
            : purpose === 'password_change'
              ? 'password+jwe'
              : 'password-reset+jwe'
    })
  );
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const rsaKey = await crypto.subtle.importKey(
    'jwk',
    challenge.public_key,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const encryptedKey = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, cek)
  );
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(header),
        tagLength: 128
      },
      aesKey,
      new TextEncoder().encode(JSON.stringify({ challenge_id: challenge.challenge_id, ...payload }))
    )
  );
  const ciphertext = sealed.slice(0, -16);
  const tag = sealed.slice(-16);
  return {
    challenge_id: challenge.challenge_id,
    credential: [
      header,
      base64url(encryptedKey),
      base64url(iv),
      base64url(ciphertext),
      base64url(tag)
    ].join('.')
  };
}

async function parseError(response: Response) {
  const data = await response.json().catch(() => ({}));
  const error = new Error(data.msg || data.message || `HTTP ${response.status}`) as Error & {
    status: number;
    data: Record<string, unknown>;
  };
  error.status = response.status;
  error.data = data;
  return error;
}

function emitAuthEvent(name: 'go-cinch-password-reset-required' | 'go-cinch-session-expired') {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

async function refreshSession() {
  const token = localStorage.getItem(REFRESH_KEY);
  if (!token) throw new Error('No session');
  const response = await fetch(`${API_BASE}/auth/pub/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': localStorage.getItem('go-cinch-locale') || 'zh-CN'
    },
    body: JSON.stringify({ refresh_token: token })
  });
  if (!response.ok) throw await parseError(response);
  const result = (await response.json()) as LoginResult;
  acceptSession(result);
  return result;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  retry = true
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept-Language', localStorage.getItem('go-cinch-locale') || 'zh-CN');
  if (authenticated && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && authenticated && retry && localStorage.getItem(REFRESH_KEY)) {
    refreshing ??= refreshSession().finally(() => {
      refreshing = null;
    });
    try {
      await refreshing;
    } catch (error) {
      clearSession();
      emitAuthEvent('go-cinch-session-expired');
      throw error;
    }
    return request<T>(path, init, authenticated, false);
  }
  if (!response.ok) {
    const error = await parseError(response);
    if (error.data.error_code === 'AUTH_PASSWORD_RESET_REQUIRED')
      emitAuthEvent('go-cinch-password-reset-required');
    throw error;
  }
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function acceptSession(result: LoginResult) {
  accessToken = result.access_token;
  localStorage.setItem(REFRESH_KEY, result.refresh_token);
}

export async function restoreSession() {
  return refreshSession();
}

export async function login(data: {
  username: string;
  password: string;
  remember_me: boolean;
  slider_proof: string;
  captcha_id?: string;
  captcha_points?: CaptchaPoint[];
}) {
  const encrypted = await encryptCredential('login', data);
  const result = await request<LoginResult>(
    '/auth/pub/login',
    { method: 'POST', body: JSON.stringify(encrypted) },
    false
  );
  acceptSession(result);
  if (data.remember_me)
    localStorage.setItem(
      rememberKey(),
      JSON.stringify({ username: data.username, password: data.password })
    );
  else localStorage.removeItem(rememberKey());
  return result;
}

export async function register(data: { username: string; password: string; slider_proof: string }) {
  const encrypted = await encryptCredential('register', data);
  await request('/auth/pub/register', { method: 'POST', body: JSON.stringify(encrypted) }, false);
  localStorage.setItem(
    rememberKey(),
    JSON.stringify({ username: data.username, password: data.password })
  );
}

export function rememberedAccount() {
  const current = localStorage.getItem(rememberKey());
  if (current) {
    try {
      const parsed = JSON.parse(current) as { username?: unknown; password?: unknown };
      if (typeof parsed.username === 'string')
        return {
          username: parsed.username,
          password: typeof parsed.password === 'string' ? parsed.password : ''
        };
    } catch {
      localStorage.removeItem(rememberKey());
    }
  }

  // Migrate the old format without ever retaining its plaintext password.
  const legacy = localStorage.getItem('go-cinch-remembered-credentials');
  localStorage.removeItem('go-cinch-remembered-credentials');
  try {
    const username = (JSON.parse(legacy || 'null') as { username?: unknown } | null)?.username;
    if (typeof username === 'string' && username) {
      const migrated = { username, password: '' };
      localStorage.setItem(rememberKey(), JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Invalid legacy data is intentionally discarded.
  }
  return null;
}

export async function logout() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (refreshToken)
    await request(
      '/auth/pub/logout',
      { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
      false
    ).catch(() => undefined);
  accessToken = '';
  localStorage.removeItem(REFRESH_KEY);
}

export const getUserInfo = () => request<UserInfo>('/auth/info');

export async function createPasswordCredential(password: string) {
  return encryptCredential('register', { password });
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
  captcha?: { id: string; points: CaptchaPoint[] }
) {
  const encrypted = await encryptCredential('password_change', {
    old_password: oldPassword,
    new_password: newPassword,
    captcha_id: captcha?.id,
    captcha_points: captcha?.points
  });
  return request('/auth/change/pwd', { method: 'PATCH', body: JSON.stringify(encrypted) });
}

export async function resetRequiredPassword(newPassword: string) {
  const encrypted = await encryptCredential('password_reset', { new_password: newPassword });
  const result = await request<LoginResult>(
    '/auth/reset/pwd',
    { method: 'PATCH', body: JSON.stringify(encrypted) },
    true,
    false
  );
  acceptSession(result);
  const remembered = rememberedAccount();
  if (remembered)
    localStorage.setItem(rememberKey(), JSON.stringify({ ...remembered, password: newPassword }));
  return result;
}

export function clearSession() {
  accessToken = '';
  localStorage.removeItem(REFRESH_KEY);
}
