import { message } from 'ant-design-vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { refreshTokenApi } from './core';
import { createServiceRequestClient } from './request';

type Tokens = Awaited<ReturnType<typeof refreshTokenApi>>;
const state = vi.hoisted(() => ({
  epoch: 0,
  logout: vi.fn(),
  acceptSession: vi.fn(),
  preferences: {
    app: {
      locale: 'zh-CN',
      enableRefreshToken: true,
      loginExpiredMode: 'page',
    },
  },
  session: {
    accessToken: 'old-access' as null | string,
    refreshToken: 'old-refresh' as null | string,
    isAccessChecked: true,
    setAccessToken: vi.fn(),
    setRefreshToken: vi.fn(),
    setLoginExpired: vi.fn(),
  },
}));

vi.mock('@vben/preferences', () => ({ preferences: state.preferences }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => state.session }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    logout: state.logout,
    captureSession: () => {
      const epoch = state.epoch;
      return () => epoch === state.epoch;
    },
    acceptSession: state.acceptSession,
  }),
}));
vi.mock('./core', () => ({ refreshTokenApi: vi.fn() }));
vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), info: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const rotated: Tokens = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expired_at: 123,
};
function switchAccount() {
  state.epoch += 1;
  state.session.accessToken = 'account-B-access';
  state.session.refreshToken = 'account-B-refresh';
}

