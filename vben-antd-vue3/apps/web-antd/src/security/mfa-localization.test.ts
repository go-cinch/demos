import type { Ref } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MFAEnrollment from './mfa-enrollment.vue';
import MFALogin from './mfa-login.vue';
import { cancelMFA, requestMFA } from './mfa-prompt';

const state = vi.hoisted(() => ({
  locale: null as null | Ref<string>,
  begin: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => `${state.locale?.value}:${key}`,
}));
vi.mock('#/api/core/auth', () => ({
  beginMFAEnrollmentApi: state.begin,
  confirmMFAEnrollmentApi: vi.fn(),
  getMFAStatusApi: vi.fn(),
  completeMFALoginApi: state.verify,
  recoverMFALoginApi: vi.fn(),
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
  cancelMFA();
  vi.resetAllMocks();
});

describe('MFA field feedback', () => {
  it('retranslates visible local and server validation when the language changes', async () => {
    void requestMFA('login', 'test-ticket', Date.now() + 60_000).catch(
      () => undefined,
    );
    const page = mount(MFALogin);
    try {
      await page.get('form').trigger('submit');
      expect(page.text()).toContain('zh-CN:mfa.codeRequired');
      state.locale!.value = 'en-US';
      await nextTick();
      expect(page.text()).toContain('en-US:mfa.codeRequired');
      expect(page.text()).not.toContain('zh-CN:mfa.codeRequired');

      state.verify.mockRejectedValueOnce({
        response: {
          data: { error_code: 'AUTH_MFA_INVALID', msg: '旧语言的错误' },
        },
      });
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.text()).toContain('en-US:mfa.errors.invalidCode');
      state.locale!.value = 'zh-CN';
      await nextTick();
      expect(page.text()).toContain('zh-CN:mfa.errors.invalidCode');
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
    const form = mount(MFAEnrollment, { global: { stubs: { QRCode: true } } });
    try {
      await form.get('input[name="mfa_password"]').setValue('wrong');
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(
        form.get('input[name="mfa_password"]').attributes('aria-invalid'),
      ).toBe('true');
      expect(form.find('.ant-form-item-has-error').exists()).toBe(true);
      expect(form.get('.mfa-input-error').text()).toBe(
        'zh-CN:mfa.errors.password',
      );
      expect(form.find('.mfa-setup-error').exists()).toBe(false);
      state.locale!.value = 'en-US';
      await nextTick();
      expect(form.get('.mfa-input-error').text()).toBe(
        'en-US:mfa.errors.password',
      );
      await form.get('input[name="mfa_password"]').setValue('corrected');
      expect(form.find('.mfa-input-error').exists()).toBe(false);
    } finally {
      form.unmount();
    }
  });

  it('keeps service outages separate from password validation and permits retry', async () => {
    state.begin.mockRejectedValueOnce({
      response: { data: { error_code: 'AUTH_MFA_UNAVAILABLE' } },
    });
    const form = mount(MFAEnrollment, { global: { stubs: { QRCode: true } } });
    try {
      await form.get('input[name="mfa_password"]').setValue('password');
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(form.find('.ant-form-item-has-error').exists()).toBe(false);
      expect(form.get('.mfa-setup-error').text()).toContain(
        'zh-CN:mfa.errors.unavailable',
      );
      state.begin.mockResolvedValueOnce({
        secret: 'test-only',
        uri: 'otpauth://totp/test-only',
        expired_at: Date.now() + 60_000,
      });
      await form.get('form').trigger('submit');
      await flushPromises();
      expect(form.find('input[name="mfa_code"]').exists()).toBe(true);
      expect(form.emitted('stage')?.at(-1)).toEqual(['scan']);
    } finally {
      form.unmount();
    }
  });
});
