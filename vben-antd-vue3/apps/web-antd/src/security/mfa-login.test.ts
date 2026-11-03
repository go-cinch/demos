import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMFAEnrollmentRequired, rememberAuthRequirements } from '#/api/auth-headers';

import MFALogin from './mfa-login.vue';
import MFADialog from './mfa-dialog.vue';
import { cancelMFA, mfaPrompt, requestMFA } from './mfa-prompt';

const calls = vi.hoisted(() => ({ verify: vi.fn(), recover: vi.fn(), test: vi.fn(), restartRecovery: vi.fn() }));
vi.mock('#/api/core/auth', () => ({ completeMFALoginApi: calls.verify, recoverMFALoginApi: calls.recover, testMFAApi: calls.test }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ restartLoginForMFARecovery: calls.restartRecovery }) }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('./mfa-enrollment.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vben/icons', () => ({
  ArrowLeft: { template: '<svg />' },
  Check: { template: '<svg />' },
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
      name: 'MFATestModal',
      props: { open: Boolean, closable: Boolean, keyboard: Boolean },
      setup(props, { slots }) {
        return () => props.open ? h('div', slots.default?.()) : null;
      },
    }),
  };
});

afterEach(() => { cancelMFA(); vi.useRealTimers(); vi.clearAllMocks(); });

function start() {
  const pending = requestMFA('login', 'one-time-ticket', Date.now() + 300_000);
  void pending.catch(() => undefined);
  return pending;
}

describe('inline login MFA', () => {
  it('uses the shared single code input and clears a failed verification when the code changes', async () => {
    start();
    const page = mount(MFALogin);
    try {
      expect(page.findAll('.mfa-code-control')).toHaveLength(1);
      expect(page.findAll('input')).toHaveLength(1);
      calls.verify.mockRejectedValueOnce({ response: { data: { msg: 'Code already used' } } });
      await page.get('input').setValue('1a2-3 4567');
      expect(page.get('input').element.value).toBe('123456');
      await page.get('form').trigger('submit'); await flushPromises();
      expect(page.get('.mfa-code-control').attributes('data-feedback')).toBe('failure');
      expect(page.text()).toContain('Code already used');
      await page.get('input').setValue('654321'); await flushPromises();
      expect(page.get('.mfa-code-control').attributes('data-feedback')).toBe('idle');
      expect(page.text()).not.toContain('Code already used');
    } finally { page.unmount(); }
  });

  it('renders on the page without opening the global MFA modal and completes the original login', async () => {
    const pending = start();
    const result = { access_token: 'test-access', refresh_token: 'test-refresh' };
    calls.verify.mockResolvedValue(result);
    const page = mount(MFALogin);
    const dialog = mount(MFADialog);
    try {
      expect(dialog.text()).toBe('');
      expect(page.find('[role="dialog"]').exists()).toBe(false);
      expect(page.find('[data-testid="mfa-login-step"]').exists()).toBe(true);
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit'); await flushPromises();
      expect(calls.verify).toHaveBeenCalledWith('one-time-ticket', '123456');
      await expect(pending).resolves.toEqual(result);
      expect(page.emitted('verified')).toHaveLength(1);
    } finally { page.unmount(); dialog.unmount(); }
  });

  it('uses recovery codes only to reset the authenticator and returns the restricted session', async () => {
    const pending = start();
    const page = mount(MFALogin);
    try {
      calls.verify.mockRejectedValue({ response: { data: { msg: 'Incorrect factor' } } });
      await page.get('input').setValue('123456'); await page.get('form').trigger('submit'); await flushPromises();
      expect(page.text()).toContain('Incorrect factor');
      expect(mfaPrompt.value?.mode).toBe('login');
      await page.get('.mfa-login-actions .ant-btn-link').trigger('click');
      expect(page.attributes('data-mode')).toBe('recovery');
      expect(page.get('h1').text()).toBe('mfa.recoverAuthenticator');
      expect(page.text()).toContain('mfa.recoveryResetHelp');
      expect(page.get('.mfa-login-submit').text()).toBe('mfa.recoverAuthenticator');
      await page.get('input').setValue('test-recovery-code');
      calls.recover.mockRejectedValueOnce({ response: { data: { msg: 'Recovery code is invalid' } } });
      await page.get('form').trigger('submit'); await flushPromises();
      expect(page.text()).toContain('Recovery code is invalid');
      expect(mfaPrompt.value?.mode).toBe('login');
      const restricted = { access_token: 'recovery-session', refresh_token: 'restricted-refresh', expired_at: 123 };
      rememberAuthRequirements(restricted, { 'X-MFA-Enrollment-Required': 'true' });
      calls.recover.mockResolvedValue(restricted);
      await page.get('form').trigger('submit'); await flushPromises();
      expect(calls.recover).toHaveBeenLastCalledWith('one-time-ticket', 'test-recovery-code');
      expect(calls.verify).toHaveBeenCalledExactlyOnceWith('one-time-ticket', '123456');
      expect(isMFAEnrollmentRequired((await pending)!)).toBe(true);
    } finally { page.unmount(); }
  });

  it('expires the ticket and allows returning to login without sending a verification request', async () => {
    vi.useFakeTimers();
    const pending = start();
    const page = mount(MFALogin);
    try {
      await vi.advanceTimersByTimeAsync(300_001);
      expect(page.text()).toContain('mfa.loginExpired');
      expect(page.get('input').attributes('disabled')).toBeDefined();
      await page.get('form').trigger('submit');
      expect(calls.verify).not.toHaveBeenCalled();
      await page.get('.mfa-login-actions .ant-btn-text').trigger('click');
      await expect(pending).rejects.toThrow('MFA cancelled');
      expect(mfaPrompt.value).toBeUndefined();
    } finally { page.unmount(); }
  });

  it('does not complete a different login when an old response arrives after cancellation', async () => {
    const old = start();
    let respond!: (value: unknown) => void;
    calls.verify.mockReturnValue(new Promise(resolve => { respond = resolve; }));
    const page = mount(MFALogin);
    try {
      await page.get('input').setValue('123456'); await page.get('form').trigger('submit');
      cancelMFA(); await expect(old).rejects.toThrow('MFA cancelled');
      const current = requestMFA('login', 'different-ticket', Date.now() + 300_000);
      void current.catch(() => undefined);
      respond({ access_token: 'stale-access' }); await flushPromises();
      expect(mfaPrompt.value?.ticket).toBe('different-ticket');
      expect(page.emitted('verified')).toBeUndefined();
    } finally { page.unmount(); }
  });
});

