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
    ['login', 'login+jwe', '/pub/login'],
    ['register', 'register+jwe', '/pub/register'],
    ['password_change', 'password+jwe', '/change/pwd'],
    ['password_reset', 'password-reset+jwe', '/reset/pwd'],
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
      expect(calls[1].headers['X-Auth-Scope']).toBe('admin');
      expect(calls[0].url).toBe(
        `/api/auth${purpose.startsWith('password') ? '/challenge' : '/pub/challenge'}`,
      );
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
      { username: 'single', password: 'x' },
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
      if (url.endsWith('/pub/refresh')) {
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

it('loads the selected permission projection and checks menu-scoped controls', async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      id: 1,
      username: 'operator',
      code: 'ABC12345',
      scope: 'admin',
      permission: {
        words: ['admin:read:system:user-group'],
        menus: [
          {
            menu_key: 'admin:menu:system:user-group',
            menu_path: '/system/user-group',
            btns: ['admin:btn:system:user-group:query'],
          },
          {
            menu_key: 'admin:menu:system:role',
            menu_path: '/system/role',
            btns: ['admin:btn:system:user-group:edit'],
          },
          {
            menu_key: 'mini:menu:system:user',
            menu_path: '/system/user',
            btns: ['mini:btn:system:user:create'],
          },
        ],
      },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  await api.loadUser();
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/info?f=id,username,code,role,scope,permission',
    expect.anything(),
  );
  expect(api.canMenu('/system/user-group')).toBe(true);
  expect(api.can('user-group', 'read')).toBe(true);
  expect(api.can('user-group', 'update')).toBe(false);
  expect(api.canMenu('/system/user')).toBe(false);
  expect(api.can('user', 'create')).toBe(false);
  expect(api.canMenu('/system/msg')).toBe(false);
  expect(api.canMenu('/dashboard/overview')).toBe(true);
  expect(api.canMenu('/profile')).toBe(true);
});
it('rejects an unexpected permission scope and grants nothing from legacy wildcard strings', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id: 1,
        username: 'operator',
        code: 'ABC12345',
        scope: 'mini',
        permission: { menus: [], words: [] },
      }),
    ),
  );
  await expect(api.loadUser()).rejects.toThrow();
  expect(api.session.user).toBeNull();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id: 1,
        username: 'operator',
        code: 'ABC12345',
        scope: 'admin',
        permission: { menus: ['*'], btns: ['*'] },
      }),
    ),
  );
  await api.loadUser();
  expect(api.canMenu('/system/user')).toBe(false);
  expect(api.can('user', 'create')).toBe(false);
});
it('does not replay a business request when refresh requires a password reset', async () => {
  api.acceptSession({
    access_token: 'old',
    refresh_token: 'refresh',
    expired_at: 0,
    password_reset_required: false,
  });
  const fetch = vi.fn(async (url: string) =>
    url === '/api/auth/pub/refresh'
      ? Response.json({
          access_token: 'restricted',
          refresh_token: 'rotated',
          password_reset_required: true,
        })
      : Response.json({ error_code: 'UNAUTHORIZED' }, { status: 401 }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(api.request('/user')).rejects.toMatchObject({ status: 403 });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/user', '/api/auth/pub/refresh']);
  expect(api.session.resetRequired).toBe(true);
});
