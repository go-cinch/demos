import { i18n } from '@vben/locales';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authInlineVerificationRequestClient,
  authPublicRequestClient,
  authRequestClient,
  authSessionRequestClient,
  authVerificationRequestClient,
} from '#/api/request';

import { required } from '../../../../../scripts/test-utils/required';
import appEnglish from '../../locales/langs/en-US/app.json';
import appChinese from '../../locales/langs/zh-CN/app.json';
import {
  beginTOTPEnrollmentApi,
  bindEmailApi,
  changePasswordApi,
  completeTOTPLoginApi,
  confirmTOTPEnrollmentApi,
  createSliderCaptchaChallengeApi,
  getLoginVerificationApi,
  loginApi,
  logoutApi,
  recoverTOTPLoginApi,
  refreshPasswordChangeCaptchaApi,
  refreshTokenApi,
  registerApi,
  requestEmailUnlinkApi,
  resetPasswordApi,
  testTOTPApi,
  verifyEmailUnlinkApi,
  verifyLoginCaptchaApi,
  verifyPasswordChangeCaptchaApi,
  verifySliderCaptchaApi,
} from './auth';

const encryption = vi.hoisted(() => ({
  header: undefined as Record<string, unknown> | undefined,
  plaintext: undefined as Uint8Array | undefined,
}));

vi.mock('jose', () => ({
  CompactEncrypt: class {
    constructor(plaintext: Uint8Array) {
      encryption.plaintext = plaintext;
    }

    encrypt() {
      return Promise.resolve('encrypted-password-change');
    }

    setProtectedHeader(header: Record<string, unknown>) {
      encryption.header = header;
      return this;
    }
  },
  importJWK: vi.fn().mockResolvedValue({}),
}));