describe('sensitive MFA dialog', () => {
  beforeEach(() => vi.useFakeTimers());

  const mountDialog = async () => {
    const dialog = mount(MFADialog);
    await flushPromises();
    return dialog;
  };

  const replaceNativeRange = (input: HTMLInputElement, replacement: string, start: number, end: number) => {
    input.setRangeText(replacement, start, end, 'end');
    // happy-dom 20 places an "end" caret using the entire new value length.
    // Model the browser's default edit position before delivering input.
    const caret = start + replacement.length;
    input.setSelectionRange(caret, caret);
  };

  const typeCharacter = async (input: HTMLInputElement, character: string) => {
    const before = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, data: character, inputType: 'insertText',
    });
    if (input.dispatchEvent(before)) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const available = input.maxLength - (input.value.length - (end - start));
      replaceNativeRange(input, character.slice(0, Math.max(0, available)), start, end);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: character, inputType: 'insertText' }));
    }
    await flushPromises();
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: character }));
    await flushPromises();
  };

  const moveCaret = async (input: HTMLInputElement, position: number, key: string) => {
    input.setSelectionRange(position, position);
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
    await flushPromises();
  };

  const pasteText = async (input: HTMLInputElement, text: string) => {
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => text } });
    if (input.dispatchEvent(paste)) {
      const before = new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, data: text, inputType: 'insertFromPaste',
      });
      if (input.dispatchEvent(before)) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const available = input.maxLength - (input.value.length - (end - start));
        replaceNativeRange(input, text.slice(0, Math.max(0, available)), start, end);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
      }
    }
    await flushPromises();
  };

  it('rejects repeated non-digits without moving the caret, including input events without beforeinput', async () => {
    const pending = requestMFA('sensitive', undefined, undefined, vi.fn());
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
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'x', inputType: 'insertText' }));
      await flushPromises();
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
      await flushPromises();
      expect(input.value).toBe('12');
      expect(input.selectionStart).toBe(2);
    } finally { dialog.unmount(); }
  });

  it('preserves a middle caret for rejected characters and keeps arrow keys and backspace usable', async () => {
    const pending = requestMFA('sensitive', undefined, undefined, vi.fn());
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
      const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' });
      expect(input.dispatchEvent(before)).toBe(true);
      replaceNativeRange(input, '', 2, 3);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      await flushPromises();
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace' }));
      await flushPromises();
      expect(input.value).toBe('1234');
      expect(input.selectionStart).toBe(2);
    } finally { dialog.unmount(); }
  });

  it('pastes only digits up to six and replaces the current selection without losing surrounding digits', async () => {
    const pending = requestMFA('sensitive', undefined, undefined, vi.fn());
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
    } finally { dialog.unmount(); }
  });

  it('filters the single input and renders incomplete-code errors beside it', async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    const pending = requestMFA('sensitive', undefined, undefined, verify);
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      expect(dialog.get('input').attributes()).toMatchObject({ inputmode: 'numeric', maxlength: '6', 'aria-label': 'mfa.code' });
      expect(dialog.findAll('.mfa-code-control')).toHaveLength(1);
      expect(dialog.find('.mfa-sensitive-cell').exists()).toBe(false);
      await dialog.get('input').setValue('recovery-code');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(dialog.get('input').element.value).toBe('');
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('failure');
      expect(dialog.get('.mfa-sensitive-code').classes()).toContain('is-shaking');
      expect(dialog.get('.mfa-sensitive-feedback[aria-live]').text()).toBe('mfa.codeRequired');
      expect(dialog.get('.mfa-sensitive-feedback').isVisible()).toBe(true);
      expect(verify).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(999);
      expect(dialog.get('.mfa-sensitive-code').classes()).toContain('is-shaking');
      await vi.advanceTimersByTimeAsync(51);
      expect(dialog.get('.mfa-sensitive-code').classes()).not.toContain('is-shaking');
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('failure');

      await dialog.get('input').setValue('12a34b5678');
      expect(dialog.get('input').element.value).toBe('123456');
      expect(dialog.findAll('input')).toHaveLength(1);
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('idle');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(verify).toHaveBeenCalledExactlyOnceWith('123456');
      await vi.advanceTimersByTimeAsync(720);
      await expect(pending).resolves.toBeUndefined();
    } finally { dialog.unmount(); }
  });

  it('keeps failures in the current dialog and clears red feedback when editing before an explicit retry', async () => {
    const verify = vi.fn().mockRejectedValueOnce({ response: { data: { msg: 'Code was already used' } } }).mockResolvedValueOnce(undefined);
    const pending = requestMFA('sensitive', undefined, undefined, verify);
    void pending.catch(() => undefined);
    const promptId = mfaPrompt.value!.id;
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(mfaPrompt.value?.id).toBe(promptId);
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('failure');
      expect(dialog.get('.mfa-sensitive-code').classes()).toContain('is-shaking');
      expect(dialog.get('.mfa-sensitive-feedback[aria-live]').text()).toBeTruthy();
      expect(dialog.get('.mfa-sensitive-feedback').isVisible()).toBe(true);
      expect(dialog.get('input').attributes('disabled')).toBeUndefined();

      await dialog.get('input').setValue('654321');
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('idle');
      expect(dialog.get('.mfa-sensitive-code').classes()).not.toContain('is-shaking');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(verify).toHaveBeenCalledTimes(2);
      expect(verify).toHaveBeenLastCalledWith('654321');
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('success');
      await vi.advanceTimersByTimeAsync(720);
      await expect(pending).resolves.toBeUndefined();
    } finally { dialog.unmount(); }
  });

  it('blocks repeated submission and cancellation until the successful feedback finishes', async () => {
    let respond!: () => void;
    const verify = vi.fn(() => new Promise<void>(resolve => { respond = resolve; }));
    const pending = requestMFA('sensitive', undefined, undefined, verify);
    void pending.catch(() => undefined);
    const promptId = mfaPrompt.value!.id;
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await dialog.get('form').trigger('submit');
      expect(verify).toHaveBeenCalledExactlyOnceWith('123456');
      expect(dialog.get('input').attributes('disabled')).toBeDefined();
      expect(dialog.get('[data-testid="mfa-sensitive-submit"]').attributes('disabled')).toBeDefined();
      expect(dialog.get('[data-testid="mfa-sensitive-cancel"]').attributes('disabled')).toBeDefined();
      expect(dialog.findComponent({ name: 'MFATestModal' }).props()).toMatchObject({ closable: false, keyboard: false });

      respond(); await flushPromises();
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('success');
      expect(dialog.get('.mfa-sensitive-feedback[aria-live]').text()).toBe('mfa.verified');
      expect(dialog.get('input').attributes('disabled')).toBeDefined();
      await dialog.get('form').trigger('submit');
      expect(verify).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(719);
      expect(mfaPrompt.value?.id).toBe(promptId);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
      expect(mfaPrompt.value).toBeUndefined();
    } finally { dialog.unmount(); }
  });

  it('closes immediately without green feedback when the verifier returns a non-MFA failure to its caller', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const pending = requestMFA('sensitive', undefined, undefined, verify);
    void pending.catch(() => undefined);
    const completed = vi.fn();
    void pending.then(completed, () => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(verify).toHaveBeenCalledExactlyOnceWith('123456');
      // No fake time advances: business/network failures do not wait for the
      // success animation or claim that verification succeeded.
      expect(completed).toHaveBeenCalledOnce();
      expect(mfaPrompt.value).toBeUndefined();
      expect(dialog.find('[data-feedback="success"]').exists()).toBe(false);
      expect(dialog.find('.is-pulsing').exists()).toBe(false);
      await expect(pending).resolves.toBeUndefined();
    } finally { dialog.unmount(); }
  });

  it('does not let an old success timer complete a newer prompt', async () => {
    const first = requestMFA('sensitive', undefined, undefined, vi.fn().mockResolvedValue(undefined));
    void first.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('success');
      cancelMFA(); await expect(first).rejects.toThrow('MFA cancelled');
      const current = requestMFA('sensitive', undefined, undefined, vi.fn());
      void current.catch(() => undefined);
      const currentId = mfaPrompt.value!.id;
      await flushPromises();
      expect(dialog.get('input').element.value).toBe('');
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('idle');
      await vi.advanceTimersByTimeAsync(1100);
      expect(mfaPrompt.value?.id).toBe(currentId);
    } finally { dialog.unmount(); }
  });

  it('ignores a late verifier response and releases an already verified operation when the host unmounts', async () => {
    let respond!: () => void;
    const verify = vi.fn(() => new Promise<void>(resolve => { respond = resolve; }));
    const first = requestMFA('sensitive', undefined, undefined, verify);
    void first.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      cancelMFA(); await expect(first).rejects.toThrow('MFA cancelled');
      const current = requestMFA('sensitive', undefined, undefined, vi.fn().mockResolvedValue(undefined));
      void current.catch(() => undefined);
      const completed = vi.fn();
      void current.then(completed, () => undefined);
      const currentId = mfaPrompt.value!.id;
      respond(); await flushPromises();
      expect(mfaPrompt.value?.id).toBe(currentId);
      expect(dialog.get('input').element.value).toBe('');
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('idle');

      await dialog.get('input').setValue('654321');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(dialog.get('.mfa-sensitive-code').attributes('data-feedback')).toBe('success');
      dialog.unmount();
      await vi.advanceTimersByTimeAsync(1100);
      expect(completed).toHaveBeenCalledOnce();
      expect(mfaPrompt.value).toBeUndefined();
    } finally { if (dialog.exists()) dialog.unmount(); }
  });

  it('cancels a pending operation before verification without issuing a request', async () => {
    const verify = vi.fn();
    const pending = requestMFA('sensitive', undefined, undefined, verify);
    void pending.catch(() => undefined);
    const dialog = await mountDialog();
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('[data-testid="mfa-sensitive-cancel"]').trigger('click');
      await expect(pending).rejects.toThrow('MFA cancelled');
      expect(mfaPrompt.value).toBeUndefined();
      expect(verify).not.toHaveBeenCalled();
    } finally { dialog.unmount(); }
  });

  it('offers recovery by restarting login without submitting the sensitive operation', async () => {
    const verify = vi.fn();
    const pending = requestMFA('sensitive', undefined, undefined, verify);
    void pending.catch(() => undefined);
    calls.restartRecovery.mockImplementationOnce(() => cancelMFA());
    const dialog = await mountDialog();
    try {
      const recovery = dialog.find('[data-testid="mfa-restart-recovery"]');
      expect(!recovery.exists() || !recovery.isVisible()).toBe(true);
      await dialog.get('[data-testid="mfa-sensitive-help"]').trigger('click');
      await dialog.get('[data-testid="mfa-restart-recovery"]').trigger('click');
      expect(calls.restartRecovery).toHaveBeenCalledOnce();
      await expect(pending).rejects.toThrow('MFA cancelled');
      expect(verify).not.toHaveBeenCalled();
    } finally { dialog.unmount(); }
  });
});
