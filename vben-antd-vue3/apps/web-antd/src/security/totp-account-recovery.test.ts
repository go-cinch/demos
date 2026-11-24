import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import AccountRecovery from './totp-account-recovery.vue';

const api = vi.hoisted(() => ({
  cooldown: vi.fn(),
  loginOptions: vi.fn(),
  recover: vi.fn(),
  options: vi.fn(),
  send: vi.fn(),
  confirm: vi.fn(),
  accept: vi.fn(),
  enroll: vi.fn(),
}));
vi.mock('#/api/core/auth', () => ({
  getMailboxCooldownApi: api.cooldown,
  getLoginRecoveryOptionsApi: api.loginOptions,
  recoverTOTPLoginApi: api.recover,
  getSensitiveOptionsApi: api.options,
  sendAccountResetEmailApi: api.send,
  confirmAccountResetApi: api.confirm,
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    captureSession: () => () => true,
    acceptSession: api.accept,
    requireTOTPEnrollment: api.enroll,
  }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/icons', () => {
  const icon = { template: '<svg />' };
  return { Mail: icon, ShieldCheck: icon, ChevronRight: icon };
});

const tipText = (type: 'error' | 'info') =>
  document.body.querySelector(`.ant-message-${type} [role="status"]`)
    ?.textContent;

afterEach(() => vi.resetAllMocks());
async function mountRecovery(address: string) {
  api.options.mockResolvedValue({ totp: true, address });
  api.cooldown.mockResolvedValue({ server_time: 1000, retry_at: 0 });
  const page = mount(AccountRecovery, {
    global: {
      stubs: {
        AModal: {
          template:
            '<section><slot name="title"/><slot/><slot name="footer"/></section>',
        },
      },
    },
  });
  await flushPromises();
  return page;
}

describe('signed-in authenticator reset', () => {
  it('sends only on confirmation and requires a verified reset before installing the new session', async () => {
    const page = await mountRecovery('de***@example.test');
    try {
      await page.get('.methods button:last-child').trigger('click');
      await flushPromises();
      expect(page.text()).toContain('de***@example.test');
      expect(page.find('input').exists()).toBe(false);
      expect(api.send).not.toHaveBeenCalled();
      api.send.mockResolvedValue({
        server_time: 0,
        retry_at: 60_000,
        expired_at: 300_000,
        verification_id: 'reset-id',
      });
      await page.get('form').trigger('submit');
      await flushPromises();
      const uuid = required(api.send.mock.calls[0])[0];
      expect(page.get('.delivery button').attributes('disabled')).toBeDefined();
      api.confirm
        .mockRejectedValueOnce(new Error('Test request failed'))
        .mockResolvedValueOnce({ access_token: 'replacement' });
      await page.get('input').setValue('123456');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(api.confirm).toHaveBeenCalledWith({
        browser_uuid: uuid,
        verification_id: 'reset-id',
        verification_code: '123456',
      });
      expect(api.accept).not.toHaveBeenCalled();
      expect(page.get('input').attributes('aria-invalid')).toBe('true');
      expect(page.get('.verification-code-control').classes()).toContain(
        'is-shaking',
      );
      expect(page.find('.ant-form-item-explain-error').exists()).toBe(false);
      expect(page.get('[role=alert]').classes()).toContain('sr-only');
      await page.get('input').setValue('654321');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(api.accept).toHaveBeenCalledWith({ access_token: 'replacement' });
      expect(api.enroll).toHaveBeenCalledOnce();
    } finally {
      page.unmount();
    }
  });

  it('offers recovery codes for accounts without a verified email address', async () => {
    const page = await mountRecovery('');
    try {
      expect(page.findAll('.methods button')).toHaveLength(1);
      await page.get('.methods button').trigger('click');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(api.confirm).not.toHaveBeenCalled();
      expect(page.get('.recovery-control').classes()).toContain('is-shaking');
      expect(page.get('input').attributes('aria-invalid')).toBe('true');
      expect(page.find('.ant-form-item-explain-error').exists()).toBe(false);
      expect(page.find('.warning').exists()).toBe(false);
      api.confirm.mockRejectedValueOnce({
        response: { data: { error_code: 'AUTH_VERIFICATION_INVALID' } },
      });
      await page.get('input').setValue('incorrect-code');
      expect(page.get('.recovery-control').classes()).not.toContain(
        'is-shaking',
      );
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.get('.recovery-control').classes()).toContain('is-shaking');
      expect(page.find('.ant-form-item-explain-error').exists()).toBe(false);
      await page.get('input').setValue(' saved-code ');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(api.confirm).toHaveBeenCalledWith('saved-code');
      expect(api.send).not.toHaveBeenCalled();
    } finally {
      page.unmount();
    }
  });
});

