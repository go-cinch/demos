import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import VerificationDialog from './verification-dialog.vue';
import {
  cancelVerification,
  requestVerification,
  verificationPrompt,
} from './verification-prompt';

const calls = vi.hoisted(() => ({ test: vi.fn(), restartRecovery: vi.fn() }));
vi.mock('#/api/core/auth', () => ({
  getSensitiveOptionsApi: async () => ({ totp: true, address: '' }),
  testTOTPApi: calls.test,
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ openTOTPRecovery: calls.restartRecovery }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('./totp-enrollment.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vben/icons', () => ({
  Mail: { template: '<svg />' },
  ShieldCheck: { template: '<svg />' },
  ChevronDown: { template: '<svg />' },
  IconifyIcon: { template: '<svg />' },
}));
vi.mock('ant-design-vue', async (importOriginal) => {
  const components = await importOriginal<typeof import('ant-design-vue')>();
  const { defineComponent, h } = await import('vue');
  return {
    ...components,
    Modal: defineComponent({
      name: 'VerificationTestModal',
      props: {
        open: Boolean,
        closable: Boolean,
        keyboard: Boolean,
        title: { type: String, default: undefined },
      },
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { 'aria-label': props.title }, slots.default?.())
            : null,
    }),
  };
});

afterEach(() => {
  cancelVerification();
  vi.useRealTimers();
  vi.resetAllMocks();
});

function begin(verify = vi.fn()) {
  const pending = requestVerification('test', undefined, undefined, verify);
  void pending.catch(() => undefined);
  return { pending, verify };
}

describe('authenticator test dialog', () => {
  it('rejects incomplete input locally and exposes only the test operation', async () => {
    const { pending, verify } = begin();
    const dialog = mount(VerificationDialog);
    try {
      expect(dialog.get('section[aria-label]').attributes('aria-label')).toBe(
        'verification.testTitle',
      );
      expect(dialog.findAll('input')).toHaveLength(1);
      expect(dialog.find('.sensitive-cell').exists()).toBe(false);
      expect(dialog.find('[data-testid="sensitive-help"]').exists()).toBe(
        false,
      );
      expect(dialog.get('[data-testid="sensitive-submit"]').text()).toBe(
        'verification.test',
      );
      await dialog.get('input').setValue('123');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('.verification-code-control').classes()).toContain(
        'is-shaking',
      );
      expect(dialog.get('input').attributes('aria-invalid')).toBe('true');
      expect(calls.test).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
      await dialog.get('[data-testid="sensitive-cancel"]').trigger('click');
      await expect(pending).rejects.toThrow('Verification cancelled');
    } finally {
      dialog.unmount();
    }
  });

  it('uses only the test endpoint and keeps a successful result until acknowledged', async () => {
    vi.useFakeTimers();
    let respond!: (value: { verified: boolean }) => void;
    calls.test.mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      }),
    );
    const { pending, verify } = begin();
    const resolved = vi.fn();
    void pending.then(resolved, () => undefined);
    const dialog = mount(VerificationDialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await dialog.get('form').trigger('submit');
      expect(calls.test).toHaveBeenCalledExactlyOnceWith('123456');
      expect(dialog.get('input').attributes('disabled')).toBeDefined();
      expect(
        dialog.findComponent({ name: 'VerificationTestModal' }).props(),
      ).toMatchObject({ closable: false, keyboard: false });
      respond({ verified: true });
      await flushPromises();
      expect(
        dialog.get('.verification-code-control').attributes('data-feedback'),
      ).toBe('success');
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('.sr-only[role="status"]').text()).toBe(
        'verification.testSuccess',
      );
      expect(dialog.get('[data-testid="sensitive-submit"]').text()).toBe(
        'verification.done',
      );
      expect(dialog.find('[data-testid="sensitive-cancel"]').exists()).toBe(
        false,
      );
      await vi.advanceTimersByTimeAsync(1500);
      expect(verificationPrompt.value?.mode).toBe('test');
      expect(resolved).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
      expect(calls.restartRecovery).not.toHaveBeenCalled();
      await dialog.get('form').trigger('submit');
      await expect(pending).resolves.toBeUndefined();
      expect(calls.test).toHaveBeenCalledOnce();
    } finally {
      dialog.unmount();
    }
  });

  it('marks rate-limit errors on the code border and clears them on editing', async () => {
    calls.test.mockRejectedValueOnce({
      response: { status: 429, data: { msg: 'Too many attempts' } },
    });
    const { verify } = begin();
    const dialog = mount(VerificationDialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(verificationPrompt.value?.mode).toBe('test');
      expect(dialog.get('.sr-only[role="alert"]').text()).toBe(
        'Too many attempts',
      );
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(dialog.get('input').attributes('disabled')).toBeUndefined();
      await dialog.get('input').setValue('654321');
      expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
      expect(
        dialog.get('.verification-code-control').attributes('data-feedback'),
      ).toBe('idle');
      expect(calls.test).toHaveBeenCalledOnce();
      expect(verify).not.toHaveBeenCalled();
    } finally {
      dialog.unmount();
    }
  });

  it.each([{ verified: false }, {}])(
    'requires an explicit verified result: %j',
    async (result) => {
      calls.test.mockResolvedValueOnce(result);
      begin();
      const dialog = mount(VerificationDialog);
      try {
        await dialog.get('input').setValue('123456');
        await dialog.get('form').trigger('submit');
        await flushPromises();
        expect(
          dialog.get('.verification-code-control').attributes('data-feedback'),
        ).toBe('failure');
        expect(dialog.find('.sensitive-feedback').exists()).toBe(false);
        expect(dialog.get('.verification-code-control').classes()).toContain(
          'is-shaking',
        );
        expect(verificationPrompt.value?.mode).toBe('test');
      } finally {
        dialog.unmount();
      }
    },
  );

  it('does not apply a late test response to a subsequent sensitive prompt', async () => {
    let respond!: (value: { verified: boolean }) => void;
    calls.test.mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      }),
    );
    const { pending } = begin();
    const dialog = mount(VerificationDialog);
    try {
      await dialog.get('input').setValue('123456');
      await dialog.get('form').trigger('submit');
      cancelVerification();
      await expect(pending).rejects.toThrow('Verification cancelled');
      const verify = vi.fn();
      const next = requestVerification(
        'sensitive',
        undefined,
        undefined,
        verify,
      );
      void next.catch(() => undefined);
      const id = required(verificationPrompt.value).id;
      respond({ verified: true });
      await flushPromises();
      expect(verificationPrompt.value?.id).toBe(id);
      expect(
        dialog.get('.verification-code-control').attributes('data-feedback'),
      ).toBe('idle');
      expect(dialog.get('input').element.value).toBe('');
      expect(verify).not.toHaveBeenCalled();
    } finally {
      dialog.unmount();
    }
  });
});
