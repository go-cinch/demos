import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelMFA, completeMFA, mfaPrompt, requestMFA } from '#/security/mfa-prompt';
import { isMFAEnrollmentRequired, isPasswordResetRequired } from './auth-headers';

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
  requireMFAEnrollment: vi.fn(),
  captureSession: vi.fn((): (() => boolean) => () => true),
  replay: vi.fn(),
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
    responses: any[] = [];
    addResponseInterceptor(interceptor: any) { this.responses.push(interceptor); }
    request(url: string, config: unknown) { return state.replay(url, config); }
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
  authMFAVerificationRequestClient,
  createServiceRequestClient,
  orderRequestClient,
} from './request';

beforeEach(() => {
  vi.resetAllMocks();
  state.captureSession.mockReturnValue(() => true);
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

  it('rejects an old refresh during logout even while its token is still installed', async () => {
    let current = true;
    state.captureSession.mockReturnValue(() => current);
    let finish!: (value: unknown) => void;
    state.refresh.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = auth().doRefreshToken();
    const second = order().doRefreshToken();
    const results = Promise.allSettled([first, second]);
    // logout changes the session epoch before its network request completes.
    current = false;
    expect(state.session.refreshToken).toBe('old-refresh');
    finish({ access_token: 'stale-access', refresh_token: 'rotated-old-refresh' });
    for (const result of await results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason.message).toContain('expired session');
    }
    expect(state.refresh).toHaveBeenCalledExactlyOnceWith('old-refresh');
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


describe('password reset header protocol', () => {
  const reject = (client: unknown, error: unknown) => (client as any).responses.filter((item: any) => item.rejected).at(-1).rejected(error);

  it.each([
    ['login', authPublicRequestClient],
    ['refresh', authSessionRequestClient],
    ['recovery login', authVerificationRequestClient],
    ['MFA confirmation', authMFAVerificationRequestClient],
  ])('preserves a header-only restriction on %s without changing the response body', (_name, client) => {
    const data = { access_token: 'restricted-access', refresh_token: 'restricted-refresh', expired_at: 123 };
    (client as any).responses[0].fulfilled({ data, headers: { 'x-password-reset-required': 'true' } });
    expect(isPasswordResetRequired(data)).toBe(true);
    expect(data).toEqual({ access_token: 'restricted-access', refresh_token: 'restricted-refresh', expired_at: 123 });
  });

  it.each([
    { headers: new Headers({ 'X-Password-Reset-Required': 'true' }), data: {} },
    { headers: { 'X-Password-Reset-Required': 'true' }, data: {} },
    { headers: {}, data: { error_code: 'AUTH_PASSWORD_RESET_REQUIRED' } },
  ])('redirects a rejected business request using header or legacy error metadata', async ({ headers, data }) => {
    const error = { config: { url: '/msg/unread-count' }, response: { status: 403, headers, data } };
    await expect(reject(authRequestClient, error)).rejects.toBe(error);
    expect(state.requirePasswordReset).toHaveBeenCalledOnce();
    expect(state.requireMFAEnrollment).not.toHaveBeenCalled();
  });

  it.each([
    { status: 403, headers: {} },
    { status: 403, headers: { 'x-password-reset-required': 'false' } },
    { status: 401, headers: { 'x-password-reset-required': 'true' } },
  ])('does not treat unrelated failures as password reset requests', async (response) => {
    const error = { config: { url: '/msg/unread-count' }, response: { ...response, data: {} } };
    await expect(reject(authRequestClient, error)).rejects.toBe(error);
    expect(state.requirePasswordReset).not.toHaveBeenCalled();
  });

  it('keeps MFA enrollment ahead of password reset when both headers are present', async () => {
    const error = {
      response: {
        status: 403,
        headers: { 'x-mfa-enrollment-required': 'true', 'x-password-reset-required': 'true' },
        data: { error_code: 'AUTH_PASSWORD_RESET_REQUIRED' },
      },
    };
    await expect(reject(authRequestClient, error)).rejects.toBe(error);
    expect(state.requireMFAEnrollment).toHaveBeenCalledOnce();
    expect(state.requirePasswordReset).not.toHaveBeenCalled();
  });
});

describe('MFA header protocol', () => {
  afterEach(cancelMFA);
  const reject = (client: unknown, error: unknown) => (client as any).responses.filter((item: any) => item.rejected).at(-1).rejected(error);
  const challenge = (extra: Record<string, string> = {}) => ({
    config: { url: '/user/7', method: 'PATCH', data: { name: 'updated' }, headers: { 'X-Idempotent': 'same-operation' } },
    response: { status: 403, headers: { 'x-mfa-required': 'true', ...extra }, data: { error_code: 'AUTH_STEP_UP_REQUIRED', msg: 'Verify' } },
  });

  it.each([400, 429, 403])('returns enrollment verification status %s to its existing form without another prompt or retry', async (status) => {
    for (const url of ['/mfa/setup', '/mfa/confirm']) {
      const error = {
        config: { url, method: 'POST' },
        response: { status, headers: { 'X-MFA-Required': 'true' }, data: { msg: 'Enrollment verification failed' } },
      };
      await expect(reject(authMFAVerificationRequestClient, error)).rejects.toBe(error);
      expect(mfaPrompt.value).toBeUndefined();
      expect(state.replay).not.toHaveBeenCalled();
    }
  });

  it.each([400, 429])('does not start a new business challenge for verification failure status %s', async (status) => {
    const error = challenge();
    error.response.status = status;
    await expect(reject(authRequestClient, error)).rejects.toBe(error);
    expect(mfaPrompt.value).toBeUndefined();
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('keeps enrollment routing active on the inline client', async () => {
    const error = challenge({ 'X-MFA-Enrollment-Required': 'true' });
    await expect(reject(authMFAVerificationRequestClient, error)).rejects.toBe(error);
    expect(state.requireMFAEnrollment).toHaveBeenCalledOnce();
    expect(mfaPrompt.value).toBeUndefined();
  });

  it('keeps enrollment metadata outside the successful response body', () => {
    const data = { access_token: 'access', refresh_token: 'refresh' };
    (authPublicRequestClient as any).responses[0].fulfilled({ data, headers: { 'x-mfa-enrollment-required': 'true' } });
    expect(isMFAEnrollmentRequired(data)).toBe(true);
    expect(data).toEqual({ access_token: 'access', refresh_token: 'refresh' });
  });

  it('opens inline login verification from headers, without reading JSON MFA flags', async () => {
    const error = challenge({ 'x-mfa-ticket': 'ticket', 'x-mfa-expires-at': String(Date.now() + 300_000) });
    error.config.url = '/pub/login';
    const pending = reject(authPublicRequestClient, error);
    expect(mfaPrompt.value).toMatchObject({ mode: 'login', ticket: 'ticket' });
    const result = { access_token: 'access', refresh_token: 'refresh', expired_at: 1 };
    completeMFA(mfaPrompt.value!.id, result);
    await expect(pending).resolves.toBe(result);
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('verifies on the original mutation with the same idempotency key and regenerated credential', async () => {
    const error: any = challenge();
    const fresh = vi.fn().mockResolvedValue({ challenge_id: 'fresh', credential: 'encrypted' });
    error.config.mfaRetryCredential = fresh;
    state.replay.mockResolvedValue({ id: 7 });
    const pending = reject(authRequestClient, error);
    const prompt = mfaPrompt.value!;
    expect(state.replay).not.toHaveBeenCalled();
    await prompt.verify!('123456');
    completeMFA(prompt.id);
    await expect(pending).resolves.toEqual({ id: 7 });
    expect(state.replay).toHaveBeenCalledExactlyOnceWith('/user/7', expect.objectContaining({
      method: 'PATCH', _mfaRetried: true,
      data: { name: 'updated', challenge_id: 'fresh', credential: 'encrypted' },
      headers: { 'X-Idempotent': 'same-operation', 'X-MFA-Code': '123456' },
    }));
  });

  it('keeps a wrong code inline and allows another original-request attempt', async () => {
    state.replay.mockRejectedValueOnce(challenge()).mockResolvedValueOnce({ id: 7 });
    const pending = reject(authRequestClient, challenge());
    const prompt = mfaPrompt.value!;
    await expect(prompt.verify!('wrong')).rejects.toMatchObject({ response: { status: 403 } });
    expect(mfaPrompt.value?.id).toBe(prompt.id);
    await prompt.verify!('correct');
    completeMFA(prompt.id);
    await expect(pending).resolves.toEqual({ id: 7 });
    expect(state.replay).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: 'business conflict', failure: { response: { status: 409, headers: {}, data: { error_code: 'USER_EXISTS' } } } },
    { name: 'unavailable verification service', failure: { response: { status: 503, headers: {}, data: { error_code: 'AUTH_MFA_UNAVAILABLE' } } } },
    { name: 'network failure', failure: new Error('Network Error') },
  ])('returns $name to the caller without claiming verification success or replaying again', async ({ failure }) => {
    state.replay.mockRejectedValue(failure);
    const pending = reject(authRequestClient, challenge());
    const rejected = expect(pending).rejects.toBe(failure);
    const prompt = mfaPrompt.value!;
    await expect(prompt.verify!('123456')).resolves.toBe(false);
    completeMFA(prompt.id);
    await rejected;
    expect(mfaPrompt.value).toBeUndefined();
    expect(state.replay).toHaveBeenCalledOnce();
  });

  it('does not resend an operation after logout cancels the prompt', async () => {
    const pending = reject(authRequestClient, challenge());
    const rejected = expect(pending).rejects.toThrow('MFA cancelled');
    cancelMFA();
    await rejected;
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('does not replay shared sensitive operations after a later recovery login completes', async () => {
    const first = reject(authRequestClient, challenge());
    const second = reject(authRequestClient, challenge());
    const failures = Promise.allSettled([first, second]);
    cancelMFA();
    for (const outcome of await failures) {
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') expect(outcome.reason.message).toBe('MFA cancelled');
    }
    const recovery = requestMFA('login', 'new-password-ticket');
    completeMFA(mfaPrompt.value!.id, { access_token: 'enrollment-only', refresh_token: 'refresh', expired_at: 123 });
    await recovery;
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('shares verification for concurrent requests without reusing the code', async () => {
    state.replay.mockResolvedValue({ ok: true });
    const first = reject(authRequestClient, challenge());
    const second = reject(authRequestClient, challenge());
    const prompt = mfaPrompt.value!;
    await prompt.verify!('123456');
    completeMFA(prompt.id);
    await Promise.all([first, second]);
    expect(state.replay).toHaveBeenCalledTimes(2);
    expect(state.replay.mock.calls.filter(([, config]) => config.headers['X-MFA-Code'])).toHaveLength(1);
  });

  it('cancels a shared retry when the session changes while renewing its credential', async () => {
    let current = true;
    state.captureSession.mockReturnValue(() => current);
    let finishCredential!: (value: { challenge_id: string; credential: string }) => void;
    const credential = vi.fn(() => new Promise<{ challenge_id: string; credential: string }>(resolve => {
      finishCredential = resolve;
    }));
    const secondChallenge = challenge();
    state.replay.mockResolvedValue({ ok: true });
    const first = reject(authRequestClient, challenge());
    const second = reject(authRequestClient, {
      ...secondChallenge,
      config: { ...secondChallenge.config, mfaRetryCredential: credential },
    });
    const outcomes = Promise.allSettled([first, second]);
    const prompt = mfaPrompt.value!;
    await prompt.verify!('123456');
    completeMFA(prompt.id);
    await vi.waitFor(() => expect(credential).toHaveBeenCalledOnce());

    current = false;
    state.session.accessToken = 'other-account';
    finishCredential({ challenge_id: 'fresh', credential: 'encrypted' });

    const [firstOutcome, secondOutcome] = await outcomes;
    expect(firstOutcome).toEqual({ status: 'fulfilled', value: { ok: true } });
    expect(secondOutcome).toMatchObject({ status: 'rejected', reason: { message: 'MFA cancelled' } });
    expect(state.replay).toHaveBeenCalledOnce();
  });
});
