import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import { userCache } from '@vben/utils/cache';

import { QRCode } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import BindTOTP from '../views/_core/authentication/bind-totp.vue';
import {
  enrollmentFromPasswordLogin,
  setTOTPEnrollmentSource,
} from './totp-enrollment-context';
import TOTPEnrollment from './totp-enrollment.vue';
const calls = vi.hoisted(() => ({
  status: vi.fn(),
  begin: vi.fn(),
  confirm: vi.fn(),
  accept: vi.fn(),
  complete: vi.fn(),
  skip: vi.fn(),
  current: true,
}));
vi.mock('#/api/core/auth', () => ({
  getTOTPStatusApi: calls.status,
  beginTOTPEnrollmentApi: calls.begin,
  confirmTOTPEnrollmentApi: calls.confirm,
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({
  useAuthStore: () => auth,
}));
const auth = reactive({
  acceptSession: calls.accept,
  captureSession: () => () => calls.current,
  completeVerificationEnrollment: calls.complete,
  skipOnboarding: calls.skip,
  totpSkipAllowed: false,
});
const tipText = () =>
  document.body.querySelector('.ant-message-error [role="status"]')
    ?.textContent;
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  calls.current = true;
  auth.totpSkipAllowed = false;
  setTOTPEnrollmentSource();
});

