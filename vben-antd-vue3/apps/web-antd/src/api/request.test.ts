import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelVerification,
  completeVerification,
  requestVerification,
  verificationPrompt,
} from '#/security/verification-prompt';

import { rejectionOf } from '../../../../scripts/test-utils/rejection-of';
import { required } from '../../../../scripts/test-utils/required';
import {
  authInlineVerificationRequestClient,
  authPublicRequestClient,
  authRequestClient,
  authSessionRequestClient,
  authSilentPublicRequestClient,
  authVerificationRequestClient,
  createServiceRequestClient,
  orderRequestClient,
} from './request';

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
    setRefreshToken: vi.fn(),
    setLoginExpired: vi.fn(),
  },
  refresh: vi.fn(),
  sensitive: vi.fn(),
  acceptSession: vi.fn(),
  logout: vi.fn(),
  requirePasswordReset: vi.fn(),
  requireTOTPEnrollment: vi.fn(),
  captureSession: vi.fn((): (() => boolean) => () => true),
  encryptEmail: vi.fn(),
  replay: vi.fn(),
}));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({ preferences: state.preferences }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => state.session }));
vi.mock('#/store', () => ({ useAuthStore: () => state }));
vi.mock('./core', () => ({
  refreshTokenApi: state.refresh,
  getSensitiveStatusApi: state.sensitive,
  encryptSensitiveEmailCode: state.encryptEmail,
}));
vi.mock('./request-error', () => ({
  isServiceUnavailableError: () => false,
  rejectResponseError: (error: unknown) => Promise.reject(error),
  requestErrorMessage: (_error: unknown, message: string) => message,
}));
vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), info: vi.fn() },
}));
vi.mock('@vben/request', () => ({
  RequestClient: class {
    responses: any[] = [];
    constructor(public options: Record<string, unknown>) {}
    addRequestInterceptor(interceptor: (typeof state.requests)[number]) {
      state.requests.push(interceptor);
    }
    addResponseInterceptor(interceptor: any) {
      this.responses.push(interceptor);
    }
    request(url: string, config: unknown) {
      return state.replay(url, config);
    }
  },
  authenticateResponseInterceptor: (options: Authentication) => {
    state.authentication.push(options);
    return {};
  },
  defaultResponseInterceptor: () => ({}),
  errorMessageResponseInterceptor: () => ({}),
}));

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
      const requestConfig = await interceptor.fulfilled({
        headers: { 'x-idempotent': 'once' },
      });
      expect(requestConfig.headers).toEqual({
        'x-idempotent': 'once',
        Authorization: 'Bearer old-access',
        'Accept-Language': 'en-US',
        'X-Auth-Scope': 'admin',
      });
    }
    state.session.accessToken = null;
    state.preferences.app.locale = 'fr-FR';
    const requestConfig2 = await required(state.requests[0]).fulfilled({
      headers: {},
    });
    expect(requestConfig2.headers).toEqual({
      Authorization: null,
      'Accept-Language': 'fr-FR',
      'X-Auth-Scope': 'admin',
    });
    const explicitLocale = await required(state.requests[0]).fulfilled({
      headers: { 'Accept-Language': 'zh-CN' },
    });
    expect(explicitLocale.headers['Accept-Language']).toBe('zh-CN');
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
    required(
      state.authentication.find((item) => item.client === authRequestClient),
    );
  const order = () =>
    required(
      state.authentication.find((item) => item.client === orderRequestClient),
    );

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
    const rejected = rejectionOf(pending);
    state.session.refreshToken = 'other-account';
    finish({ access_token: 'stale', refresh_token: 'stale' });
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(state.acceptSession).not.toHaveBeenCalled();
  });

  it('rejects an old refresh during logout even while its token is still installed', async () => {
    let current = true;
    state.captureSession.mockReturnValue(() => current);
    let finish!: (value: unknown) => void;
    state.refresh.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = auth().doRefreshToken();
    const second = order().doRefreshToken();
    const results = Promise.allSettled([first, second]);
    // logout changes the session epoch before its network request completes.
    current = false;
    expect(state.session.refreshToken).toBe('old-refresh');
    finish({
      access_token: 'stale-access',
      refresh_token: 'rotated-old-refresh',
    });
    for (const result of await results) {
      expect(result).toMatchObject({
        status: 'rejected',
        reason: { message: expect.stringContaining('expired session') },
      });
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

describe('onboarding error-code routing', () => {
  const reject = (client: unknown, error: unknown) =>
    (client as any).responses
      .findLast((item: any) => item.rejected)
      .rejected(error);
  it.each([
    ['AUTH_PASSWORD_RESET_REQUIRED', 'requirePasswordReset'],
    ['AUTH_TOTP_ENROLLMENT_REQUIRED', 'requireTOTPEnrollment'],
  ] as const)('routes %s without response headers', async (code, action) => {
    const error = {
      config: { url: '/info' },
      response: { status: 403, headers: {}, data: { error_code: code } },
    };
    await expect(reject(authRequestClient, error)).rejects.toBe(error);
    expect(state[action]).toHaveBeenCalledOnce();
  });
  it('ignores retired headers without a matching error code', async () => {
    const error = {
      config: { url: '/info' },
      response: {
        status: 403,
        headers: {
          'X-Password-Reset-Required': 'true',
          'X-MFA-Enrollment-Required': 'true',
        },
        data: {},
      },
    };
    await expect(reject(authRequestClient, error)).rejects.toBe(error);
    expect(state.requirePasswordReset).not.toHaveBeenCalled();
    expect(state.requireTOTPEnrollment).not.toHaveBeenCalled();
  });
});

describe('multi-factor authentication header protocol', () => {
  afterEach(cancelVerification);
  const reject = (client: unknown, error: unknown) =>
    (client as any).responses
      .findLast((item: any) => item.rejected)
      .rejected(error);
  const challenge = (extra: Record<string, string> = {}) => ({
    config: {
      url: '/user/7',
      method: 'PATCH',
      data: { name: 'updated' },
      headers: { 'X-Idempotent': 'same-operation' },
    },
    response: {
      status: 403,
      headers: { 'x-verification-required': 'true', ...extra },
      data: { error_code: 'AUTH_STEP_UP_REQUIRED', msg: 'Verify' },
    },
  });

  it.each([400, 429, 403])(
    'returns enrollment verification status %s to its existing form without another prompt or retry',
    async (status) => {
      for (const url of ['/totp/setup', '/totp/confirm']) {
        const error = {
          config: { url, method: 'POST' },
          response: {
            status,
            headers: { 'X-Verification-Required': 'true' },
            data: { msg: 'Enrollment verification failed' },
          },
        };
        await expect(
          reject(authInlineVerificationRequestClient, error),
        ).rejects.toBe(error);
        expect(verificationPrompt.value).toBeUndefined();
        expect(state.replay).not.toHaveBeenCalled();
      }
    },
  );

  it.each([400, 429])(
    'does not start a new business challenge for verification failure status %s',
    async (status) => {
      const error = challenge();
      error.response.status = status;
      await expect(reject(authRequestClient, error)).rejects.toBe(error);
      expect(verificationPrompt.value).toBeUndefined();
      expect(state.replay).not.toHaveBeenCalled();
    },
  );

  it('keeps enrollment routing active on the inline client', async () => {
    const error = challenge();
    error.response.data.error_code = 'AUTH_TOTP_ENROLLMENT_REQUIRED';
    await expect(
      reject(authInlineVerificationRequestClient, error),
    ).rejects.toBe(error);
    expect(state.requireTOTPEnrollment).toHaveBeenCalledOnce();
    expect(verificationPrompt.value).toBeUndefined();
  });

  it('opens inline login verification from headers, without reading JSON MFA flags', async () => {
    const error = challenge({
      'x-mfa-ticket': 'ticket',
      'x-mfa-expires-at': String(Date.now() + 300_000),
    });
    error.config.url = '/pub/login';
    const pending = reject(authPublicRequestClient, error);
    expect(verificationPrompt.value).toMatchObject({
      mode: 'login',
      ticket: 'ticket',
    });
    const result = {
      access_token: 'access',
      refresh_token: 'refresh',
      expired_at: 1,
    };
    completeVerification(required(verificationPrompt.value).id, result);
    await expect(pending).resolves.toBe(result);
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('verifies on the original mutation with the same idempotency key and regenerated credential', async () => {
    const error: any = challenge();
    const fresh = vi
      .fn()
      .mockResolvedValue({ challenge_id: 'fresh', credential: 'encrypted' });
    error.config.verificationRetryCredential = fresh;
    state.replay.mockResolvedValue({ id: 7 });
    const pending = reject(authRequestClient, error);
    const prompt = required(verificationPrompt.value);
    expect(state.replay).not.toHaveBeenCalled();
    await required(prompt.verify)('123456');
    completeVerification(prompt.id);
    await expect(pending).resolves.toEqual({ id: 7 });
    expect(state.encryptEmail).not.toHaveBeenCalled();
    expect(state.replay).toHaveBeenCalledExactlyOnceWith(
      '/user/7',
      expect.objectContaining({
        method: 'PATCH',
        _verificationRetried: true,
        data: {
          name: 'updated',
          challenge_id: 'fresh',
          credential: 'encrypted',
        },
        headers: { 'X-Idempotent': 'same-operation', 'X-TOTP-Code': '123456' },
      }),
    );
  });

  it('sends only the challenge and ciphertext when using email verification', async () => {
    const ticket = { browser_uuid: 'browser', verification_id: 'ticket' };
    state.encryptEmail.mockResolvedValueOnce({
      challenge_id: 'challenge',
      credential: 'jwe',
    });
    state.replay.mockResolvedValueOnce({ id: 7 });
    const pending = reject(authRequestClient, challenge());
    const prompt = required(verificationPrompt.value);
    await required(prompt.verify)('123456', ticket);
    completeVerification(prompt.id);
    await pending;
    expect(state.encryptEmail).toHaveBeenCalledExactlyOnceWith(
      '123456',
      ticket,
    );
    expect(required(state.replay.mock.calls[0])[1].headers).toEqual({
      'X-Idempotent': 'same-operation',
      'X-Step-Up-Challenge': 'challenge',
      'X-Step-Up-Credential': 'jwe',
    });
  });

  it('keeps a wrong code inline and allows another original-request attempt', async () => {
    state.replay
      .mockRejectedValueOnce(challenge())
      .mockResolvedValueOnce({ id: 7 });
    const pending = reject(authRequestClient, challenge());
    const prompt = required(verificationPrompt.value);
    await expect(required(prompt.verify)('wrong')).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(verificationPrompt.value?.id).toBe(prompt.id);
    await required(prompt.verify)('correct');
    completeVerification(prompt.id);
    await expect(pending).resolves.toEqual({ id: 7 });
    expect(state.replay).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'business conflict',
      failure: {
        response: {
          status: 409,
          headers: {},
          data: { error_code: 'USER_EXISTS' },
        },
      },
    },
    {
      name: 'unavailable verification service',
      failure: {
        response: {
          status: 503,
          headers: {},
          data: { error_code: 'AUTH_VERIFICATION_UNAVAILABLE' },
        },
      },
    },
    { name: 'network failure', failure: new Error('Network Error') },
  ])(
    'returns $name to the caller without claiming verification success or replaying again',
    async ({ failure }) => {
      state.replay.mockRejectedValue(failure);
      const pending = reject(authRequestClient, challenge());
      const rejected = rejectionOf(pending);
      const prompt = required(verificationPrompt.value);
      await expect(required(prompt.verify)('123456')).resolves.toBe(false);
      completeVerification(prompt.id);
      expect(await rejected).toBe(failure);
      expect(verificationPrompt.value).toBeUndefined();
      expect(state.replay).toHaveBeenCalledOnce();
    },
  );

  it('does not resend an operation after logout cancels the prompt', async () => {
    const pending = reject(authRequestClient, challenge());
    const rejected = rejectionOf(pending);
    cancelVerification();
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('Verification cancelled'),
    });
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('does not replay shared sensitive operations after a later recovery login completes', async () => {
    const first = reject(authRequestClient, challenge());
    const second = reject(authRequestClient, challenge());
    const failures = Promise.allSettled([first, second]);
    cancelVerification();
    for (const outcome of await failures) {
      expect(outcome).toMatchObject({
        status: 'rejected',
        reason: { message: 'Verification cancelled' },
      });
    }
    const recovery = requestVerification('login', 'new-password-ticket');
    completeVerification(required(verificationPrompt.value).id, {
      access_token: 'enrollment-only',
      refresh_token: 'refresh',
      expired_at: 123,
    });
    await recovery;
    expect(state.replay).not.toHaveBeenCalled();
  });

  it('shares verification for concurrent requests without reusing the code', async () => {
    state.replay.mockResolvedValue({ ok: true });
    const first = reject(authRequestClient, challenge());
    const second = reject(authRequestClient, challenge());
    const prompt = required(verificationPrompt.value);
    await required(prompt.verify)('123456');
    completeVerification(prompt.id);
    await Promise.all([first, second]);
    expect(state.replay).toHaveBeenCalledTimes(2);
    expect(
      state.replay.mock.calls.filter(
        ([, config]) => config.headers['X-TOTP-Code'],
      ),
    ).toHaveLength(1);
  });

  it('cancels a shared retry when the session changes while renewing its credential', async () => {
    let current = true;
    state.captureSession.mockReturnValue(() => current);
    let finishCredential!: (value: {
      challenge_id: string;
      credential: string;
    }) => void;
    const credential = vi.fn(
      () =>
        new Promise<{ challenge_id: string; credential: string }>((resolve) => {
          finishCredential = resolve;
        }),
    );
    const secondChallenge = challenge();
    state.replay.mockResolvedValue({ ok: true });
    const first = reject(authRequestClient, challenge());
    const second = reject(authRequestClient, {
      ...secondChallenge,
      config: {
        ...secondChallenge.config,
        verificationRetryCredential: credential,
      },
    });
    const outcomes = Promise.allSettled([first, second]);
    const prompt = required(verificationPrompt.value);
    await required(prompt.verify)('123456');
    completeVerification(prompt.id);
    await vi.waitFor(() => expect(credential).toHaveBeenCalledOnce());

    current = false;
    state.session.accessToken = 'other-account';
    finishCredential({ challenge_id: 'fresh', credential: 'encrypted' });

    const [firstOutcome, secondOutcome] = await outcomes;
    expect(firstOutcome).toEqual({ status: 'fulfilled', value: { ok: true } });
    expect(secondOutcome).toMatchObject({
      status: 'rejected',
      reason: { message: 'Verification cancelled' },
    });
    expect(state.replay).toHaveBeenCalledOnce();
  });
});

describe('sensitive preflight', () => {
  afterEach(cancelVerification);
  const preflight = () => required(state.requests[0]).fulfilled;
  it('requests verification before sending a protected mutation and passes methods to the dialog', async () => {
    state.sensitive.mockResolvedValue({
      server_time: 100,
      methods: { totp: true, email: false },
      grant: { expired_at: 0 },
    });
    const config = {
      url: '/user/7',
      method: 'PATCH',
      headers: { 'X-Idempotent': 'once' },
      data: { name: 'new' },
    };
    let rejection: unknown;
    try {
      await preflight()(config);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({
      response: { status: 403, data: { error_code: 'AUTH_STEP_UP_REQUIRED' } },
    });
    expect(state.replay).not.toHaveBeenCalled();
    const handler = (authRequestClient as any).responses.findLast(
      (item: any) => item.rejected,
    ).rejected;
    const pending = handler(rejection);
    expect(verificationPrompt.value).toMatchObject({
      mode: 'sensitive',
      methods: { totp: true, address: '' },
    });
    state.replay.mockResolvedValue({ ok: true });
    await required(required(verificationPrompt.value).verify)('123456');
    completeVerification(required(verificationPrompt.value).id);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(state.replay).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      '/totp/setup',
      { totp: false, email: true, address: 'ow***@example.test' },
    ],
    [
      '/totp/confirm',
      { totp: false, email: true, address: 'ow***@example.test' },
    ],
    ['/email/bind', { totp: true, email: false }],
  ])(
    'protects credential binding on %s with the existing method',
    async (url, methods) => {
      state.sensitive.mockResolvedValue({
        server_time: 100,
        methods,
        grant: { expired_at: 0 },
      });
      await expect(
        preflight()({ url, method: 'POST', headers: {} } as any),
      ).rejects.toMatchObject({
        response: {
          status: 403,
          data: { error_code: 'AUTH_STEP_UP_REQUIRED' },
        },
        verificationMethods: {
          totp: methods.totp,
          address: methods.email ? 'ow***@example.test' : '',
        },
      });
      expect(state.replay).not.toHaveBeenCalled();
    },
  );
  it('sends immediately with a valid grant or when verification is unavailable', async () => {
    for (const status of [
      {
        server_time: 100,
        methods: { totp: true, email: false },
        grant: { expired_at: 200 },
      },
      {
        server_time: 100,
        methods: { totp: false, email: false },
        grant: { expired_at: 0 },
      },
    ]) {
      state.sensitive.mockResolvedValue(status);
      await expect(
        preflight()({ url: '/user', method: 'POST', headers: {} } as any),
      ).resolves.toMatchObject({ url: '/user' });
    }
  });
  it('does not preflight reads, inline verification or an already verified retry', async () => {
    await preflight()({ url: '/info', method: 'GET', headers: {} } as any);
    await preflight()({
      url: '/user',
      method: 'POST',
      headers: {},
      _verificationRetried: true,
    } as any);
    await preflight()({
      url: '/user',
      method: 'POST',
      headers: { 'X-TOTP-Code': '123456' },
    } as any);
    expect(state.sensitive).not.toHaveBeenCalled();
  });
  it('blocks a mutation if preflight fails and never treats a bare MFA header as a challenge', async () => {
    state.sensitive.mockRejectedValue(new Error('status unavailable'));
    await expect(
      preflight()({ url: '/user', method: 'POST', headers: {} } as any),
    ).rejects.toThrow('status unavailable');
    const handler = (authRequestClient as any).responses.findLast(
      (item: any) => item.rejected,
    ).rejected;
    const error = {
      config: { url: '/user' },
      response: {
        status: 403,
        headers: { 'X-Verification-Required': 'true' },
        data: { error_code: 'FORBIDDEN' },
      },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(verificationPrompt.value).toBeUndefined();
  });
});
