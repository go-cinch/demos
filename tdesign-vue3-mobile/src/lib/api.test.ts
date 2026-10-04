import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactDecrypt, exportJWK, generateKeyPair } from 'jose';

const stored = new Map<string, string>();
let api: typeof import('./api');
beforeEach(async () => {
  vi.resetModules();
  stored.clear();
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubGlobal('document', { documentElement: { lang: '' }, createElement: () => ({}) });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) || null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  api = await import('./api');
});
afterEach(() => vi.unstubAllGlobals());

it('omits cleared multi-value filters while retaining explicit false and zero filters', async () => {
  const fetch = vi.fn(async (_url: string) => Response.json({ items: [], t: 0 }));
  vi.stubGlobal('fetch', fetch);
  await api.listResource('user', { status: [], code: [], enabled: false, p: 1, s: 20 });
  let params = new URL(String(fetch.mock.calls[0]?.[0]), 'http://localhost').searchParams;
  expect(params.has('status')).toBe(false);
  expect(params.has('code')).toBe(false);
  expect(params.get('enabled')).toBe('false');
  await api.listResource('user', { status: [0, 1], p: 1 });
  params = new URL(String(fetch.mock.calls[1]?.[0]), 'http://localhost').searchParams;
  expect(params.get('status')).toBe('0,1');
});

it('ignores account information that arrives after sign-out', async () => {
  api.acceptSession({
    access_token: 'memory',
    refresh_token: 'refresh',
    expired_at: 0,
    password_reset_required: false,
  });
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const loading = api.loadUser();
  api.clearSession();
  resolve(
    Response.json({
      id: 1,
      username: 'previous',
      code: 'OLD',
      permission: { menus: ['*'], btns: ['*'] },
    }),
  );
  await loading;
  expect(api.session.user).toBeNull();
  expect(api.session.accessToken).toBe('');
});

describe('credential transport', () => {
  for (const [purpose, typ, path] of [
    ['login', 'login+jwe', '/auth/pub/login'],
    ['register', 'register+jwe', '/auth/pub/register'],
    ['password_change', 'password+jwe', '/auth/change/pwd'],
    ['password_reset', 'password-reset+jwe', '/auth/reset/pwd'],
  ] as const) {
    it(`encrypts ${purpose} fields with the one-time challenge`, async () => {
      const keys = await generateKeyPair('RSA-OAEP-256');
      const public_key = await exportJWK(keys.publicKey);
      const calls: {
        url: string;
        body: Record<string, unknown>;
        headers: Record<string, string>;
      }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, options: RequestInit) => {
          const body = JSON.parse(String(options.body));
          calls.push({ url, body, headers: options.headers as Record<string, string> });
          return Response.json(
            url.endsWith('/challenge')
              ? { challenge_id: 'one-time', key_id: 'key-1', public_key }
              : {
                  access_token: 'memory-only',
                  refresh_token: 'rotating',
                  password_reset_required: false,
                },
          );
        }),
      );
      const payload =
        purpose === 'login'
          ? { username: 'one', password: 'x', slider_proof: 'proof' }
          : purpose === 'register'
            ? { username: 'two', password: 'y', slider_proof: 'proof' }
            : purpose === 'password_change'
              ? {
                  old_password: 'x',
                  new_password: 'y',
                  captcha_id: 'points',
                  captcha_points: [{ x: 12, y: 15 }],
                }
              : { new_password: 'z' };
      await api.submitCredentials(purpose, payload);
      expect(calls[0].body).toEqual({ purpose });
      expect(calls[1].url).toBe(`/api/auth${path}`);
      expect(Object.keys(calls[1].body).sort()).toEqual(['challenge_id', 'credential']);
      const { plaintext, protectedHeader } = await compactDecrypt(
        String(calls[1].body.credential),
        keys.privateKey,
      );
      expect(protectedHeader).toEqual({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: 'key-1', typ });
      expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual({
        ...payload,
        challenge_id: 'one-time',
      });
      expect(calls[1].headers['Accept-Language']).toBe('zh-CN');
    });
  }
  it('encrypts administrator passwords but leaves password-free edits challenge-free', async () => {
    const keys = await generateKeyPair('RSA-OAEP-256');
    const public_key = await exportJWK(keys.publicKey);
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(options.body)) });
        return Response.json(
          url.endsWith('/challenge')
            ? { challenge_id: 'once', key_id: 'key', public_key }
            : { id: 1 },
        );
      }),
    );
    await api.saveResource(
      'user',
      { username: '  single  ', password: '  x  ' },
      undefined,
      'stable-idempotency',
    );
    expect(calls[1].body).not.toHaveProperty('password');
    expect(calls[1].body.username).toBe('single');
    const decrypted = await compactDecrypt(String(calls[1].body.credential), keys.privateKey);
    expect(JSON.parse(new TextDecoder().decode(decrypted.plaintext))).toEqual({
      challenge_id: 'once',
      password: 'x',
    });
    calls.length = 0;
    await api.saveResource('user', { username: 'changed' }, 1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ username: 'changed' });
  });
});
it('rotates refresh once for concurrent unauthorized calls and persists no access token', async () => {
  api.acceptSession({
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    expired_at: 0,
    password_reset_required: false,
  });
  let refreshes = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/auth/pub/refresh')) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return Response.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          password_reset_required: false,
        });
      }
      return (options.headers as Record<string, string>).Authorization === 'Bearer new-access'
        ? Response.json({ ok: true })
        : Response.json({ error_code: 'UNAUTHORIZED' }, { status: 401 });
    }),
  );
  await Promise.all([api.request('/user'), api.request('/role')]);
  expect(refreshes).toBe(1);
  expect(api.session.refreshToken).toBe('new-refresh');
  expect([...stored.values()].join('')).not.toContain('access');
});
it('cannot restore an ended session from a late refresh response', async () => {
  api.acceptSession({
    access_token: 'before',
    refresh_token: 'refresh',
    expired_at: 0,
    password_reset_required: false,
  });
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const refreshing = api.refreshSession();
  api.clearSession();
  resolve(
    Response.json({
      access_token: 'after',
      refresh_token: 'after-refresh',
      password_reset_required: false,
    }),
  );
  await expect(refreshing).rejects.toThrow();
  expect(api.session.accessToken).toBe('');
  expect(api.session.refreshToken).toBe('');
});

it('accepts canonical and retained legacy group menus without granting other resources', async () => {
  for (const menu of ['/system/user-group', '/system/group']) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 1,
          username: 'operator',
          code: 'ABC12345',
          permission: { menus: [menu], btns: [] },
        }),
      ),
    );
    await api.loadUser();
    expect(api.canMenu('/system/user-group')).toBe(true);
    expect(api.canMenu('/system/msg')).toBe(false);
    expect(api.canMenu('/system/user')).toBe(false);
  }
});
