import { i18n } from '@vben/locales';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authPublicRequestClient,
  authRequestClient,
  authSessionRequestClient,
  authSilentPublicRequestClient,
} from '#/api/request';

import appEnglish from '../../locales/langs/en-US/app.json';
import appChinese from '../../locales/langs/zh-CN/app.json';
import {
  changePasswordApi,
  createSliderCaptchaChallengeApi,
  loginApi,
  logoutApi,
  refreshPasswordChangeCaptchaApi,
  refreshTokenApi,
  registerApi,
  resetPasswordApi,
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
  authSessionRequestClient: {
    post: vi.fn(),
  },
  authSilentPublicRequestClient: {
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

  it('encrypts the one-time slider proof into login credentials', async () => {
    vi.mocked(authPublicRequestClient.post).mockResolvedValue({
      challenge_id: 'challenge-id',
      key_id: 'login-key',
      public_key: { kty: 'RSA' },
    });

    await loginApi({
      password: 'password',
      slider_proof: 'slider-proof',
      username: 'readonly',
    });

    expect(JSON.parse(new TextDecoder().decode(encryption.plaintext!))).toEqual(
      expect.objectContaining({
        challenge_id: 'challenge-id',
        slider_proof: 'slider-proof',
        username: 'readonly',
      }),
    );
    expect(authPublicRequestClient.post).toHaveBeenLastCalledWith(
      '/auth/pub/login',
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

    expect(JSON.parse(new TextDecoder().decode(encryption.plaintext!))).toEqual(
      {
        challenge_id: 'register-id',
        password: 'password',
        slider_proof: 'slider-proof',
        username: 'new-user',
      },
    );
    expect(authPublicRequestClient.post).toHaveBeenLastCalledWith(
      '/auth/pub/register',
      {
        challenge_id: 'register-id',
        credential: 'encrypted-password-change',
      },
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

    expect(authRequestClient.post).toHaveBeenCalledWith('/auth/challenge', {
      purpose: 'password_change',
    });
    expect(encryption.header).toEqual({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      kid: 'password-key',
      typ: 'password+jwe',
    });
    expect(JSON.parse(new TextDecoder().decode(encryption.plaintext!))).toEqual(
      {
        captcha_id: 'captcha-id',
        captcha_points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 },
        ],
        challenge_id: 'challenge-id',
        new_password: 'new-password',
        old_password: 'current-password',
      },
    );
    expect(authRequestClient.request).toHaveBeenCalledWith('/auth/change/pwd', {
      data: {
        challenge_id: 'challenge-id',
        credential: 'encrypted-password-change',
      },
      method: 'PATCH',
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

    expect(authRequestClient.post).toHaveBeenCalledWith('/auth/captcha', {
      captcha_id: 'captcha-id',
    });
  });

  it('verifies password-change captcha points with the authenticated client', async () => {
    vi.mocked(authRequestClient.post).mockResolvedValue({ verified: true });

    await verifyPasswordChangeCaptchaApi('captcha-id', [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);

    expect(authRequestClient.post).toHaveBeenCalledWith(
      '/auth/captcha/verify',
      {
        captcha_id: 'captcha-id',
        captcha_points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
      },
    );
  });

  it('verifies login captcha points with the silent public client', async () => {
    vi.mocked(authSilentPublicRequestClient.post).mockResolvedValue({
      verified: false,
    });

    await verifyLoginCaptchaApi('readonly', 'captcha-id', [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);

    expect(authSilentPublicRequestClient.post).toHaveBeenCalledWith(
      '/auth/pub/captcha/verify',
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
    vi.mocked(authSilentPublicRequestClient.post).mockResolvedValue({
      proof: 'one-time-proof',
    });

    await createSliderCaptchaChallengeApi('login', 'readonly');
    expect(authSilentPublicRequestClient.post).toHaveBeenCalledWith(
      '/auth/pub/slider/challenge',
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
    expect(authSilentPublicRequestClient.post).toHaveBeenLastCalledWith(
      '/auth/pub/slider/verify',
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

    expect(authSessionRequestClient.post).toHaveBeenCalledWith(
      '/auth/pub/refresh',
      { refresh_token: 'old-refresh-token' },
    );
  });

  it('sends the refresh token in JSON when logging out', async () => {
    vi.mocked(authSessionRequestClient.post).mockResolvedValue(undefined);

    await logoutApi('refresh-token');

    expect(authSessionRequestClient.post).toHaveBeenCalledWith(
      '/auth/pub/logout',
      { refresh_token: 'refresh-token' },
    );
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
      password_reset_required: false,
      expired_at: 123,
    };
    vi.mocked(authPublicRequestClient.request).mockResolvedValue(tokens);
    expect(await resetPasswordApi('new-password')).toEqual(tokens);
    expect(authRequestClient.post).toHaveBeenCalledWith('/auth/challenge', {
      purpose: 'password_reset',
    });
    expect(encryption.header?.typ).toBe('password-reset+jwe');
    expect(JSON.parse(new TextDecoder().decode(encryption.plaintext!))).toEqual(
      {
        challenge_id: 'reset-id',
        new_password: 'new-password',
      },
    );
    expect(authPublicRequestClient.request).toHaveBeenCalledWith(
      '/auth/reset/pwd',
      {
        method: 'PATCH',
        data: {
          challenge_id: 'reset-id',
          credential: 'encrypted-password-change',
        },
      },
    );
  });
});