vi.mock('#/api/request', () => ({
  authPublicRequestClient: {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
  authRequestClient: {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  },
  authInlineVerificationRequestClient: { post: vi.fn() },
  authSessionRequestClient: {
    post: vi.fn(),
  },
  authVerificationRequestClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('changePasswordApi', () => {
  beforeEach(() => {
    i18n.global.setLocaleMessage('en-US', { app: appEnglish });
    i18n.global.setLocaleMessage('zh-CN', { app: appChinese });
    i18n.global.locale.value = 'en-US';
    vi.clearAllMocks();
    encryption.header = undefined;
    encryption.plaintext = undefined;
  });

  it('trims the username but preserves the password in login credentials', async () => {
    vi.mocked(authPublicRequestClient.post).mockResolvedValue({
      challenge_id: 'challenge-id',
      key_id: 'login-key',
      public_key: { kty: 'RSA' },
    });

    await loginApi({
      password: '  password  ',
      slider_proof: 'slider-proof',
      username: '  readonly  ',
    });

    expect(
      JSON.parse(new TextDecoder().decode(required(encryption.plaintext))),
    ).toEqual(
      expect.objectContaining({
        challenge_id: 'challenge-id',
        password: '  password  ',
        slider_proof: 'slider-proof',
        remember_me: false,
        username: 'readonly',
      }),
    );
    expect(authVerificationRequestClient.post).toHaveBeenLastCalledWith(
      '/pub/login',
      {
        challenge_id: 'challenge-id',
        credential: 'encrypted-password-change',
      },
    );
  });

  it('encrypts the one-time slider proof into registration credentials', async () => {
    vi.mocked(authPublicRequestClient.post).mockResolvedValue({
      challenge_id: 'register-id',
      key_id: 'register-key',
      public_key: { kty: 'RSA' },
    });

    await registerApi({
      password: 'password',
      slider_proof: 'slider-proof',
      username: 'new-user',
    });

    expect(
      JSON.parse(new TextDecoder().decode(required(encryption.plaintext))),
    ).toEqual({
      challenge_id: 'register-id',
      password: 'password',
      slider_proof: 'slider-proof',
      username: 'new-user',
    });
    expect(authPublicRequestClient.post).toHaveBeenLastCalledWith(
      '/pub/register',
      {
        challenge_id: 'register-id',
        credential: 'encrypted-password-change',
      },
      { suppressErrorMessage: true },
    );
  });

  it('encrypts both passwords with an authenticated one-time challenge', async () => {
    vi.mocked(authRequestClient.post).mockResolvedValue({
      challenge_id: 'challenge-id',
      expired_at: Date.now() + 60_000,
      key_id: 'password-key',
      public_key: { kty: 'RSA' },
    });
    vi.mocked(authRequestClient.request).mockResolvedValue(undefined);

    await changePasswordApi({
      captchaId: 'captcha-id',
      captchaPoints: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ],
      newPassword: 'new-password',
      oldPassword: 'current-password',
    });

    expect(authRequestClient.post).toHaveBeenCalledWith('/challenge', {
      purpose: 'password_change',
    });
    expect(encryption.header).toEqual({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      kid: 'password-key',
      typ: 'password+jwe',
    });
    expect(
      JSON.parse(new TextDecoder().decode(required(encryption.plaintext))),
    ).toEqual({
      captcha_id: 'captcha-id',
      captcha_points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ],
      challenge_id: 'challenge-id',
      new_password: 'new-password',
      old_password: 'current-password',
    });
    expect(authRequestClient.request).toHaveBeenCalledWith('/change/pwd', {
      data: {
        challenge_id: 'challenge-id',
        credential: 'encrypted-password-change',
      },
      method: 'PATCH',
      verificationRetryCredential: expect.any(Function),
    });
  });

  it('reissues the encrypted password credential after waiting for sensitive verification', async () => {
    vi.mocked(authRequestClient.post)
      .mockResolvedValueOnce({
        challenge_id: 'initial',
        key_id: 'password-key',
        public_key: { kty: 'RSA' },
      })
      .mockResolvedValueOnce({
        challenge_id: 'fresh',
        key_id: 'password-key',
        public_key: { kty: 'RSA' },
      });
    const data = {
      captchaId: 'captcha-id',
      captchaPoints: [{ x: 10, y: 20 }],
      newPassword: 'new-password',
      oldPassword: 'current-password',
    };
    await changePasswordApi(data);
    const config = required(
      required(vi.mocked(authRequestClient.request).mock.calls[0])[1],
    );
    data.newPassword = 'changed-while-prompt-open';
    const { prepareVerificationRetry } = await import('../verification-retry');
    const retry = await prepareVerificationRetry(config);
    expect(authRequestClient.post).toHaveBeenCalledTimes(2);
    expect(retry.data).toEqual({
      challenge_id: 'fresh',
      credential: 'encrypted-password-change',
    });
    expect(retry._verificationRetried).toBe(true);
    expect(
      JSON.parse(new TextDecoder().decode(required(encryption.plaintext))),
    ).toEqual({
      challenge_id: 'fresh',
      captcha_id: 'captcha-id',
      captcha_points: [{ x: 10, y: 20 }],
      new_password: 'new-password',
      old_password: 'current-password',
    });
  });

  it('localizes missing-password errors before requesting a challenge', async () => {
    await expect(
      changePasswordApi({ newPassword: '', oldPassword: 'current-password' }),
    ).rejects.toThrow('Current and new passwords are required');
    i18n.global.locale.value = 'zh-CN';
    await expect(
      changePasswordApi({ newPassword: '', oldPassword: 'current-password' }),
    ).rejects.toThrow('请输入当前密码和新密码');
    expect(authRequestClient.post).not.toHaveBeenCalled();
  });

  it('refreshes a password-change captcha with the authenticated client', async () => {
    vi.mocked(authRequestClient.post).mockResolvedValue({
      captcha_id: 'refreshed-id',
    });

    await refreshPasswordChangeCaptchaApi('captcha-id');

    expect(authRequestClient.post).toHaveBeenCalledWith('/captcha', {
      captcha_id: 'captcha-id',
    });
  });

  it('verifies password-change captcha points with the authenticated client', async () => {
    vi.mocked(authRequestClient.post).mockResolvedValue({ verified: true });

    await verifyPasswordChangeCaptchaApi('captcha-id', [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);

    expect(authRequestClient.post).toHaveBeenCalledWith('/captcha/verify', {
      captcha_id: 'captcha-id',
      captcha_points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
    });
  });

  it('checks the username with the gateway-notifying verification client', async () => {
    vi.mocked(authVerificationRequestClient.get).mockResolvedValue({
      requirements: { captcha_required: false },
    });
    await getLoginVerificationApi('example');
    expect(authVerificationRequestClient.get).toHaveBeenCalledWith(
      '/pub/status',
      { params: { purpose: 'login', f: 'requirements', username: 'example' } },
    );
  });

  it('verifies login captcha points with the gateway-notifying verification client', async () => {
    vi.mocked(authVerificationRequestClient.post).mockResolvedValue({
      verified: false,
    });

    await verifyLoginCaptchaApi('readonly', 'captcha-id', [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);

    expect(authVerificationRequestClient.post).toHaveBeenCalledWith(
      '/pub/captcha/verify',
      {
        captcha_id: 'captcha-id',
        captcha_points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        username: 'readonly',
      },
    );
  });

  it('creates and verifies a server-backed slider challenge', async () => {
    vi.mocked(authVerificationRequestClient.post).mockResolvedValue({
      proof: 'one-time-proof',
    });

    await createSliderCaptchaChallengeApi('login', 'readonly');
    expect(authVerificationRequestClient.post).toHaveBeenCalledWith(
      '/pub/slider/challenge',
      { purpose: 'login', username: 'readonly' },
    );

    const verification = {
      captcha_id: 'slider-challenge',
      distance: 200,
      duration_ms: 600,
      purpose: 'login' as const,
      tracks: [
        { t: 0, x: 0 },
        { t: 300, x: 100 },
        { t: 600, x: 200 },
      ],
      username: 'readonly',
      width: 200,
    };
    await verifySliderCaptchaApi(verification);
    expect(authVerificationRequestClient.post).toHaveBeenLastCalledWith(
      '/pub/slider/verify',
      verification,
    );
  });
});

describe('refresh token transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the refresh token in JSON when rotating it', async () => {
    vi.mocked(authSessionRequestClient.post).mockResolvedValue({
      access_token: 'new-access-token',
      expired_at: Date.now() + 60_000,
      refresh_token: 'new-refresh-token',
    });

    await refreshTokenApi('old-refresh-token');

    expect(authSessionRequestClient.post).toHaveBeenCalledWith('/pub/refresh', {
      refresh_token: 'old-refresh-token',
    });
  });

  it('sends the refresh token in JSON when logging out', async () => {
    vi.mocked(authSessionRequestClient.post).mockResolvedValue(undefined);

    await logoutApi('refresh-token');

    expect(authSessionRequestClient.post).toHaveBeenCalledWith('/pub/logout', {
      refresh_token: 'refresh-token',
    });
  });
});

describe('resetPasswordApi', () => {
  it('uses its own challenge purpose and encrypted endpoint, and returns replacement tokens', async () => {
    vi.clearAllMocks();
    vi.mocked(authRequestClient.post).mockResolvedValue({
      challenge_id: 'reset-id',
      key_id: 'password-key',
      public_key: { kty: 'RSA' },
    });
    const tokens = {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expired_at: 123,
    };
    vi.mocked(authPublicRequestClient.request).mockResolvedValue(tokens);
    expect(await resetPasswordApi('new-password')).toEqual(tokens);
    expect(authRequestClient.post).toHaveBeenCalledWith('/challenge', {
      purpose: 'password_reset',
    });
    expect(encryption.header?.typ).toBe('password-reset+jwe');
    expect(
      JSON.parse(new TextDecoder().decode(required(encryption.plaintext))),
    ).toEqual({
      challenge_id: 'reset-id',
      new_password: 'new-password',
    });
    expect(authPublicRequestClient.request).toHaveBeenCalledWith('/reset/pwd', {
      method: 'PATCH',
      data: {
        challenge_id: 'reset-id',
        credential: 'encrypted-password-change',
      },
    });
  });
});

describe('email unlink transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryption.plaintext = undefined;
  });

  it('requests delivery using only the browser UUID', async () => {
    await requestEmailUnlinkApi('browser-id');
    expect(
      authInlineVerificationRequestClient.post,
    ).toHaveBeenCalledExactlyOnceWith(
      '/email/unbind/request',
      { browser_uuid: 'browser-id' },
      { suppressErrorMessage: true },
    );
  });

  it('submits the unlink authenticator code directly without requesting a challenge', async () => {
    await verifyEmailUnlinkApi({ verification_code: '123456' }, () => true);
    expect(authRequestClient.post).not.toHaveBeenCalled();
    expect(encryption.plaintext).toBeUndefined();
    expect(
      authInlineVerificationRequestClient.post,
    ).toHaveBeenCalledExactlyOnceWith(
      '/email/unbind',
      {},
      { headers: { 'X-TOTP-Code': '123456' }, suppressErrorMessage: true },
    );
  });

  it('keeps the password inside the one-use unlink credential', async () => {
    vi.mocked(authRequestClient.post).mockResolvedValueOnce({
      challenge_id: 'unlink-id',
      key_id: 'key',
      public_key: {},
    });
    await verifyEmailUnlinkApi({ password: 'fixture' }, () => true);
    expect(authRequestClient.post).toHaveBeenCalledExactlyOnceWith(
      '/challenge',
      { purpose: 'email_unbind' },
      { suppressErrorMessage: true },
    );
    expect(JSON.parse(new TextDecoder().decode(encryption.plaintext))).toEqual({
      challenge_id: 'unlink-id',
      password: 'fixture',
    });
    expect(encryption.header?.typ).toBe('email-unbind+jwe');
    expect(
      authInlineVerificationRequestClient.post,
    ).toHaveBeenCalledExactlyOnceWith(
      '/email/unbind',
      { challenge_id: 'unlink-id', credential: 'encrypted-password-change' },
      { suppressErrorMessage: true },
    );
  });
});