describe('authenticator enrollment form', () => {
  it('restores the old enrollment source only in its own account session', () => {
    userCache.bind('previous-account');
    const cache = userCache.current('session');
    const legacy = 'cinch-totp-enrollment-source';
    try {
      cache.setItem(legacy, 'password-login');
      userCache.bind('another-account');
      expect(enrollmentFromPasswordLogin.value).toBe(false);
      userCache.bind('previous-account');
      expect(enrollmentFromPasswordLogin.value).toBe(true);
      expect(cache.getItem('totp-enrollment-source')).toBe('password-login');
      expect(cache.getItem(legacy)).toBeNull();
    } finally {
      cache.clear();
      userCache.bind(undefined);
    }
  });
  it.each([true, false])(
    'uses the current enrollment skip permission (%s)',
    async (allowed) => {
      auth.totpSkipAllowed = !allowed;
      calls.status.mockResolvedValue({
        enrollment_required: true,
        password_required: true,
        totp_skip_allowed: allowed,
      });
      calls.skip.mockResolvedValue(undefined);
      const wrapper = mount(BindTOTP);
      try {
        await flushPromises();
        const skip = wrapper
          .findAll('button')
          .find((button) => button.text() === 'app.onboarding.skip');
        expect(Boolean(skip)).toBe(allowed);
        if (skip) {
          await skip.trigger('click');
          await flushPromises();
        }
        expect(calls.skip.mock.calls).toEqual(allowed ? [['totp']] : []);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it.each(['password-login', 'recovery'] as const)(
    'shows the correct completed login step for %s and retains numbering after binding',
    async (source) => {
      setTOTPEnrollmentSource(source);
      calls.status.mockResolvedValue({ password_required: false });
      calls.begin.mockResolvedValue({
        secret: 'setup-key',
        uri: 'otpauth://totp/test',
        expired_at: Date.now() + 60_000,
      });
      calls.confirm.mockResolvedValue({
        access_token: 'bound',
        refresh_token: 'bound-refresh',
        recovery_codes: ['saved-code'],
      });
      const wrapper = mount(TOTPEnrollment, {
        props: { mandatory: true },
        global: { stubs: { QRCode: true } },
      });
      try {
        await flushPromises();
        const passwordLogin = source === 'password-login';
        expect(wrapper.find('input[name="totp_password"]').exists()).toBe(
          false,
        );
        expect(wrapper.findAll('.totp-step')).toHaveLength(
          passwordLogin ? 3 : 2,
        );
        expect(
          wrapper
            .get('.totp-steps')
            .text()
            .includes('verification.loginPasswordStep'),
        ).toBe(passwordLogin);
        expect(
          required(wrapper.findAll('.totp-step')[0])
            .classes()
            .includes('is-complete'),
        ).toBe(passwordLogin);
        expect(
          wrapper.get('.totp-step[aria-current="step"] .totp-step-icon').text(),
        ).toBe(passwordLogin ? '2' : '1');
        await wrapper.get('input[name="totp_code"]').setValue('123456');
        await wrapper.get('form').trigger('submit');
        await flushPromises();
        expect(
          wrapper.get('.totp-step[aria-current="step"] .totp-step-icon').text(),
        ).toBe(passwordLogin ? '3' : '2');
        setTOTPEnrollmentSource();
        await flushPromises();
        expect(wrapper.findAll('.totp-step')).toHaveLength(
          passwordLogin ? 3 : 2,
        );
      } finally {
        wrapper.unmount();
      }
    },
  );

  it('keeps personal enrollment in the modal and reports its stage and busy state', async () => {
    let resolveSetup!: (value: unknown) => void;
    calls.begin.mockReturnValue(
      new Promise((resolve) => {
        resolveSetup = resolve;
      }),
    );
    const wrapper = mount(TOTPEnrollment, {
      global: { stubs: { QRCode: true } },
    });
    try {
      expect(wrapper.find('.totp-steps').exists()).toBe(false);
      expect(wrapper.emitted('stage')?.at(-1)).toEqual(['password']);
      await wrapper.get('input[name="totp_password"]').setValue('  password  ');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(calls.begin).toHaveBeenCalledWith(
        '  password  ',
        expect.any(Function),
      );
      expect(wrapper.emitted('busy')?.at(-1)).toEqual([true]);
      expect(wrapper.get('.totp-cancel').attributes('disabled')).toBeDefined();
      resolveSetup({
        secret: 'setup-key',
        uri: 'otpauth://totp/test',
        expired_at: Date.now() + 60_000,
      });
      await flushPromises();
      expect(wrapper.emitted('stage')?.at(-1)).toEqual(['scan']);
      expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);
      expect(wrapper.findAll('input[name="totp_code"]')).toHaveLength(1);
      await wrapper.get('.totp-cancel').trigger('click');
      expect(wrapper.emitted('cancel')).toHaveLength(1);
      expect(calls.confirm).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    { mode: 'personal enrollment', mandatory: false, passwordReset: false },
    {
      mode: 'mandatory enrollment or re-enrollment',
      mandatory: true,
      passwordReset: false,
    },
    {
      mode: 'mandatory enrollment before password reset',
      mandatory: true,
      passwordReset: true,
    },
  ])(
    'preserves recovery codes and the same acknowledgment in $mode',
    async ({ mandatory }) => {
      const codes = Array.from(
        { length: 10 },
        (_, index) =>
          `${String(index + 1).padStart(8, '0')}-a1b2c3d4-e5f6a7b8-c9d0e1f2`,
      );
      calls.status.mockResolvedValue({ password_required: false });
      calls.begin.mockResolvedValue({
        secret: 'setup-key',
        uri: 'otpauth://totp/test',
        expired_at: Date.now() + 60_000,
      });
      const result = {
        access_token: 'replacement',
        refresh_token: 'replacement-refresh',
        recovery_codes: codes,
      };
      calls.confirm.mockResolvedValue(result);
      const wrapper = mount(TOTPEnrollment, {
        props: { mandatory },
        global: { stubs: { QRCode: true } },
      });
      try {
        await flushPromises();
        if (!mandatory) {
          await wrapper.get('input[name="totp_password"]').setValue('password');
          await wrapper.get('form').trigger('submit');
          await flushPromises();
        }
        await wrapper.get('input[name="totp_code"]').setValue('123456');
        await wrapper.get('form').trigger('submit');
        await flushPromises();
        expect(calls.accept).toHaveBeenCalledWith(result);
        expect(
          wrapper
            .get('[data-testid="totp-recovery-codes"]')
            .findAll('li')
            .map((item) => item.text()),
        ).toEqual(codes);
        expect(wrapper.get('.totp-copy').text()).toBe(
          'verification.copyRecovery',
        );
        expect(wrapper.emitted('stage')?.at(-1)).toEqual(['recovery']);
        expect(wrapper.findAll('.totp-step')).toHaveLength(mandatory ? 2 : 0);
        const current = wrapper.find(
          '.totp-step[aria-current="step"] .totp-step-icon',
        );
        expect(current.exists() && current.text()).toBe(
          mandatory ? '2' : false,
        );
        expect(wrapper.text()).not.toContain('verification.loginPasswordStep');

        expect(wrapper.emitted('complete')).toBeUndefined();
        expect(wrapper.get('[data-testid="totp-save-recovery"]').text()).toBe(
          'verification.saved',
        );
        await wrapper
          .get('[data-testid="totp-save-recovery"]')
          .trigger('click');
        expect(wrapper.emitted('complete')?.[0]).toEqual([result]);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it('uses the final form slots while the initial status and QR code load', async () => {
    let resolveStatus!: (value: unknown) => void;
    let resolveSetup!: (value: unknown) => void;
    calls.status.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    calls.begin.mockReturnValue(
      new Promise((resolve) => {
        resolveSetup = resolve;
      }),
    );
    const wrapper = mount(TOTPEnrollment, {
      props: { mandatory: true },
      global: { stubs: { QRCode: true } },
    });
    try {
      expect(wrapper.attributes('aria-busy')).toBe('true');
      expect(wrapper.find('.totp-qr-frame').exists()).toBe(true);
      expect(wrapper.find('.totp-field-control').exists()).toBe(true);
      expect(wrapper.find('.totp-primary-shell').exists()).toBe(true);
      expect(wrapper.find('.totp-manual-content').exists()).toBe(false);
      const heading = wrapper.get('.totp-heading').text();
      expect(wrapper.get('.totp-steps').text()).not.toContain(
        'verification.loginPasswordStep',
      );
      resolveStatus({ password_required: false });
      await flushPromises();
      expect(wrapper.attributes('aria-busy')).toBe('true');
      resolveSetup({
        secret: 'first-key',
        uri: 'otpauth://totp/first',
        expired_at: Date.now() + 60_000,
      });
      await flushPromises();
      expect(wrapper.attributes('aria-busy')).toBe('false');
      expect(wrapper.get('.totp-heading').text()).toBe(heading);
      expect(
        wrapper.findAll('.totp-step-label').map((item) => item.text()),
      ).toEqual(['verification.enrollmentStep', 'verification.recoveryStep']);
      expect(
        wrapper.findAll('.totp-step-icon').map((item) => item.text()),
      ).toEqual(['1', '2']);
      expect(wrapper.find('.totp-qr-frame').exists()).toBe(true);
      expect(wrapper.find('.totp-manual-content').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
  it.each([false, true])(
    'preserves manual-key disclosure (%s) through a deferred QR refresh',
    async (expanded) => {
      calls.status.mockResolvedValue({ password_required: false });
      calls.begin.mockResolvedValue({
        secret: 'old-key',
        uri: 'otpauth://totp/old',
        expired_at: Date.now() + 60_000,
      });
      const wrapper = mount(TOTPEnrollment, {
        props: { mandatory: true },
        global: { stubs: { QRCode: true } },
      });
      try {
        await flushPromises();
        if (expanded) await wrapper.get('.totp-manual-toggle').trigger('click');
        let resolveSetup!: (value: unknown) => void;
        calls.begin.mockReturnValue(
          new Promise((resolve) => {
            resolveSetup = resolve;
          }),
        );
        wrapper.findComponent(QRCode).vm.$emit('refresh');
        await flushPromises();
        expect(wrapper.attributes('aria-busy')).toBe('true');
        expect(
          wrapper.get('.totp-manual-toggle').attributes('aria-expanded'),
        ).toBe(String(expanded));
        expect(wrapper.find('.totp-manual-content').exists()).toBe(expanded);
        expect(
          wrapper.get('input[name="totp_code"]').attributes('disabled'),
        ).toBeDefined();
        const copy = wrapper.find('[data-testid="totp-copy-secret"]');
        expect(copy.exists() && copy.attributes('disabled') !== undefined).toBe(
          expanded,
        );
        wrapper.findComponent(QRCode).vm.$emit('refresh');
        await flushPromises();
        expect(calls.begin).toHaveBeenCalledTimes(2);
        resolveSetup({
          secret: 'replacement-key',
          uri: 'otpauth://totp/replacement',
          expired_at: Date.now() + 60_000,
        });
        await flushPromises();
        expect(wrapper.attributes('aria-busy')).toBe('false');
        expect(
          wrapper.get('.totp-manual-toggle').attributes('aria-expanded'),
        ).toBe(String(expanded));
        expect(wrapper.find('.totp-manual-content').exists()).toBe(expanded);
        const secret = wrapper.find('[data-testid="totp-secret"]');
        expect(secret.exists() && secret.text()).toBe(
          expanded ? 'replacement-key' : false,
        );
      } finally {
        wrapper.unmount();
      }
    },
  );
  it('retains an expanded key area through refresh failure and retry', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({
      secret: 'old-key',
      uri: 'otpauth://totp/old',
      expired_at: Date.now() + 60_000,
    });
    const wrapper = mount(TOTPEnrollment, {
      props: { mandatory: true },
      global: { stubs: { QRCode: true } },
    });
    try {
      await flushPromises();
      await wrapper.get('.totp-manual-toggle').trigger('click');
      calls.begin.mockRejectedValueOnce(new Error('offline'));
      wrapper.findComponent(QRCode).vm.$emit('refresh');
      await flushPromises();
      expect(
        wrapper.get('.totp-manual-toggle').attributes('aria-expanded'),
      ).toBe('true');
      expect(wrapper.find('.totp-qr-failure').exists()).toBe(true);
      expect(wrapper.get('.totp-qr-failure').text()).toBe('verification.retry');
      expect(tipText()).toBe('ui.fallback.http.networkError');
      expect(
        wrapper.get('input[name="totp_code"]').attributes('disabled'),
      ).toBeDefined();
      calls.begin.mockResolvedValue({
        secret: 'retry-key',
        uri: 'otpauth://totp/retry',
        expired_at: Date.now() + 60_000,
      });
      await wrapper.get('.totp-qr-failure button').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-testid="totp-secret"]').text()).toBe(
        'retry-key',
      );
      expect(
        wrapper.get('.totp-manual-toggle').attributes('aria-expanded'),
      ).toBe('true');
    } finally {
      wrapper.unmount();
    }
  });
  it('rejects incomplete codes without sending confirmation', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({
      secret: 'setup-secret',
      uri: 'otpauth://totp/test',
      expired_at: Date.now() + 60_000,
    });
    const wrapper = mount(TOTPEnrollment, {
      props: { mandatory: true },
      global: { stubs: { QRCode: true } },
    });
    try {
      await flushPromises();
      const input = wrapper.get('input[name="totp_code"]');
      for (const value of ['', '', '123']) {
        await input.setValue(value);
        await wrapper.get('form').trigger('submit');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(wrapper.get('.verification-code-control').classes()).toContain(
          'is-shaking',
        );
        expect(wrapper.find('.totp-input-error').exists()).toBe(false);
      }
      expect(calls.confirm).not.toHaveBeenCalled();
      await input.setValue('1234');
      expect(input.attributes('aria-invalid')).toBe('false');
    } finally {
      wrapper.unmount();
    }
  });
  it('refreshes an expired direct enrollment without asking for a password', async () => {
    vi.useFakeTimers();
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({
      secret: 'setup-secret',
      uri: 'otpauth://totp/test',
      expired_at: Date.now() + 1000,
    });
    const wrapper = mount(TOTPEnrollment, {
      props: { mandatory: true },
      global: { stubs: { QRCode: true } },
    });
    try {
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1001);
      expect(
        wrapper.get('input[name="totp_code"]').attributes('disabled'),
      ).toBeDefined();
      expect(wrapper.findComponent(QRCode).props('status')).toBe('expired');
      calls.begin.mockResolvedValue({
        secret: 'new-secret',
        uri: 'otpauth://totp/new',
        expired_at: Date.now() + 60_000,
      });
      wrapper.findComponent(QRCode).vm.$emit('refresh');
      await flushPromises();
      expect(calls.begin).toHaveBeenCalledTimes(2);
      expect(wrapper.find('input[name="totp_password"]').exists()).toBe(false);
      expect(
        wrapper.get('input[name="totp_code"]').attributes('disabled'),
      ).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
  it('loads a QR code directly for a server-authorized reset session', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({
      secret: 'reset-secret',
      uri: 'otpauth://totp/test',
      expired_at: Date.now() + 60_000,
    });
    const wrapper = mount(TOTPEnrollment, {
      props: { mandatory: true },
      global: { stubs: { QRCode: true } },
    });
    try {
      expect(wrapper.find('input[name="totp_password"]').exists()).toBe(false);
      await flushPromises();
      expect(calls.begin).toHaveBeenCalledWith(undefined, expect.any(Function));
      expect(wrapper.find('input[name="totp_password"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="totp-secret"]').exists()).toBe(false);
      await wrapper.get('.totp-manual-toggle').trigger('click');
      expect(wrapper.get('[data-testid="totp-secret"]').text()).toBe(
        'reset-secret',
      );
      expect(wrapper.find('input[name="totp_code"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
  it('keeps password verification when the server reports no reset grant', async () => {
    calls.status.mockResolvedValue({ password_required: true });
    const wrapper = mount(TOTPEnrollment, { props: { mandatory: true } });
    try {
      await flushPromises();
      expect(wrapper.find('input[name="totp_password"]').exists()).toBe(true);
      expect(calls.begin).not.toHaveBeenCalled();
      expect(wrapper.findAll('.totp-step')).toHaveLength(3);
      expect(
        wrapper.get('.totp-step[aria-current="step"] .totp-step-label').text(),
      ).toBe('verification.loginPasswordStep');
      expect(
        wrapper.findAll('.totp-step-icon').map((item) => item.text()),
      ).toEqual(['1', '2', '3']);
    } finally {
      wrapper.unmount();
    }
  });
  it('offers retry after automatic setup fails without adding a password step', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({
        secret: 'retry-secret',
        uri: 'otpauth://totp/test',
      });
    const wrapper = mount(TOTPEnrollment, {
      props: { mandatory: true },
      global: { stubs: { QRCode: true } },
    });
    try {
      await flushPromises();
      expect(wrapper.find('input[name="totp_password"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('email-auth.requestFailed');
      expect(tipText()).toBe('email-auth.requestFailed');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      await wrapper.get('.totp-manual-toggle').trigger('click');
      expect(wrapper.get('[data-testid="totp-secret"]').text()).toBe(
        'retry-secret',
      );
    } finally {
      wrapper.unmount();
    }
  });
  it('reports skipped and completed enrollment failures at the top without hiding recovery codes', async () => {
    calls.status.mockResolvedValue({
      password_required: false,
      totp_skip_allowed: true,
    });
    calls.begin.mockResolvedValue({
      secret: 'test-only',
      uri: 'otpauth://totp/test-only',
    });
    calls.confirm.mockResolvedValue({
      access_token: 'bound',
      refresh_token: 'bound-refresh',
      recovery_codes: ['saved-code'],
    });
    calls.skip.mockRejectedValueOnce(new Error('skip unavailable'));
    calls.complete.mockRejectedValueOnce(new Error('continue unavailable'));
    const wrapper = mount(BindTOTP, { global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      await required(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'app.onboarding.skip'),
      ).trigger('click');
      await flushPromises();
      expect(tipText()).toBe('email-auth.requestFailed');
      expect(wrapper.text()).not.toContain('email-auth.requestFailed');

      await wrapper.get('input[name="totp_code"]').setValue('123456');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      await wrapper.get('[data-testid="totp-save-recovery"]').trigger('click');
      await flushPromises();
      expect(tipText()).toBe('email-auth.requestFailed');
      expect(wrapper.text()).not.toContain('email-auth.requestFailed');
      expect(wrapper.get('[data-testid="totp-recovery-codes"]').text()).toBe(
        'saved-code',
      );
    } finally {
      wrapper.unmount();
    }
  });
  it('submits the real Ant form and requires recovery acknowledgment before completion', async () => {
    calls.begin.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/test',
      expired_at: Date.now() + 60_000,
    });
    const result = {
      access_token: 'replacement',
      refresh_token: 'replacement-refresh',
      recovery_codes: ['recovery-one'],
    };
    calls.confirm.mockResolvedValue(result);
    const wrapper = mount(TOTPEnrollment, {
      attachTo: document.body,
      global: { stubs: { QRCode: true } },
    });
    try {
      await wrapper.get('input[name="totp_password"]').setValue('password');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(calls.begin).toHaveBeenCalledWith(
        'password',
        expect.any(Function),
      );
      await wrapper.get('input[name="totp_code"]').setValue('123456');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(calls.confirm).toHaveBeenCalledWith('123456');
      expect(calls.accept).toHaveBeenCalledWith(result);
      expect(wrapper.emitted('complete')).toBeUndefined();
      await wrapper.get('[data-testid="totp-save-recovery"]').trigger('click');
      expect(wrapper.emitted('complete')).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });
  it('does not install a late enrollment response after the session changes', async () => {
    calls.begin.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/test',
      expired_at: Date.now() + 60_000,
    });
    let complete!: (result: unknown) => void;
    calls.confirm.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = mount(TOTPEnrollment, {
      global: { stubs: { QRCode: true } },
    });
    try {
      await wrapper.get('input[name="totp_password"]').setValue('password');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      await wrapper.get('input[name="totp_code"]').setValue('123456');
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      calls.current = false;
      complete({ access_token: 'stale', recovery_codes: [] });
      await flushPromises();
      expect(calls.accept).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });
});
