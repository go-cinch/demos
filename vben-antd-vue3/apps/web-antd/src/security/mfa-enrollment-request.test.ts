import type { InternalAxiosRequestConfig } from '@vben/request';

import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPasswordResetRequired } from '#/api/auth-headers';
import { confirmMFAEnrollmentApi } from '#/api/core/auth';
import { authMFAVerificationRequestClient, authRequestClient } from '#/api/request';

import MFAEnrollment from './mfa-enrollment.vue';
import { cancelMFA, mfaPrompt } from './mfa-prompt';

const calls = vi.hoisted(() => ({
  accept: vi.fn(), refresh: vi.fn(), logout: vi.fn(),
  requireMFAEnrollment: vi.fn(), requirePasswordReset: vi.fn(),
  session: { accessToken: 'enrollment-access', refreshToken: 'enrollment-refresh' },
}));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({ preferences: { app: { locale: 'zh-CN', enableRefreshToken: true } } }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => calls.session }));
vi.mock('#/store', () => ({ useAuthStore: () => ({
  acceptSession: calls.accept,
  captureSession: () => () => true,
  logout: calls.logout,
  requireMFAEnrollment: calls.requireMFAEnrollment,
  requirePasswordReset: calls.requirePasswordReset,
}) }));
vi.mock('#/api/core', () => ({ refreshTokenApi: calls.refresh }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const originalAuthAdapter = authRequestClient.instance.defaults.adapter;
const originalVerificationAdapter = authMFAVerificationRequestClient.instance.defaults.adapter;
const ok = (config: InternalAxiosRequestConfig, data: unknown, headers: Record<string, string> = {}) => ({
  config, data, headers, status: 200, statusText: 'OK',
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.session.accessToken = 'enrollment-access';
  calls.session.refreshToken = 'enrollment-refresh';
  calls.accept.mockImplementation((result: { access_token: string; refresh_token: string }) => {
    calls.session.accessToken = result.access_token;
    calls.session.refreshToken = result.refresh_token;
  });
});
afterEach(() => {
  cancelMFA();
  authRequestClient.instance.defaults.adapter = originalAuthAdapter;
  authMFAVerificationRequestClient.instance.defaults.adapter = originalVerificationAdapter;
});

describe('enrollment form through the real request interceptors', () => {
  it.each([
    [400, 'AUTH_MFA_INVALID'],
    [429, 'AUTH_MFA_RATE_LIMITED'],
    [403, 'AUTH_STEP_UP_REQUIRED'],
  ])('returns confirmation status %s to the field and allows an explicit retry', async (status, errorCode) => {
    authRequestClient.instance.defaults.adapter = async (config) => {
      expect(config.url).toBe('/mfa');
      return ok(config, { password_required: false, enabled: false });
    };
    let confirmationAttempts = 0;
    const result = { access_token: 'replacement-access', refresh_token: 'replacement-refresh', expired_at: 123, recovery_codes: ['test-recovery-code'] };
    authMFAVerificationRequestClient.instance.defaults.adapter = async (config) => {
      expect(config.headers.Authorization).toBe('Bearer enrollment-access');
      if (config.url === '/mfa/setup') {
        return ok(config, { secret: 'TEST-ONLY-SETUP', uri: 'otpauth://totp/test-only', expired_at: Date.now() + 60_000 });
      }
      expect(config.url).toBe('/mfa/confirm');
      confirmationAttempts += 1;
      if (confirmationAttempts === 1) {
        throw { config, response: { status, headers: { 'X-MFA-Required': 'true' }, data: { error_code: errorCode, msg: 'Enrollment code rejected' } } };
      }
      return ok(config, result, { 'X-Password-Reset-Required': 'true' });
    };
    const form = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      await form.get('input[name="mfa_code"]').setValue('123456');
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(confirmationAttempts).toBe(1);
      expect(mfaPrompt.value).toBeUndefined();
      expect(form.get('.mfa-input-error').text()).toBe(errorCode === 'AUTH_MFA_RATE_LIMITED' ? 'mfa.errors.rateLimited' : 'mfa.errors.invalidCode');
      expect(form.get('input[name="mfa_code"]').attributes('disabled')).toBeUndefined();
      expect(form.get('.mfa-primary').classes()).not.toContain('ant-btn-loading');
      expect(calls.accept).not.toHaveBeenCalled();

      await form.get('input[name="mfa_code"]').setValue('654321');
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(confirmationAttempts).toBe(2);
      expect(mfaPrompt.value).toBeUndefined();
      expect(calls.accept).toHaveBeenCalledExactlyOnceWith(result);
      expect(isPasswordResetRequired(result)).toBe(true);
      expect(form.find('[data-testid="mfa-recovery-codes"]').exists()).toBe(true);
      expect(calls.refresh).not.toHaveBeenCalled();
    } finally { cancelMFA(); form.unmount(); }
  });

  it('keeps session refresh and success metadata on the inline verification client', async () => {
    calls.refresh.mockResolvedValue({ access_token: 'renewed-access', refresh_token: 'renewed-refresh', expired_at: 123 });
    let attempts = 0;
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      attempts += 1;
      if (attempts === 1) {
        expect(config.headers.Authorization).toBe('Bearer enrollment-access');
        throw { config, response: { status: 401, data: {} } };
      }
      expect(config.headers.Authorization).toBe('Bearer renewed-access');
      return ok(config, { access_token: 'confirmed-access', refresh_token: 'confirmed-refresh', recovery_codes: [] }, { 'X-Password-Reset-Required': 'true' });
    });
    authMFAVerificationRequestClient.instance.defaults.adapter = adapter;
    const result = await confirmMFAEnrollmentApi('654321');
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(calls.refresh).toHaveBeenCalledExactlyOnceWith('enrollment-refresh');
    expect(isPasswordResetRequired(result)).toBe(true);
    expect(mfaPrompt.value).toBeUndefined();
  });
});