describe('multi-factor authentication transport', () => {
  it('tests a bound factor through the verification client without invoking a business request', async () => {
    const result = { verified: true };
    vi.mocked(authInlineVerificationRequestClient.post).mockResolvedValueOnce(
      result,
    );
    expect(await testTOTPApi('123456')).toBe(result);
    expect(
      authInlineVerificationRequestClient.post,
    ).toHaveBeenCalledExactlyOnceWith(
      '/totp/test',
      { verification_code: '123456' },
      { suppressErrorMessage: true },
    );
    expect(authRequestClient.post).not.toHaveBeenCalled();
    expect(authVerificationRequestClient.post).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('sends enrollment passwords only inside a user-bound JWE challenge', async () => {
    vi.mocked(authRequestClient.post).mockResolvedValue({
      challenge_id: 'totp-challenge',
      key_id: 'key',
      public_key: { kty: 'RSA' },
    });
    await beginTOTPEnrollmentApi('current-password');
    expect(authRequestClient.post).toHaveBeenCalledWith(
      '/challenge',
      { purpose: 'totp_setup' },
      { suppressErrorMessage: true },
    );
    expect(encryption.header?.typ).toBe('totp-setup+jwe');
    expect(
      JSON.parse(new TextDecoder().decode(required(encryption.plaintext))),
    ).toEqual({ challenge_id: 'totp-challenge', password: 'current-password' });
    expect(authRequestClient.post).toHaveBeenCalledWith(
      '/totp/setup',
      {
        challenge_id: 'totp-challenge',
        credential: 'encrypted-password-change',
      },
      {
        suppressErrorMessage: true,
        verificationRetryCredential: expect.any(Function),
      },
    );
  });
  it('continues login on the same endpoint using MFA headers', async () => {
    await completeTOTPLoginApi('ticket', '123456');
    expect(authVerificationRequestClient.post).toHaveBeenCalledWith(
      '/pub/login',
      {},
      {
        headers: { 'X-MFA-Ticket': 'ticket', 'X-TOTP-Code': '123456' },
        suppressErrorMessage: true,
        _verificationRetried: true,
      },
    );
    await confirmTOTPEnrollmentApi('654321');
    expect(authRequestClient.post).toHaveBeenCalledWith(
      '/totp/confirm',
      { verification_code: '654321' },
      { suppressErrorMessage: true },
    );
  });
  it('requests factor recovery with its dedicated header instead of verifying login with the recovery code', async () => {
    const session = {
      access_token: 'enrollment-only',
      refresh_token: 'new-refresh',
      expired_at: 123,
    };
    vi.mocked(authVerificationRequestClient.post).mockResolvedValue(session);
    expect(
      await recoverTOTPLoginApi('password-verified-ticket', 'recovery-code'),
    ).toBe(session);
    expect(authVerificationRequestClient.post).toHaveBeenCalledExactlyOnceWith(
      '/pub/login',
      {},
      {
        headers: {
          'X-MFA-Ticket': 'password-verified-ticket',
          'X-Recovery-Code': 'recovery-code',
        },
        suppressErrorMessage: true,
        _verificationRetried: true,
      },
    );
  });
});

it('starts password-reset enrollment without a password challenge or encrypted credential', async () => {
  await beginTOTPEnrollmentApi();
  expect(authRequestClient.post).toHaveBeenCalledWith(
    '/totp/setup',
    {},
    {
      suppressErrorMessage: true,
      verificationRetryCredential: expect.any(Function),
    },
  );
  expect(authRequestClient.post).not.toHaveBeenCalledWith(
    '/challenge',
    expect.anything(),
  );
});

describe('email credential transport', () => {
  it('encrypts the email code on the existing login endpoint without a password', async () => {
    vi.mocked(authPublicRequestClient.post).mockResolvedValue({
      challenge_id: 'challenge',
      key_id: 'key',
      public_key: { kty: 'RSA' },
    });
    await loginApi({
      method: 'email_code',
      username: 'eric',
      browser_uuid: 'a6eefc2b-1e8d-4446-9f69-3f2bd62d8a75',
      verification_id: 'verification',
      verification_code: '123456',
    });
    const plaintext = JSON.parse(
      new TextDecoder().decode(required(encryption.plaintext)),
    );
    expect(plaintext).toMatchObject({
      method: 'email_code',
      username: 'eric',
      verification_code: '123456',
      verification_id: 'verification',
    });
    expect(plaintext.password).toBeUndefined();
    expect(encryption.header).toMatchObject({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      typ: 'login+jwe',
    });
    const call = required(
      vi.mocked(authVerificationRequestClient.post).mock.calls.at(-1),
    );
    expect(call[0]).toBe('/pub/login');
    expect(call[2]).toEqual({ suppressErrorMessage: true });
    expect(Object.keys(call[1] as object).toSorted()).toEqual([
      'challenge_id',
      'credential',
    ]);
  });
  it('rejects an email login without its server-issued verification context', async () => {
    await expect(
      loginApi({
        method: 'email_code',
        username: 'eric',
        verification_code: '123456',
      }),
    ).rejects.toThrow(TypeError);
  });
});

it('regenerates binding credentials after step-up and refuses a cancelled replay', async () => {
  vi.mocked(authRequestClient.post).mockResolvedValue({
    challenge_id: 'binding-challenge',
    key_id: 'key',
    public_key: { kty: 'RSA' },
  });
  let active = true;
  await bindEmailApi(
    {
      browser_uuid: 'browser',
      email: 'new@example.test',
      verification_id: 'ticket',
      verification_code: '123456',
    },
    () => active,
  );
  const request = required(
    vi
      .mocked(authRequestClient.post)
      .mock.calls.find((call) => call[0] === '/email/bind'),
  );
  const retry = (
    request[2] as { verificationRetryCredential: () => Promise<unknown> }
  ).verificationRetryCredential;
  expect(retry).toBeTypeOf('function');
  await retry();
  expect(authRequestClient.post).toHaveBeenCalledWith(
    '/challenge',
    { purpose: 'email_bind' },
    { suppressErrorMessage: true },
  );
  expect(encryption.header?.typ).toBe('email-bind+jwe');
  active = false;
  await expect(retry()).rejects.toThrow('Verification cancelled');
});
