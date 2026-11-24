import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import MFALogin from './mfa-login.vue';
import AccountRecovery from './totp-account-recovery.vue';
import VerificationDialog from './verification-dialog.vue';
import {
  cancelVerification,
  requestVerification,
  verificationPrompt,
} from './verification-prompt';

const calls = vi.hoisted(() => ({
  loginOptions: vi.fn(async () => ({ address: '' })),
  resetSend: vi.fn(),
  resetConfirm: vi.fn(),
  verify: vi.fn(),
  recover: vi.fn(),
  test: vi.fn(),
  options: vi.fn(async () => ({ totp: true, address: '' })),
  send: vi.fn(),
  restartRecovery: vi.fn(),
}));
vi.mock('#/api/core/auth', () => ({
  getMailboxCooldownApi: async () => ({ server_time: 1000, retry_at: 0 }),
  getLoginRecoveryOptionsApi: calls.loginOptions,
  requestVerificationResetEmailApi: calls.resetSend,
  confirmTOTPResetEmailApi: calls.resetConfirm,
  getSensitiveOptionsApi: calls.options,
  sendSensitiveEmailApi: calls.send,
  completeTOTPLoginApi: calls.verify,
  recoverTOTPLoginApi: calls.recover,
  testTOTPApi: calls.test,
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ openTOTPRecovery: calls.restartRecovery }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('./totp-enrollment.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vben/icons', () => ({
  ArrowLeft: { template: '<svg />' },
  Check: { template: '<svg />' },
  Mail: { template: '<svg />' },
  ShieldCheck: { template: '<svg />' },
  ChevronRight: { template: '<svg />' },
  ChevronDown: { template: '<svg />' },
  IconifyIcon: { template: '<svg />' },
}));
vi.mock('ant-design-vue', async (importOriginal) => {
  const components = await importOriginal<typeof import('ant-design-vue')>();
  const { defineComponent, h } = await import('vue');
  return {
    ...components,
    // Exercise the MFA component with the real form and input components. The
    // modal's portal implementation is outside this interaction test's scope.
    Modal: defineComponent({
      name: 'VerificationTestModal',
      props: { open: Boolean, closable: Boolean, keyboard: Boolean },
      setup(props, { slots }) {
        return () => (props.open ? h('div', slots.default?.()) : null);
      },
    }),
  };
});

afterEach(() => {
  cancelVerification();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function start() {
  const pending = requestVerification(
    'login',
    'one-time-ticket',
    Date.now() + 300_000,
  );
  void pending.catch(() => undefined);
  return pending;
}

describe('inline login MFA', () => {
  it('requires a password before sending and explicit confirmation before replacing the authenticator', async () => {
    const pending = start();
    calls.loginOptions.mockResolvedValueOnce({ address: 'ow***@example.test' });
    const page = mount(MFALogin, { props: { identifier: 'tester' } });
    try {
      expect(page.findAll('.mfa-login-actions button')).toHaveLength(1);
      await page.get('.mfa-login-actions button').trigger('click');
      const modal = page.getComponent(AccountRecovery);
      await flushPromises();
      await modal.get('.methods button:last-child').trigger('click');
      await flushPromises();
      expect(calls.resetSend).not.toHaveBeenCalled();
      calls.resetSend.mockResolvedValueOnce({
        verification_id: 'reset-id',
        server_time: 1000,
        expired_at: 61_000,
        retry_at: 61_000,
      });
      await modal.get('input').setValue('current-password');
      await modal.get('form').trigger('submit');
      await flushPromises();
      expect(calls.resetSend).toHaveBeenCalledWith(
        'one-time-ticket',
        'tester',
        'current-password',
        expect.any(String),
      );
      await modal.get('input').setValue('123456');
      expect(calls.resetConfirm).not.toHaveBeenCalled();
      const result = { access_token: 'restricted' };
      calls.resetConfirm.mockResolvedValueOnce(result);
      await modal.get('form').trigger('submit');
      await flushPromises();
      expect(calls.resetConfirm).toHaveBeenCalledWith(
        'one-time-ticket',
        'tester',
        expect.any(String),
        'reset-id',
        '123456',
      );
      expect(await pending).toEqual(result);
    } finally {
      page.unmount();
    }
  });

  it('uses the shared single code input and clears a failed verification when the code changes', async () => {
    start();
    const page = mount(MFALogin);
    try {
      expect(page.findAll('.verification-code-control')).toHaveLength(1);
      expect(page.findAll('input')).toHaveLength(1);
      calls.verify.mockRejectedValueOnce({
        response: { data: { msg: 'Code already used' } },
      });
      await page.get('input').setValue('1a2-3 4567');
      expect(page.get('input').element.value).toBe('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(
        page.get('.verification-code-control').attributes('data-feedback'),
      ).toBe('failure');
      expect(page.text()).toContain('Code already used');
      await page.get('input').setValue('654321');
      await flushPromises();
      expect(
        page.get('.verification-code-control').attributes('data-feedback'),
      ).toBe('idle');
      expect(page.text()).not.toContain('Code already used');
    } finally {
      page.unmount();
    }
  });

  it('renders on the page without opening the global MFA modal and completes the original login', async () => {
    const pending = start();
    const result = {
      access_token: 'test-access',
      refresh_token: 'test-refresh',
    };
    calls.verify.mockResolvedValue(result);
    const page = mount(MFALogin);
    const dialog = mount(VerificationDialog);
    try {
      expect(dialog.text()).toBe('');
      expect(page.find('[role="dialog"]').exists()).toBe(false);
      expect(page.find('[data-testid="mfa-login-step"]').exists()).toBe(true);
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(calls.verify).toHaveBeenCalledWith('one-time-ticket', '123456');
      await expect(pending).resolves.toEqual(result);
      expect(page.emitted('verified')).toHaveLength(1);
      await page.setProps({ completing: true });
      expect(
        page.get('.verification-code-control').attributes('data-feedback'),
      ).toBe('success');
      expect(page.get('input').element.value).toBe('123456');
      expect(page.get('input').attributes('disabled')).toBeDefined();
    } finally {
      page.unmount();
      dialog.unmount();
    }
  });

  it('uses recovery codes only to reset the authenticator and returns the restricted session', async () => {
    const pending = start();
    const page = mount(MFALogin);
    try {
      calls.verify.mockRejectedValue({
        response: { data: { msg: 'Incorrect factor' } },
      });
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.text()).toContain('Incorrect factor');
      expect(verificationPrompt.value?.mode).toBe('login');
      expect(page.findAll('.mfa-login-actions button')).toHaveLength(1);
      await page.get('.mfa-login-actions button').trigger('click');
      const modal = page.getComponent(AccountRecovery);
      await modal.get('.methods button:first-of-type').trigger('click');
      expect(modal.text()).not.toContain('email-auth.resetWarning');
      await modal.get('input').setValue('test-recovery-code');
      calls.recover.mockRejectedValueOnce({
        response: { data: { msg: 'Recovery code is invalid' } },
      });
      await modal.get('form').trigger('submit');
      await flushPromises();
      expect(page.text()).toContain('Recovery code is invalid');
      expect(verificationPrompt.value?.mode).toBe('login');
      const restricted = {
        access_token: 'recovery-session',
        refresh_token: 'restricted-refresh',
        expired_at: 123,
      };
      calls.recover.mockResolvedValue(restricted);
      await modal.get('form').trigger('submit');
      await flushPromises();
      expect(calls.recover).toHaveBeenLastCalledWith(
        'one-time-ticket',
        'test-recovery-code',
      );
      expect(calls.verify).toHaveBeenCalledExactlyOnceWith(
        'one-time-ticket',
        '123456',
      );
      const response = await pending;
      expect(response?.access_token).toBe(restricted.access_token);
    } finally {
      page.unmount();
    }
  });

  it('expires the ticket and allows returning to login without sending a verification request', async () => {
    vi.useFakeTimers();
    const pending = start();
    const page = mount(MFALogin);
    try {
      await vi.advanceTimersByTimeAsync(300_001);
      expect(page.text()).toContain('verification.loginExpired');
      expect(page.get('input').attributes('disabled')).toBeDefined();
      await page.get('form').trigger('submit');
      expect(calls.verify).not.toHaveBeenCalled();
      await page.get('.mfa-top-back').trigger('click');
      await expect(pending).rejects.toThrow('Verification cancelled');
      expect(verificationPrompt.value).toBeUndefined();
    } finally {
      page.unmount();
    }
  });

  it('does not complete a different login when an old response arrives after cancellation', async () => {
    const old = start();
    let respond!: (value: unknown) => void;
    calls.verify.mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      }),
    );
    const page = mount(MFALogin);
    try {
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      cancelVerification();
      await expect(old).rejects.toThrow('Verification cancelled');
      const current = requestVerification(
        'login',
        'different-ticket',
        Date.now() + 300_000,
      );
      void current.catch(() => undefined);
      respond({ access_token: 'stale-access' });
      await flushPromises();
      expect(verificationPrompt.value?.ticket).toBe('different-ticket');
      expect(page.emitted('verified')).toBeUndefined();
    } finally {
      page.unmount();
    }
  });
  it('shows compact invalid-code feedback while retaining an accessible error', async () => {
    start();
    const page = mount(MFALogin, {
      props: { identifier: 'tester@example.com' },
    });
    try {
      calls.verify.mockRejectedValueOnce({
        response: { data: { error_code: 'AUTH_VERIFICATION_INVALID' } },
      });
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.get('input').attributes('aria-invalid')).toBe('true');
      expect(page.get('.verification-code-control').classes()).toContain(
        'is-shaking',
      );
      expect(page.find('.ant-form-item-explain-error').exists()).toBe(false);
      expect(page.get('[role="alert"]').classes()).toContain('sr-only');
      expect(page.get('.mfa-account-identity').text()).toContain(
        'tester@example.com',
      );
    } finally {
      page.unmount();
    }
  });

  it('requires a current password before recovering an email-code login', async () => {
    const pending = start();
    const page = mount(MFALogin, {
      props: { identifier: 'tester@example.com', emailLogin: true },
    });
    try {
      expect(page.findAll('.mfa-login-actions button')).toHaveLength(1);
      await page.get('.mfa-login-actions button').trigger('click');
      const modal = page.getComponent(AccountRecovery);
      await modal.get('.methods button:first-of-type').trigger('click');
      await modal.get('input[type="password"]').setValue('current-password');
      await modal.get('input.recovery-input').setValue('long-recovery-code');
      calls.recover.mockResolvedValue({
        access_token: 'restricted',
        refresh_token: 'refresh',
        expired_at: 123,
      });
      await modal.get('form').trigger('submit');
      await flushPromises();
      expect(calls.recover).toHaveBeenCalledWith(
        'one-time-ticket',
        'long-recovery-code',
        'tester@example.com',
        'current-password',
      );
      await pending;
    } finally {
      page.unmount();
    }
  });

  it('does not submit twice when manual confirmation precedes the automatic timer', async () => {
    vi.useFakeTimers();
    start();
    const page = mount(MFALogin);
    try {
      calls.verify.mockRejectedValue({
        response: { data: { error_code: 'AUTH_VERIFICATION_INVALID' } },
      });
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(250);
      expect(calls.verify).toHaveBeenCalledTimes(1);
      expect(page.get('input').attributes('aria-invalid')).toBe('true');
    } finally {
      page.unmount();
    }
  });
});

