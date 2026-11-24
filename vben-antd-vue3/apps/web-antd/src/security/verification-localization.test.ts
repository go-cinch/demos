import type { Ref } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import MFALogin from './mfa-login.vue';
import TOTPEnrollment from './totp-enrollment.vue';
import { cancelVerification, requestVerification } from './verification-prompt';

const state = vi.hoisted(() => ({
  locale: null as null | Ref<string>,
  begin: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => `${state.locale?.value}:${key}`,
}));
vi.mock('#/api/core/auth', () => ({
  beginTOTPEnrollmentApi: state.begin,
  confirmTOTPEnrollmentApi: vi.fn(),
  getTOTPStatusApi: vi.fn(),
  completeTOTPLoginApi: state.verify,
  recoverTOTPLoginApi: vi.fn(),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    captureSession: () => () => true,
    acceptSession: vi.fn(),
  }),
}));
beforeEach(() => {
  state.locale = ref('zh-CN');
});
afterEach(() => {
  cancelVerification();
  vi.resetAllMocks();
});

describe('multi-factor authentication field feedback', () => {
  it('keeps code validation visually silent while retranslating accessible feedback', async () => {
    void requestVerification('login', 'test-ticket', Date.now() + 60_000).catch(
      () => undefined,
    );
    const page = mount(MFALogin);
    try {
      await page.get('form').trigger('submit');
      expect(page.get('.sr-only[role="alert"]').text()).toBe(
        'zh-CN:verification.codeRequired',
      );
      expect(page.find('.ant-form-item-explain-error').exists()).toBe(false);
      expect(page.get('.verification-code-control').classes()).toContain(
        'is-shaking',
      );
      await page.get('form').trigger('submit');
      expect(
        page
          .getComponent({ name: 'verification-code-input' })
          .props('animationAttempt'),
      ).toBe(2);
      required(state.locale).value = 'en-US';
      await nextTick();
      expect(page.text()).toContain('en-US:verification.codeRequired');
      expect(page.text()).not.toContain('zh-CN:verification.codeRequired');

      state.verify.mockRejectedValueOnce({
        response: {
          data: {
            error_code: 'AUTH_VERIFICATION_INVALID',
            msg: '旧语言的错误',
          },
        },
      });
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.get('.sr-only[role="alert"]').text()).toBe(
        'en-US:verification.errors.invalidCode',
      );
      expect(page.find('.ant-form-item-explain-error').exists()).toBe(false);
      required(state.locale).value = 'zh-CN';
      await nextTick();
      expect(page.text()).toContain('zh-CN:verification.errors.invalidCode');
      expect(page.text()).not.toContain('旧语言的错误');
    } finally {
      page.unmount();
    }
  });

  it('marks an incorrect enrollment password at the field and clears it on editing', async () => {
    state.begin.mockRejectedValueOnce({
      response: {
        data: {
          error_code: 'AUTH_INCORRECT_PASSWORD',
          msg: 'Incorrect password',
        },
      },
    });
    const form = mount(TOTPEnrollment, { global: { stubs: { QRCode: true } } });
    try {
      await form.get('input[name="totp_password"]').setValue('wrong');
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(
        form.get('input[name="totp_password"]').attributes('aria-invalid'),
      ).toBe('true');
      expect(form.find('.ant-form-item-has-error').exists()).toBe(true);
      expect(form.get('.sr-only[role="alert"]').text()).toBe(
        'zh-CN:verification.errors.password',
      );
      expect(form.find('.ant-form-item-explain-error').exists()).toBe(false);
      expect(form.find('.totp-setup-error').exists()).toBe(false);
      required(state.locale).value = 'en-US';
      await nextTick();
      expect(form.get('.sr-only[role="alert"]').text()).toBe(
        'en-US:verification.errors.password',
      );
      await form.get('input[name="totp_password"]').setValue('corrected');
      expect(form.find('.sr-only[role="alert"]').exists()).toBe(false);
    } finally {
      form.unmount();
    }
  });

  it('keeps service outages separate from password validation and permits retry', async () => {
    state.begin.mockRejectedValueOnce({
      response: {
        status: 503,
        data: { error_code: 'AUTH_VERIFICATION_UNAVAILABLE' },
      },
    });
    const form = mount(TOTPEnrollment, { global: { stubs: { QRCode: true } } });
    try {
      await form.get('input[name="totp_password"]').setValue('password');
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(form.find('.ant-form-item-has-error').exists()).toBe(false);
      const tip = () =>
        document.body.querySelector('.ant-message-error [role="status"]')
          ?.textContent;
      expect(tip()).toBe('zh-CN:app.errors.serverLost');
      required(state.locale).value = 'en-US';
      await nextTick();
      expect(tip()).toBe('en-US:app.errors.serverLost');
      state.begin.mockResolvedValueOnce({
        secret: 'test-only',
        uri: 'otpauth://totp/test-only',
        expired_at: Date.now() + 60_000,
      });
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(form.find('input[name="totp_code"]').exists()).toBe(true);
      expect(form.emitted('stage')?.at(-1)).toEqual(['scan']);
    } finally {
      form.unmount();
    }
  });
});
