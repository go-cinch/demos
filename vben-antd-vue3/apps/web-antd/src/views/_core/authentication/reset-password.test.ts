import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import ResetPassword from './reset-password.vue';
const state = vi.hoisted(() => ({
  complete: vi.fn(),
  skip: vi.fn(),
  logout: vi.fn(),
  adminReset: false,
  allowSkip: false,
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    passwordResetByAdmin: state.adminReset,
    passwordResetSkipAllowed: state.allowSkip,
    completePasswordReset: state.complete,
    skipOnboarding: state.skip,
    logout: state.logout,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.adminReset = false;
  state.allowSkip = false;
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
    state.allowSkip = allowed;
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
