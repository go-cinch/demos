import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RequestConfig = { headers: Record<string, unknown> };
type Authentication = {
  client: unknown;
  doRefreshToken: () => Promise<string>;
  doReAuthenticate: () => Promise<void>;
};
const state = vi.hoisted(() => ({
  requests: [] as {
    fulfilled: (config: RequestConfig) => Promise<RequestConfig>;
  }[],
  authentication: [] as Authentication[],
  preferences: {
    app: {
      locale: 'en-US',
      enableRefreshToken: true,
      loginExpiredMode: 'modal',
    },
  },
  session: {
    accessToken: 'old-access' as null | string,
    refreshToken: 'old-refresh' as null | string,
    isAccessChecked: true,
    setAccessToken: vi.fn(),
    setLoginExpired: vi.fn(),
  },
  refresh: vi.fn(),
  acceptSession: vi.fn(),
  logout: vi.fn(),
  requirePasswordReset: vi.fn(),
}));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({ preferences: state.preferences }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => state.session }));
vi.mock('#/store', () => ({ useAuthStore: () => state }));
vi.mock('./core', () => ({ refreshTokenApi: state.refresh }));
vi.mock('./request-error', () => ({
  isBadGatewayError: () => false,
  normalizeGatewayError: (error: unknown) => error,
  requestErrorMessage: (_error: unknown, message: string) => message,
}));
vi.mock('ant-design-vue', () => ({ message: { error: vi.fn() } }));
vi.mock('@vben/request', () => ({
  RequestClient: class {
    constructor(public options: Record<string, unknown>) {}
    addRequestInterceptor(interceptor: (typeof state.requests)[number]) {
      state.requests.push(interceptor);
    }
    addResponseInterceptor() {}
  },
  authenticateResponseInterceptor: (options: Authentication) => {
    state.authentication.push(options);
    return {};
  },
  defaultResponseInterceptor: () => ({}),
  errorMessageResponseInterceptor: () => ({}),
}));

import {
  authRequestClient,
  authPublicRequestClient,
  authSessionRequestClient,
  authSilentPublicRequestClient,
  authVerificationRequestClient,
  createServiceRequestClient,
  orderRequestClient,
} from './request';

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(state.session, {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    isAccessChecked: true,
  });
  Object.assign(state.preferences.app, {
    locale: 'en-US',
    loginExpiredMode: 'modal',
  });
});
afterEach(() => vi.restoreAllMocks());

describe('service request configuration', () => {
  it('uses current tokens, locale and admin scope without losing caller headers', async () => {
    expect(state.requests.length).toBeGreaterThanOrEqual(6);
    for (const interceptor of state.requests) {
      expect(
        (await interceptor.fulfilled({ headers: { 'x-idempotent': 'once' } }))
          .headers,
      ).toEqual({
        'x-idempotent': 'once',
        Authorization: 'Bearer old-access',
        'Accept-Language': 'en-US',
        'X-Auth-Scope': 'admin',
      });
    }
    state.session.accessToken = null;
    state.preferences.app.locale = 'fr-FR';
    expect(
      (await state.requests[0]!.fulfilled({ headers: {} })).headers,
    ).toEqual({
      Authorization: null,
      'Accept-Language': 'fr-FR',
      'X-Auth-Scope': 'admin',
    });
  });

  it('keeps service response contracts independent and disables recursive authentication for public clients', () => {
    const custom = createServiceRequestClient('/api/custom', {
      responseReturn: 'data',
    });
    expect(custom).toMatchObject({
      options: { baseURL: '/api/custom', responseReturn: 'data' },
    });
    expect(authRequestClient).toMatchObject({
      options: {
        baseURL: import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth',
        responseReturn: 'body',
      },
    });
    expect(orderRequestClient).toMatchObject({
      options: {
        baseURL: import.meta.env.VITE_GLOB_ORDER_API_URL || '/api/order',
        responseReturn: 'body',
      },
    });
    expect(authSessionRequestClient).toBe(authSilentPublicRequestClient);
    for (const client of [
      authPublicRequestClient,
      authSilentPublicRequestClient,
      authVerificationRequestClient,
    ])
      expect(state.authentication.some((item) => item.client === client)).toBe(
        false,
      );
  });
});

describe('shared session refresh', () => {
  const auth = () =>
    state.authentication.find((item) => item.client === authRequestClient)!;
  const order = () =>
    state.authentication.find((item) => item.client === orderRequestClient)!;

  it('coalesces concurrent services and accepts a rotation within the current session', async () => {
    let finish!: (value: unknown) => void;
    state.refresh.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = auth().doRefreshToken();
    const second = order().doRefreshToken();
    const response = {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    };
    finish(response);
    await expect(Promise.all([first, second])).resolves.toEqual([
      'new-access',
      'new-access',
    ]);
    expect(state.refresh).toHaveBeenCalledExactlyOnceWith('old-refresh');
    expect(state.acceptSession).toHaveBeenCalledExactlyOnceWith(response, true);
  });

  it('rejects a response belonging to an account that signed out or changed', async () => {
    let finish!: (value: unknown) => void;
    state.refresh.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = auth().doRefreshToken();
    const rejected = expect(pending).rejects.toThrow('expired session');
    state.session.refreshToken = 'other-account';
    finish({ access_token: 'stale', refresh_token: 'stale' });
    await rejected;
    expect(state.acceptSession).not.toHaveBeenCalled();
  });

  it('releases failed refreshes and rejects missing credentials before making a request', async () => {
    state.refresh
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ access_token: 'retried' });
    await expect(auth().doRefreshToken()).rejects.toThrow('offline');
    await expect(auth().doRefreshToken()).resolves.toBe('retried');
    state.session.refreshToken = null;
    await expect(auth().doRefreshToken()).rejects.toThrow(
      'refresh token is unavailable',
    );
    expect(state.refresh).toHaveBeenCalledTimes(2);
  });

  it('opens the expired-session modal only after access has been checked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auth().doReAuthenticate();
    expect(state.session.setAccessToken).toHaveBeenCalledWith(null);
    expect(state.session.setLoginExpired).toHaveBeenCalledWith(true);
    expect(state.logout).not.toHaveBeenCalled();
    state.session.isAccessChecked = false;
    await auth().doReAuthenticate();
    expect(state.logout).toHaveBeenCalledOnce();
  });
});
