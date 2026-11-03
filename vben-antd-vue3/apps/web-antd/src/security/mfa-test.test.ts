import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MFADialog from './mfa-dialog.vue';
import { cancelMFA, mfaPrompt, requestMFA } from './mfa-prompt';

const calls = vi.hoisted(() => ({ test: vi.fn(), restartRecovery: vi.fn() }));
vi.mock('#/api/core/auth', () => ({ testMFAApi: calls.test }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ restartLoginForMFARecovery: calls.restartRecovery }) }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('./mfa-enrollment.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vben/icons', () => ({
  ChevronDown: { template: '<svg />' },
  IconifyIcon: { template: '<svg />' },
}));
vi.mock('ant-design-vue', async (importOriginal) => {
  const components = await importOriginal<typeof import('ant-design-vue')>();
  const { defineComponent, h } = await import('vue');
  return {
    ...components,
    Modal: defineComponent({
      name: 'MFATestModal',
      props: { open: Boolean, closable: Boolean, keyboard: Boolean, title: String },
      setup: (props, { slots }) => () => props.open ? h('section', { 'aria-label': props.title }, slots.default?.()) : null,
    }),
  };
});

afterEach(() => { cancelMFA(); vi.useRealTimers(); vi.resetAllMocks(); });

function begin(verify = vi.fn()) {
  const pending = requestMFA('test', undefined, undefined, verify);
  void pending.catch(() => undefined);
  return { pending, verify };
}

describe('authenticator test dialog', () => {
  it('rejects incomplete input locally and exposes only the test operation', async () => {
    const { pending, verify } = begin();
    const dialog = mount(MFADialog);
    try {
      expect(dialog.attributes('aria-label')).toBe('mfa.testTitle');
      expect(dialog.findAll('input')).toHaveLength(1);
      expect(dialog.find('.mfa-sensitive-cell').exists()).toBe(false);
      expect(dialog.find('[data-testid="mfa-sensitive-help"]').exists()).toBe(false);
      expect(dialog.get('[data-testid="mfa-sensitive-submit"]').text()).toBe('mfa.test');
      await dialog.get('input').setValue('123');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(dialog.get('.mfa-sensitive-feedback').text()).toBe('mfa.codeRequired');
      expect(dialog.get('input').attributes('aria-invalid')).toBe('true');
      expect(calls.test).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
      await dialog.get('[data-testid="mfa-sensitive-cancel"]').trigger('click');
      await expect(pending).rejects.toThrow('MFA cancelled');
    } finally { dialog.unmount(); }
  });

  it('uses only the test endpoint and keeps a successful result until acknowledged', async () => {
    vi.useFakeTimers();
    let respond!: (value: { verified: boolean }) => void;
    calls.test.mockReturnValue(new Promise(resolve => { respond = resolve; }));
    const { pending, verify } = begin();
    const resolved = vi.fn();
    void pending.then(resolved, () => undefined);
    const dialog = mount(MFADialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await dialog.get('form').trigger('submit');
      expect(calls.test).toHaveBeenCalledExactlyOnceWith('123456');
      expect(dialog.get('input').attributes('disabled')).toBeDefined();
      expect(dialog.findComponent({ name: 'MFATestModal' }).props()).toMatchObject({ closable: false, keyboard: false });
      respond({ verified: true }); await flushPromises();
      expect(dialog.get('.mfa-code-control').attributes('data-feedback')).toBe('success');
      expect(dialog.get('.mfa-sensitive-feedback').text()).toBe('mfa.testSuccess');
      expect(dialog.get('[data-testid="mfa-sensitive-submit"]').text()).toBe('mfa.done');
      expect(dialog.find('[data-testid="mfa-sensitive-cancel"]').exists()).toBe(false);
      await vi.advanceTimersByTimeAsync(1500);
      expect(mfaPrompt.value?.mode).toBe('test');
      expect(resolved).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
      expect(calls.restartRecovery).not.toHaveBeenCalled();
      await dialog.get('form').trigger('submit');
      await expect(pending).resolves.toBeUndefined();
      expect(calls.test).toHaveBeenCalledOnce();
    } finally { dialog.unmount(); }
  });

  it('keeps rate-limit errors inline and clears them on editing without starting sensitive verification', async () => {
    calls.test.mockRejectedValueOnce({ response: { status: 429, data: { msg: 'Too many attempts' } } });
    const { verify } = begin();
    const dialog = mount(MFADialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(mfaPrompt.value?.mode).toBe('test');
      expect(dialog.get('.mfa-sensitive-feedback').text()).toBe('Too many attempts');
      expect(dialog.get('input').attributes('disabled')).toBeUndefined();
      await dialog.get('input').setValue('654321');
      expect(dialog.find('.mfa-sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('.mfa-code-control').attributes('data-feedback')).toBe('idle');
      expect(calls.test).toHaveBeenCalledOnce();
      expect(verify).not.toHaveBeenCalled();
    } finally { dialog.unmount(); }
  });

  it.each([{ verified: false }, {}])('requires an explicit verified result: %j', async result => {
    calls.test.mockResolvedValueOnce(result);
    begin();
    const dialog = mount(MFADialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit'); await flushPromises();
      expect(dialog.get('.mfa-code-control').attributes('data-feedback')).toBe('failure');
      expect(dialog.get('.mfa-sensitive-feedback').text()).toBe('mfa.failed');
      expect(mfaPrompt.value?.mode).toBe('test');
    } finally { dialog.unmount(); }
  });

  it('does not apply a late test response to a subsequent sensitive prompt', async () => {
    let respond!: (value: { verified: boolean }) => void;
    calls.test.mockReturnValue(new Promise(resolve => { respond = resolve; }));
    const { pending } = begin();
    const dialog = mount(MFADialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      cancelMFA(); await expect(pending).rejects.toThrow('MFA cancelled');
      const verify = vi.fn();
      const next = requestMFA('sensitive', undefined, undefined, verify);
      void next.catch(() => undefined);
      const id = mfaPrompt.value!.id;
      respond({ verified: true }); await flushPromises();
      expect(mfaPrompt.value?.id).toBe(id);
      expect(dialog.get('.mfa-code-control').attributes('data-feedback')).toBe('idle');
      expect(dialog.get('input').element.value).toBe('');
      expect(verify).not.toHaveBeenCalled();
    } finally { dialog.unmount(); }
  });
});