describe('sensitive verification dialog', () => {
  beforeEach(() => vi.useFakeTimers());

  const mountDialog = async () => {
    const dialog = mount(VerificationDialog);
    await flushPromises();
    return dialog;
  };

  const replaceNativeRange = (
    input: HTMLInputElement,
    replacement: string,
    start: number,
    end: number,
  ) => {
    input.setRangeText(replacement, start, end, 'end');
    // happy-dom 20 places an "end" caret using the entire new value length.
    // Model the browser's default edit position before delivering input.
    const caret = start + replacement.length;
    input.setSelectionRange(caret, caret);
  };

  const typeCharacter = async (input: HTMLInputElement, character: string) => {
    const before = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: character,
      inputType: 'insertText',
    });
    if (input.dispatchEvent(before)) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const available = input.maxLength - (input.value.length - (end - start));
      replaceNativeRange(
        input,
        character.slice(0, Math.max(0, available)),
        start,
        end,
      );
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: character,
          inputType: 'insertText',
        }),
      );
    }
    await flushPromises();
    input.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, key: character }),
    );
    await flushPromises();
  };

  const moveCaret = async (
    input: HTMLInputElement,
    position: number,
    key: string,
  ) => {
    input.setSelectionRange(position, position);
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
    await flushPromises();
  };

  const pasteText = async (input: HTMLInputElement, text: string) => {
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => text },
    });
    if (input.dispatchEvent(paste)) {
      const before = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: text,
        inputType: 'insertFromPaste',
      });
      if (input.dispatchEvent(before)) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const available =
          input.maxLength - (input.value.length - (end - start));
        replaceNativeRange(
          input,
          text.slice(0, Math.max(0, available)),
          start,
          end,
        );
        input.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            data: text,
            inputType: 'insertFromPaste',
          }),
        );
      }
    }
    await flushPromises();
  };

  it('rejects repeated non-digits without moving the caret, including input events without beforeinput', async () => {
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      vi.fn(),
    );
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    const input = dialog.get('input').element;
    try {
      for (const character of ['a', 'b', '中', '!']) {
        await typeCharacter(input, character);
        expect(input.value).toBe('');
        expect(input.selectionStart).toBe(0);
      }
      await typeCharacter(input, '1');
      expect(input.value).toBe('1');
      await typeCharacter(input, 'z');
      expect(input.value).toBe('1');
      expect(input.selectionStart).toBe(1);
      await typeCharacter(input, '2');
      expect(input.value).toBe('12');

      // Autofill/composition can deliver input without a cancellable
      // beforeinput event. The native value and caret still need correction.
      input.value = '12x';
      input.setSelectionRange(3, 3);
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'x',
          inputType: 'insertText',
        }),
      );
      await flushPromises();
      input.dispatchEvent(
        new KeyboardEvent('keyup', { bubbles: true, key: 'x' }),
      );
      await flushPromises();
      expect(input.value).toBe('12');
      expect(input.selectionStart).toBe(2);
    } finally {
      dialog.unmount();
    }
  });

  it('preserves a middle caret for rejected characters and keeps arrow keys and backspace usable', async () => {
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      vi.fn(),
    );
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    const input = dialog.get('input').element;
    try {
      for (const digit of '1234') await typeCharacter(input, digit);
      await moveCaret(input, 2, 'ArrowLeft');
      for (const character of ['a', 'b']) {
        await typeCharacter(input, character);
        expect(input.value).toBe('1234');
        expect(input.selectionStart).toBe(2);
      }
      await typeCharacter(input, '9');
      expect(input.value).toBe('12934');
      expect(input.selectionStart).toBe(3);

      await moveCaret(input, 4, 'ArrowRight');
      await moveCaret(input, 3, 'ArrowLeft');
      const before = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward',
      });
      expect(input.dispatchEvent(before)).toBe(true);
      replaceNativeRange(input, '', 2, 3);
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContentBackward',
        }),
      );
      await flushPromises();
      input.dispatchEvent(
        new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace' }),
      );
      await flushPromises();
      expect(input.value).toBe('1234');
      expect(input.selectionStart).toBe(2);
    } finally {
      dialog.unmount();
    }
  });

  it('pastes only digits up to six and replaces the current selection without losing surrounding digits', async () => {
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      vi.fn(),
    );
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    const input = dialog.get('input').element;
    try {
      await pasteText(input, 'x1 2a3-4b5 67');
      expect(input.value).toBe('123456');
      expect(input.selectionStart).toBe(6);

      input.setSelectionRange(1, 4);
      await pasteText(input, 'a9b8');
      expect(input.value).toBe('19856');
      expect(input.selectionStart).toBe(3);
      expect(dialog.findAll('input')).toHaveLength(1);
    } finally {
      dialog.unmount();
    }
  });

  it('filters the single input and marks incomplete codes with a red border and animation', async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      expect(dialog.get('input').attributes()).toMatchObject({
        inputmode: 'numeric',
        maxlength: '6',
        'aria-label': 'verification.code',
      });
      expect(dialog.findAll('.verification-code-control')).toHaveLength(1);
      expect(dialog.find('.sensitive-cell').exists()).toBe(false);
      await dialog.get('input').setValue('recovery-code');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.get('input').element.value).toBe('');
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'failure',
      );
      expect(dialog.get('.sensitive-code').classes()).toContain('is-shaking');
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('.sr-only[role="alert"]').text()).toBe(
        'verification.codeRequired',
      );
      expect(verify).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(999);
      expect(dialog.get('.sensitive-code').classes()).toContain('is-shaking');
      await vi.advanceTimersByTimeAsync(51);
      expect(dialog.get('.sensitive-code').classes()).not.toContain(
        'is-shaking',
      );
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'failure',
      );

      await dialog.get('input').setValue('12a34b5678');
      expect(dialog.get('input').element.value).toBe('123456');
      expect(dialog.findAll('input')).toHaveLength(1);
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'idle',
      );
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(verify).toHaveBeenCalledExactlyOnceWith('123456', undefined);
      await vi.advanceTimersByTimeAsync(720);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      dialog.unmount();
    }
  });

  it('keeps failures in the current dialog and clears red feedback when editing before an explicit retry', async () => {
    const verify = vi
      .fn()
      .mockRejectedValueOnce({
        response: {
          data: {
            error_code: 'AUTH_VERIFICATION_INVALID',
            msg: 'Code was already used',
          },
        },
      })
      .mockResolvedValueOnce(undefined);
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void pending.catch(() => undefined);
    const promptId = required(verificationPrompt.value).id;
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(verificationPrompt.value?.id).toBe(promptId);
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'failure',
      );
      expect(dialog.get('.sensitive-code').classes()).toContain('is-shaking');
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('.sr-only[role="alert"]').text()).toBe(
        'verification.errors.invalidCode',
      );
      expect(dialog.get('input').attributes('disabled')).toBeUndefined();

      await dialog.get('input').setValue('654321');
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'idle',
      );
      expect(dialog.get('.sensitive-code').classes()).not.toContain(
        'is-shaking',
      );
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(verify).toHaveBeenCalledTimes(2);
      expect(verify).toHaveBeenLastCalledWith('654321', undefined);
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'success',
      );
      await vi.advanceTimersByTimeAsync(720);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      dialog.unmount();
    }
  });

  it('blocks repeated submission and cancellation until the successful feedback finishes', async () => {
    let respond!: () => void;
    const verify = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          respond = resolve;
        }),
    );
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void pending.catch(() => undefined);
    const promptId = required(verificationPrompt.value).id;
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await dialog.get('form').trigger('submit');
      expect(verify).toHaveBeenCalledExactlyOnceWith('123456', undefined);
      expect(dialog.get('input').attributes('disabled')).toBeDefined();
      expect(
        dialog.get('[data-testid="sensitive-submit"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        dialog.get('[data-testid="sensitive-cancel"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        dialog.findComponent({ name: 'VerificationTestModal' }).props(),
      ).toMatchObject({ closable: false, keyboard: false });

      respond();
      await flushPromises();
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'success',
      );
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('.sr-only[role="status"]').text()).toBe(
        'verification.verified',
      );
      expect(dialog.get('input').attributes('disabled')).toBeDefined();
      await dialog.get('form').trigger('submit');
      expect(verify).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(719);
      expect(verificationPrompt.value?.id).toBe(promptId);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
      expect(verificationPrompt.value).toBeUndefined();
    } finally {
      dialog.unmount();
    }
  });

  it('closes immediately without green feedback when the verifier returns a non-verification failure to its caller', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void pending.catch(() => undefined);
    const completed = vi.fn();
    void pending.then(completed, () => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(verify).toHaveBeenCalledExactlyOnceWith('123456', undefined);
      // No fake time advances: business/network failures do not wait for the
      // success animation or claim that verification succeeded.
      expect(completed).toHaveBeenCalledOnce();
      expect(verificationPrompt.value).toBeUndefined();
      expect(dialog.find('[data-feedback="success"]').exists()).toBe(false);
      expect(dialog.find('.is-pulsing').exists()).toBe(false);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      dialog.unmount();
    }
  });

  it('does not let an old success timer complete a newer prompt', async () => {
    const first = requestVerification(
      'sensitive',
      undefined,
      undefined,
      vi.fn().mockResolvedValue(undefined),
    );
    void first.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'success',
      );
      cancelVerification();
      await expect(first).rejects.toThrow('Verification cancelled');
      const current = requestVerification(
        'sensitive',
        undefined,
        undefined,
        vi.fn(),
      );
      void current.catch(() => undefined);
      const currentId = required(verificationPrompt.value).id;
      await flushPromises();
      expect(dialog.get('input').element.value).toBe('');
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'idle',
      );
      await vi.advanceTimersByTimeAsync(1100);
      expect(verificationPrompt.value?.id).toBe(currentId);
    } finally {
      dialog.unmount();
    }
  });

  it('ignores a late verifier response and releases an already verified operation when the host unmounts', async () => {
    let respond!: () => void;
    const verify = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          respond = resolve;
        }),
    );
    const first = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void first.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      cancelVerification();
      await expect(first).rejects.toThrow('Verification cancelled');
      const current = requestVerification(
        'sensitive',
        undefined,
        undefined,
        vi.fn().mockResolvedValue(undefined),
      );
      void current.catch(() => undefined);
      const completed = vi.fn();
      void current.then(completed, () => undefined);
      const currentId = required(verificationPrompt.value).id;
      respond();
      await flushPromises();
      expect(verificationPrompt.value?.id).toBe(currentId);
      expect(dialog.get('input').element.value).toBe('');
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'idle',
      );

      await dialog.get('input').setValue('654321');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
        'success',
      );
      dialog.unmount();
      await vi.advanceTimersByTimeAsync(1100);
      expect(completed).toHaveBeenCalledOnce();
      expect(verificationPrompt.value).toBeUndefined();
    } finally {
      if (dialog.exists()) dialog.unmount();
    }
  });

  it('cancels a pending operation before verification without issuing a request', async () => {
    const verify = vi.fn();
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('[data-testid="sensitive-cancel"]').trigger('click');
      await expect(pending).rejects.toThrow('Verification cancelled');
      expect(verificationPrompt.value).toBeUndefined();
      expect(verify).not.toHaveBeenCalled();
    } finally {
      dialog.unmount();
    }
  });

  it.each([true, false])(
    'requires an explicit send before email verification (TOTP enabled: %s)',
    async (totp) => {
      calls.options.mockResolvedValueOnce({
        totp,
        address: 'a***@example.test',
      });
      calls.send.mockResolvedValueOnce({
        server_time: 100,
        retry_at: 60_100,
        expired_at: 300_100,
        verification_id: 'ticket',
      });
      const verify = vi.fn().mockResolvedValue(true);
      const pending = requestVerification(
        'sensitive',
        undefined,
        undefined,
        verify,
      );
      void pending.catch(() => undefined);
      const dialog = await mountDialog();
      try {
        const authenticatorInput = dialog.find(
          'input[aria-label="verification.code"]',
        );
        expect(authenticatorInput.exists()).toBe(totp);
        if (totp) {
          await dialog.get('[data-testid="sensitive-help"]').trigger('click');
          await dialog.get('.sensitive-recovery button').trigger('click');
          await flushPromises();
        }
        expect(dialog.find('input').exists()).toBe(false);
        expect(dialog.text()).toContain('a***@example.test');
        expect(calls.send).not.toHaveBeenCalled();
        await dialog.get('form').trigger('submit');
        await flushPromises();
        expect(calls.send).toHaveBeenCalledOnce();
        expect(verify).not.toHaveBeenCalled();
        await dialog.get('input').setValue('123456');
        await dialog.get('form').trigger('submit');
        await flushPromises();
        expect(verify).toHaveBeenCalledExactlyOnceWith('123456', {
          browser_uuid: expect.any(String),
          verification_id: 'ticket',
        });
        expect(dialog.get('.sensitive-code').attributes('data-feedback')).toBe(
          'success',
        );
        expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
        expect(dialog.get('.sr-only[role="status"]').text()).toBe(
          'verification.verified',
        );
      } finally {
        dialog.unmount();
      }
    },
  );

  it('offers profile recovery as a method card without submitting the sensitive operation', async () => {
    const verify = vi.fn();
    const pending = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    void pending.catch(() => undefined);
    calls.restartRecovery.mockImplementationOnce(() => cancelVerification());
    const dialog = await mountDialog();
    try {
      const recovery = dialog.find('[data-testid="totp-restart-recovery"]');
      expect(!recovery.exists() || !recovery.isVisible()).toBe(true);
      expect(dialog.get('[data-testid="sensitive-help"]').text()).toBe(
        'verification.authenticatorUnavailable',
      );
      await dialog.get('[data-testid="sensitive-help"]').trigger('click');
      const card = dialog.get('[data-testid="totp-restart-recovery"]');
      expect(card.classes()).toContain('security-method-card');
      expect(card.text()).toContain('verification.goToReset');
      await card.trigger('click');
      expect(calls.restartRecovery).toHaveBeenCalledOnce();
      await expect(pending).rejects.toThrow('Verification cancelled');
      expect(verify).not.toHaveBeenCalled();
    } finally {
      dialog.unmount();
    }
  });
});