beforeEach(() => {
  vi.resetAllMocks();
  state.epoch = 0;
  Object.assign(state.session, {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    isAccessChecked: true,
  });
  Object.assign(state.preferences.app, {
    enableRefreshToken: true,
    loginExpiredMode: 'page',
  });
  state.session.setAccessToken.mockImplementation((token: null | string) => {
    state.session.accessToken = token;
  });
  state.acceptSession.mockImplementation(async (response: Tokens) => {
    state.session.accessToken = response.access_token;
    state.session.refreshToken = response.refresh_token;
  });
  state.logout.mockImplementation(async () => {
    state.epoch += 1;
    state.session.accessToken = null;
    state.session.refreshToken = null;
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('shares one Auth refresh across concurrent requests and services', async () => {
  const refresh = deferred<Tokens>();
  vi.mocked(refreshTokenApi).mockReturnValue(refresh.promise);
  const auth = createServiceRequestClient('/api/auth');
  const clients = [auth, auth, createServiceRequestClient('/api/order')];
  const results = Promise.allSettled(
    clients.map((client, index) =>
      client.get(index === 0 ? '/info' : '/list', {
        adapter: async (config) => {
          if (config.headers.Authorization === 'Bearer old-access') {
            throw Object.assign(new Error('Request rejected by test adapter'), {
              config,
              response: { status: 401, data: {} },
            });
          }
          expect(config.headers.Authorization).toBe('Bearer new-access');
          return {
            config,
            data: { ok: true },
            headers: {},
            status: 200,
            statusText: 'OK',
          };
        },
      }),
    ),
  );
  await vi.waitFor(() => expect(refreshTokenApi).toHaveBeenCalled());
  refresh.resolve(rotated);
  expect(await results).toEqual([
    { status: 'fulfilled', value: { ok: true } },
    { status: 'fulfilled', value: { ok: true } },
    { status: 'fulfilled', value: { ok: true } },
  ]);
  expect(refreshTokenApi).toHaveBeenCalledExactlyOnceWith('old-refresh');
  expect(message.info).not.toHaveBeenCalled();
});

it.each([
  ['page', 'resolve'],
  ['page', 'reject'],
  ['modal', 'resolve'],
  ['modal', 'reject'],
] as const)(
  'keeps the new account when the old refresh %s/%s settles with concurrent waiters',
  async (mode, outcome) => {
    state.preferences.app.loginExpiredMode = mode;
    const refresh = deferred<Tokens>();
    vi.mocked(refreshTokenApi).mockReturnValue(refresh.promise);
    const auth = createServiceRequestClient('/api/auth');
    const order = createServiceRequestClient('/api/order');
    const sent: unknown[] = [];
    const results = Promise.allSettled(
      [auth, auth, order].map((client) =>
        client.get('/list', {
          adapter: async (config) => {
            sent.push(config.headers.Authorization);
            throw Object.assign(new Error('Request rejected by test adapter'), {
              config,
              response: { status: 401, data: {} },
            });
          },
        }),
      ),
    );
    await vi.waitFor(() => {
      expect(sent).toHaveLength(3);
      expect(refreshTokenApi).toHaveBeenCalledExactlyOnceWith('old-refresh');
    });
    switchAccount();
    if (outcome === 'resolve') refresh.resolve(rotated);
    else refresh.reject(new Error('old refresh failed'));
    const outcomes = await results;
    expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
    expect(state.session.accessToken).toBe('account-B-access');
    expect(state.session.refreshToken).toBe('account-B-refresh');
    expect(state.session.setAccessToken).not.toHaveBeenCalled();
    expect(state.session.setLoginExpired).not.toHaveBeenCalled();
    expect(state.logout).not.toHaveBeenCalled();
    expect(state.acceptSession).not.toHaveBeenCalled();
    expect(sent).toEqual(Array.from({ length: 3 }, () => 'Bearer old-access'));
  },
);

it.each([true, false])(
  'ignores a late 401 from a previous account (refresh enabled: %s)',
  async (enabled) => {
    state.preferences.app.enableRefreshToken = enabled;
    const sent = deferred<undefined>();
    const response = deferred<undefined>();
    const client = createServiceRequestClient('/api/auth');
    const results = Promise.allSettled([
      client.get('/info', {
        adapter: async (config) => {
          sent.resolve(undefined);
          await response.promise;
          throw Object.assign(new Error('Request rejected by test adapter'), {
            config,
            response: { status: 401, data: {} },
          });
        },
      }),
    ]);
    await sent.promise;
    switchAccount();
    response.resolve(undefined);
    const outcomes = await results;
    expect(outcomes[0]?.status).toBe('rejected');
    expect(refreshTokenApi).not.toHaveBeenCalled();
    expect(state.logout).not.toHaveBeenCalled();
    expect(state.session.accessToken).toBe('account-B-access');
  },
);

it('lets a new account refresh on the same client while the old refresh is pending', async () => {
  const oldRefresh = deferred<Tokens>();
  const newRefresh = deferred<Tokens>();
  vi.mocked(refreshTokenApi)
    .mockReturnValueOnce(oldRefresh.promise)
    .mockReturnValueOnce(newRefresh.promise);
  const client = createServiceRequestClient('/api/auth');
  const sent: unknown[] = [];
  const request = () =>
    client.get('/info', {
      adapter: async (config) => {
        sent.push(config.headers.Authorization);
        if (config.headers.Authorization !== 'Bearer account-B-rotated') {
          throw Object.assign(new Error('Request rejected by test adapter'), {
            config,
            response: { status: 401, data: {} },
          });
        }
        return {
          config,
          data: { ok: true },
          headers: {},
          status: 200,
          statusText: 'OK',
        };
      },
    });
  const oldResult = Promise.allSettled([request()]);
  await vi.waitFor(() => expect(refreshTokenApi).toHaveBeenCalledTimes(1));
  switchAccount();
  const newResult = Promise.allSettled([request()]);
  try {
    await vi.waitFor(() => expect(refreshTokenApi).toHaveBeenCalledTimes(2));
  } finally {
    newRefresh.resolve({
      ...rotated,
      access_token: 'account-B-rotated',
      refresh_token: 'account-B-rotated-refresh',
    });
    oldRefresh.resolve(rotated);
  }
  expect(await newResult).toEqual([
    { status: 'fulfilled', value: { ok: true } },
  ]);
  const outcomes = await oldResult;
  expect(outcomes[0]?.status).toBe('rejected');
  expect(state.session.accessToken).toBe('account-B-rotated');
  expect(state.logout).not.toHaveBeenCalled();
  expect(state.acceptSession).toHaveBeenCalledTimes(1);
  expect(sent).toEqual([
    'Bearer old-access',
    'Bearer account-B-access',
    'Bearer account-B-rotated',
  ]);
});

it.each(['page', 'modal'])(
  'expires the session without replay when refresh responds 401 in %s mode',
  async (mode) => {
    state.preferences.app.loginExpiredMode = mode;
    const refresh = deferred<Tokens>();
    vi.mocked(refreshTokenApi).mockReturnValue(refresh.promise);
    const client = createServiceRequestClient('/api/auth');
    let sent = 0;
    const results = Promise.allSettled(
      [1, 2].map(() =>
        client.get('/info', {
          adapter: async (config) => {
            sent += 1;
            throw Object.assign(new Error('Request rejected by test adapter'), {
              config,
              response: { status: 401, data: {} },
            });
          },
        }),
      ),
    );
    await vi.waitFor(() => expect(sent).toBe(2));
    refresh.reject({ response: { status: 401 } });
    const outcomes = await results;
    expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
    expect(message.info).toHaveBeenCalledTimes(1);
    expect(message.error).not.toHaveBeenCalled();
    expect(sent).toBe(2);
    expect(state.session.accessToken).toBeNull();
    expect(state.logout).toHaveBeenCalledTimes(mode === 'page' ? 1 : 0);
    expect(
      state.session.setRefreshToken.mock.calls.some(
        ([value]) => value === null,
      ),
    ).toBe(mode !== 'page');
    expect(state.session.setLoginExpired.mock.calls).toEqual(
      mode === 'page' ? [] : [[true]],
    );
    expect(refreshTokenApi).toHaveBeenCalledTimes(1);
  },
);

it.each([undefined, 403, 429, 502])(
  'preserves the session when a protected request returns 401 but refresh fails with %s',
  async (status) => {
    const failure = status ? { response: { status } } : new Error('offline');
    vi.mocked(refreshTokenApi).mockRejectedValueOnce(failure);
    const client = createServiceRequestClient('/api/auth');
    await expect(
      client.get('/info', {
        adapter: async (config) => {
          throw Object.assign(new Error('Request rejected by test adapter'), {
            config,
            response: { status: 401, data: {} },
          });
        },
      }),
    ).rejects.toBe(failure);
    expect(state.session.accessToken).toBe('old-access');
    expect(state.session.refreshToken).toBe('old-refresh');
    expect(state.logout).not.toHaveBeenCalled();
    expect(state.session.setLoginExpired).not.toHaveBeenCalled();
  },
);

it('retries every concurrent request at most once when refreshed credentials still return 401', async () => {
  const refresh = deferred<Tokens>();
  vi.mocked(refreshTokenApi).mockReturnValue(refresh.promise);
  const client = createServiceRequestClient('/api/auth');
  const calls: Record<string, number> = {};
  const results = Promise.allSettled(
    ['/info', '/user'].map((url) =>
      client.get(url, {
        adapter: async (config) => {
          calls[url] = (calls[url] ?? 0) + 1;
          throw Object.assign(new Error('Request rejected by test adapter'), {
            config,
            response: { status: 401, data: {} },
          });
        },
      }),
    ),
  );
  await vi.waitFor(() => expect(calls).toEqual({ '/info': 1, '/user': 1 }));
  refresh.resolve(rotated);
  const outcomes = await results;
  expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
  expect(refreshTokenApi).toHaveBeenCalledTimes(1);
  expect(Object.values(calls).every((count) => count <= 2)).toBe(true);
  expect(state.logout).toHaveBeenCalledTimes(1);
});