const login = {
  id: 1,
  ticket: 'login-ticket',
  identifier: 'owner',
  emailLogin: false,
};
function mountLoginRecovery() {
  return mount(AccountRecovery, {
    props: { login },
    global: {
      stubs: {
        AModal: {
          template:
            '<section><slot name="title"/><slot/><slot name="footer"/></section>',
        },
      },
    },
  });
}
describe('login authenticator reset methods', () => {
  it('fetches ticket-scoped state and offers only recovery codes for an unbound account', async () => {
    api.loginOptions.mockResolvedValue({ address: '' });
    const page = mountLoginRecovery();
    try {
      await flushPromises();
      expect(api.loginOptions).toHaveBeenCalledExactlyOnceWith('login-ticket');
      expect(api.options).not.toHaveBeenCalled();
      expect(page.findAll('.methods button')).toHaveLength(1);
      expect(page.text()).not.toContain('email-auth.resetAuthenticator');
      await page.get('.methods button').trigger('click');
      await page.get('input').setValue('saved-code');
      api.recover.mockResolvedValue({ access_token: 'restricted' });
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(api.recover).toHaveBeenCalledWith('login-ticket', 'saved-code');
      expect(page.emitted('verified')).toEqual([
        [1, { access_token: 'restricted' }],
      ]);
    } finally {
      page.unmount();
    }
  });

  it('shows a bound mailbox only after status succeeds and keeps it hidden on errors', async () => {
    let reject!: (error: Error) => void;
    api.loginOptions.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const page = mountLoginRecovery();
    try {
      expect(page.text()).not.toContain('email-auth.resetAuthenticator');
      expect(page.find('.ant-skeleton').exists()).toBe(true);
      reject(new Error('Unavailable'));
      await flushPromises();
      expect(page.text()).not.toContain('email-auth.resetAuthenticator');
      expect(page.find('.ant-alert').exists()).toBe(false);
      expect(tipText('error')).toBe('email-auth.requestFailed');
      api.loginOptions.mockResolvedValueOnce({ address: 'ow***@example.test' });
      await page.get('[data-testid="recovery-retry-methods"]').trigger('click');
      await flushPromises();
      expect(page.text()).toContain('email-auth.resetAuthenticator');
      expect(page.findAll('.methods button')).toHaveLength(2);
    } finally {
      page.unmount();
    }
  });

  it('ignores an old account response after the ticket changes or expires', async () => {
    let resolve!: (value: { address: string }) => void;
    api.loginOptions.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const page = mountLoginRecovery();
    try {
      api.loginOptions.mockResolvedValueOnce({ address: '' });
      await page.setProps({ login: { ...login, ticket: 'new-ticket' } });
      await flushPromises();
      resolve({ address: 'old***@example.test' });
      await flushPromises();
      expect(page.text()).not.toContain('email-auth.resetAuthenticator');
      await page.setProps({ expired: true });
      await flushPromises();
      expect(api.loginOptions).toHaveBeenCalledTimes(2);
      expect(tipText('info')).toBe('verification.loginExpired');
      expect(page.get('.methods button').attributes('disabled')).toBeDefined();
      expect(page.get('.recovery-footer button').text()).toBe(
        'verification.backToLogin',
      );
      await page.get('.recovery-footer button').trigger('click');
      expect(page.emitted('restartLogin')).toEqual([[]]);
    } finally {
      page.unmount();
    }
  });
});

describe('email reset entry cooldown', () => {
  it('queries before sending and displays a disabled countdown without an alert', async () => {
    const page = await mountRecovery('ow***@example.test');
    try {
      api.cooldown.mockResolvedValue({ server_time: 1000, retry_at: 61_000 });
      await page.get('.methods button:last-child').trigger('click');
      await flushPromises();
      expect(api.cooldown).toHaveBeenCalledWith(
        expect.any(String),
        'totp_recovery',
        undefined,
      );
      expect(
        page.get('.recovery-footer button:last-child').attributes('disabled'),
      ).toBeDefined();
      expect(page.text()).toContain('verification.resendAfter');
      expect(page.find('.ant-alert').exists()).toBe(false);
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(api.send).not.toHaveBeenCalled();
    } finally {
      page.unmount();
    }
  });

  it('keeps cooldown races on the button and preserves other send errors', async () => {
    const page = await mountRecovery('ow***@example.test');
    try {
      await page.get('.methods button:last-child').trigger('click');
      await flushPromises();
      api.send.mockRejectedValue({
        response: {
          data: {
            error_code: 'AUTH_EMAIL_COOLDOWN',
            msg: 'cooldown error',
            server_time: 1000,
            retry_at: 61_000,
          },
        },
      });
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.text()).toContain('verification.resendAfter');
      expect(page.find('.ant-alert').exists()).toBe(false);
      await page.get('.recovery-footer button').trigger('click');
      await page.get('.methods button:last-child').trigger('click');
      await flushPromises();
      api.send.mockRejectedValue({
        response: {
          data: {
            error_code: 'AUTH_EMAIL_UNAVAILABLE',
            msg: 'delivery unavailable',
          },
        },
      });
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.find('.ant-alert').exists()).toBe(false);
      expect(tipText('error')).toBe('delivery unavailable');
    } finally {
      page.unmount();
    }
  });
});
