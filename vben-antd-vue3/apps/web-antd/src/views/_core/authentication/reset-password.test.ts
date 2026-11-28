import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import ResetPassword from './reset-password.vue';
const state = vi.hoisted(() => ({
  complete: vi.fn(),
  skip: vi.fn(),
  logout: vi.fn(),
  adminReset: false,
}));
const allowSkip = ref(false);
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    passwordResetByAdmin: state.adminReset,
    get passwordResetSkipAllowed() {
      return allowSkip.value;
    },
    completePasswordReset: state.complete,
    skipOnboarding: state.skip,
    logout: state.logout,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.adminReset = false;
  allowSkip.value = false;
  state.complete.mockResolvedValue(undefined);
});
describe('password reset input matrix', () => {
  it.each([
    {
      variant: 'empty',
      password: '',
      confirmation: '',
      message: 'app.validation.password',
    },
    {
      variant: 'blank',
      password: '   ',
      confirmation: '   ',
      message: 'app.validation.password',
    },
    {
      variant: 'mismatch',
      password: 'valid-new-password',
      confirmation: 'different',
      message: 'page.profile.password.passwordMismatch',
    },
  ])(
    '$variant blocks saving and can be corrected',
    async ({ password, confirmation, message }) => {
      const page = mount(ResetPassword, {
        global: { stubs: { VbenPasswordStrength: true } },
      });
      try {
        const fields = page.findAll('input[type="password"]');
        await required(fields[0]).setValue(password);
        await required(fields[1]).setValue(confirmation);
        await page.get('form').trigger('submit');
        await flushPromises();
        await vi.waitFor(() => expect(page.text()).toContain(message));
        expect(state.complete).not.toHaveBeenCalled();
        await required(fields[0]).setValue('corrected-new-password');
        await required(fields[1]).setValue('corrected-new-password');
        await page.get('form').trigger('submit');
        await flushPromises();
        await vi.waitFor(() =>
          expect(state.complete).toHaveBeenCalledExactlyOnceWith(
            'corrected-new-password',
          ),
        );
      } finally {
        page.unmount();
      }
    },
  );
});

it.each([false, true])(
  'offers skipping an administrator reset only when Auth allows it (%s)',
  async (allowed) => {
    state.adminReset = true;
    allowSkip.value = allowed;
    const page = mount(ResetPassword, {
      global: { stubs: { VbenPasswordStrength: true } },
    });
    try {
      expect(page.text()).toContain(
        allowed
          ? 'app.resetPassword.adminOptional'
          : 'app.resetPassword.adminRequired',
      );
      const skip = page
        .findAll('button')
        .find((button) => button.text() === 'app.onboarding.skip');
      expect(Boolean(skip)).toBe(allowed);
      await skip?.trigger('click');
      expect(state.skip.mock.calls).toEqual(allowed ? [['password']] : []);
    } finally {
      page.unmount();
    }
  },
);

it.each([false, true])(
  'keeps Skip visible and loading until the action settles (fails: %s)',
  async (fails) => {
    allowSkip.value = true;
    const pending = Promise.withResolvers<void>();
    state.skip.mockReturnValueOnce(pending.promise);
    const page = mount(ResetPassword, {
      global: { stubs: { VbenPasswordStrength: true } },
    });
    try {
      const skip = page.get('button.ant-btn-link');
      const reset = page.get('button[type="submit"]');
      await skip.trigger('click');
      if (!fails) {
        allowSkip.value = false;
        await nextTick();
      }
      expect(page.get('button.ant-btn-link').classes()).toContain(
        'ant-btn-loading',
      );
      expect(skip.attributes('aria-busy')).toBe('true');
      expect(reset.classes()).not.toContain('ant-btn-loading');
      expect(reset.attributes('disabled')).toBeDefined();
      await skip.trigger('click');
      expect(state.skip).toHaveBeenCalledExactlyOnceWith('password');

      if (fails) {
        pending.reject(new Error('Could not skip'));
      } else {
        pending.resolve();
      }
      await flushPromises();
      expect(reset.attributes('disabled')).toBeUndefined();
      expect(page.find('button.ant-btn-link').exists()).toBe(fails);
      if (fails) {
        expect(skip.classes()).not.toContain('ant-btn-loading');
        await skip.trigger('click');
        expect(state.skip).toHaveBeenCalledTimes(2);
      }
    } finally {
      pending.resolve();
      page.unmount();
    }
  },
);
