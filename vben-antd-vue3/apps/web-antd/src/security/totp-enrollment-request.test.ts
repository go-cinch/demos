import type { InternalAxiosRequestConfig } from '@vben/request';

import { flushPromises, mount } from '@vue/test-utils';

import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmTOTPEnrollmentApi,
  getSensitiveStatusApi,
} from '#/api/core/auth';
import {
  authInlineVerificationRequestClient,
  authRequestClient,
} from '#/api/request';

import TOTPEnrollment from './totp-enrollment.vue';
import { cancelVerification, verificationPrompt } from './verification-prompt';

const calls = vi.hoisted(() => ({
  accept: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  requireTOTPEnrollment: vi.fn(),
  requirePasswordReset: vi.fn(),
  session: {
    accessToken: 'enrollment-access',
    refreshToken: 'enrollment-refresh',
  },
}));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { locale: 'zh-CN', enableRefreshToken: true } },
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => calls.session }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    acceptSession: calls.accept,
    captureSession: () => () => true,
    logout: calls.logout,
    requireTOTPEnrollment: calls.requireTOTPEnrollment,
    requirePasswordReset: calls.requirePasswordReset,
  }),
}));
vi.mock('#/api/core', () => ({
  refreshTokenApi: calls.refresh,
  getSensitiveStatusApi: (quiet: boolean) => getSensitiveStatusApi(quiet),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const originalAuthAdapter = authRequestClient.instance.defaults.adapter;
const originalVerificationAdapter =
  authInlineVerificationRequestClient.instance.defaults.adapter;
const ok = (
  config: InternalAxiosRequestConfig,
  data: unknown,
  headers: Record<string, string> = {},
) => ({
  config,
  data,
  headers,
  status: 200,
  statusText: 'OK',
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.session.accessToken = 'enrollment-access';
  calls.session.refreshToken = 'enrollment-refresh';
  calls.accept.mockImplementation(
    (result: { access_token: string; refresh_token: string }) => {
      calls.session.accessToken = result.access_token;
      calls.session.refreshToken = result.refresh_token;
    },
  );
});
afterEach(() => {
  cancelVerification();
  authRequestClient.instance.defaults.adapter = originalAuthAdapter;
  authInlineVerificationRequestClient.instance.defaults.adapter =
    originalVerificationAdapter;
});

describe('enrollment form through the real request interceptors', () => {
  it.each([
    [400, 'AUTH_VERIFICATION_INVALID'],
    [429, 'AUTH_VERIFICATION_RATE_LIMITED'],
  ])(
    'returns confirmation status %s to the field and allows an explicit retry',
    async (status, errorCode) => {
      const requirementsAdapter = async (
        config: InternalAxiosRequestConfig,
      ) => {
        expect(config.url).toBe('/status');
        expect(config.params).toEqual({
          purpose: 'totp_enrollment',
          f: 'requirements',
        });
        return ok(config, {
          requirements: { password_required: false, enrollment_required: true },
        });
      };
      let confirmationAttempts = 0;
      const result = {
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        expired_at: 123,
        recovery_codes: ['test-recovery-code'],
      };
      authInlineVerificationRequestClient.instance.defaults.adapter = async (
        config,
      ) =>
        ok(config, {
          server_time: Date.now(),
          methods: { totp: false, email: false },
          grant: { expired_at: 0 },
        });
      authRequestClient.instance.defaults.adapter = async (config) => {
        if (config.url === '/status') return requirementsAdapter(config);
        expect(config.headers.Authorization).toBe('Bearer enrollment-access');
        if (config.url === '/totp/setup') {
          return ok(config, {
            secret: 'TEST-ONLY-SETUP',
            uri: 'otpauth://totp/test-only',
            expired_at: Date.now() + 60_000,
          });
        }
        expect(config.url).toBe('/totp/confirm');
        confirmationAttempts += 1;
        if (confirmationAttempts === 1) {
          throw Object.assign(new Error('Request rejected by test adapter'), {
            config,
            response: {
              status,
              headers: { 'X-Verification-Required': 'true' },
              data: { error_code: errorCode, msg: 'Enrollment code rejected' },
            },
          });
        }
        return ok(config, result, {});
      };
      const form = mount(TOTPEnrollment, {
        props: { mandatory: true },
        global: { stubs: { QRCode: true } },
      });
      try {
        await flushPromises();
        await form.get('input[name="totp_code"]').setValue('123456');
        await form.get('form').trigger('submit');
        await flushPromises();
        expect(confirmationAttempts).toBe(1);
        expect(verificationPrompt.value).toBeUndefined();
        expect(form.get('.sr-only[role="alert"]').text()).toBe(
          errorCode === 'AUTH_VERIFICATION_RATE_LIMITED'
            ? 'verification.errors.rateLimited'
            : 'verification.errors.invalidCode',
        );
        expect(
          form.get('input[name="totp_code"]').attributes('aria-invalid'),
        ).toBe('true');
        expect(
          form
            .get('.verification-code-control')
            .classes()
            .includes('is-shaking'),
        ).toBe(errorCode === 'AUTH_VERIFICATION_INVALID');
        expect(
          form.get('input[name="totp_code"]').attributes('disabled'),
        ).toBeUndefined();
        expect(form.get('.totp-primary').classes()).not.toContain(
          'ant-btn-loading',
        );
        expect(calls.accept).not.toHaveBeenCalled();

        await form.get('input[name="totp_code"]').setValue('654321');
        await form.get('form').trigger('submit');
        await flushPromises();
        expect(confirmationAttempts).toBe(2);
        expect(verificationPrompt.value).toBeUndefined();
        expect(calls.accept).toHaveBeenCalledExactlyOnceWith(result);
        expect(result.access_token).toBeTruthy();
        expect(form.find('[data-testid="totp-recovery-codes"]').exists()).toBe(
          true,
        );
        expect(calls.refresh).not.toHaveBeenCalled();
      } finally {
        cancelVerification();
        form.unmount();
      }
    },
  );

  it.each([
    ['timeout', 'ui.fallback.http.requestTimeout'],
    ['gateway', 'app.errors.serverLost'],
  ])(
    'keeps a sensitive status %s on the enrollment code border',
    async (failure, expected) => {
      const notify = vi.spyOn(message, 'error');
      let statusReads = 0;
      authInlineVerificationRequestClient.instance.defaults.adapter = async (
        config,
      ) => {
        expect(config.url).toBe('/status');
        expect(config.params).toEqual({
          purpose: 'sensitive',
          f: 'methods,grant',
        });
        expect(config.timeout).toBe(10_000);
        if (++statusReads === 2) {
          if (failure === 'timeout') {
            throw Object.assign(new Error('timeout of 10000ms exceeded'), {
              config,
              code: 'ECONNABORTED',
            });
          }
          throw Object.assign(new Error('Request rejected by test adapter'), {
            config,
            response: { status: 502 },
          });
        }
        return ok(config, {
          server_time: Date.now(),
          methods: { totp: false, email: false },
          grant: { expired_at: 0 },
        });
      };
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
        config.url === '/status'
          ? ok(config, {
              requirements: {
                password_required: false,
                enrollment_required: true,
              },
            })
          : ok(config, {
              secret: 'TEST-ONLY-SETUP',
              uri: 'otpauth://totp/test-only',
              expired_at: Date.now() + 60_000,
            }),
      );
      authRequestClient.instance.defaults.adapter = adapter;

      const form = mount(TOTPEnrollment, {
        props: { mandatory: true },
        global: { stubs: { QRCode: true } },
      });
      try {
        await flushPromises();
        const code = form.get('input[name="totp_code"]');
        await code.setValue('123456');
        await form.get('form').trigger('submit');
        await flushPromises();
        expect(statusReads).toBe(2);
        expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([
          '/status',
          '/totp/setup',
        ]);
        expect(code.attributes('aria-invalid')).toBe('true');
        expect(code.attributes('disabled')).toBeUndefined();
        expect(form.get('[role="alert"]').classes()).toContain('sr-only');
        expect(form.get('[role="alert"]').text()).toBe(expected);
        expect(notify).not.toHaveBeenCalled();
        await code.setValue('123457');
        expect(code.attributes('aria-invalid')).toBe('false');
        expect(form.find('[role="alert"]').exists()).toBe(false);
      } finally {
        form.unmount();
        notify.mockRestore();
      }
    },
  );

  it('keeps session refresh and success metadata on the protected enrollment client', async () => {
    calls.refresh.mockResolvedValue({
      access_token: 'renewed-access',
      refresh_token: 'renewed-refresh',
      expired_at: 123,
    });
    let attempts = 0;
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      attempts += 1;
      expect(config.headers.Authorization).toBe(
        attempts === 1 ? 'Bearer enrollment-access' : 'Bearer renewed-access',
      );
      if (attempts === 1) {
        throw Object.assign(new Error('Request rejected by test adapter'), {
          config,
          response: { status: 401, data: {} },
        });
      }
      return ok(
        config,
        {
          access_token: 'confirmed-access',
          refresh_token: 'confirmed-refresh',
          recovery_codes: [],
        },
        {},
      );
    });
    authInlineVerificationRequestClient.instance.defaults.adapter = async (
      config,
    ) =>
      ok(config, {
        server_time: Date.now(),
        methods: { totp: false, email: false },
        grant: { expired_at: 0 },
      });
    authRequestClient.instance.defaults.adapter = adapter;
    const result = await confirmTOTPEnrollmentApi('654321');
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(calls.refresh).toHaveBeenCalledExactlyOnceWith('enrollment-refresh');
    expect(result.access_token).toBeTruthy();
    expect(verificationPrompt.value).toBeUndefined();
  });
});
