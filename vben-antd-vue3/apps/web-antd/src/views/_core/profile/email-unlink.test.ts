import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, expect, it, vi } from 'vitest';

import EmailUnlink from './email-unlink.vue';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('#/api/core/auth', () => ({
  getEmailUnlinkStatusApi: mocks.status,
  getEmailUnlinkProgressApi: mocks.status,
  requestEmailUnlinkApi: mocks.send,
  verifyEmailUnlinkApi: mocks.verify,
}));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasProfileAction: () => true }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ captureSession: () => () => true }),
}));
vi.mock('#/locales', () => ({
  $t: (key: string, params?: { email: string }) =>
    [key, params?.email].filter(Boolean).join(' '),
}));

const status = {
  bound: true,
  can_send: true,
  fallback: 'totp',
  server_time: 1000,
  retry_at: 0,
};
const ticket = {
  server_time: 1000,
  retry_at: 61_000,
  expired_at: 301_000,
  verification_id: 'pending',
};
const render = (masked = 'ab***@example.test') =>
  mount(EmailUnlink, {
    props: { masked },
    global: {
      stubs: {
        AModal: {
          props: ['open'],
          template:
            '<section v-if="open" role="dialog"><slot/><footer><slot name="footer"/></footer></section>',
        },
        AAlert: {
          props: ['message'],
          template: '<aside>{{ message }}<slot name="description"/></aside>',
        },
        AButton: {
          props: ['disabled', 'loading'],
          template: '<button :disabled="disabled || loading"><slot/></button>',
        },
        ASkeleton: true,
      },
    },
  });
const button = (page: ReturnType<typeof render>, text: string) => {
  const result = page
    .findAll('button')
    .find((b) => b.text().includes(`email-auth.${text}`));
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
};
const requestTip = () =>
  document.body.querySelector('.ant-message-error [role="status"]')
    ?.textContent;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.status.mockResolvedValue(status);
});

it('waits for an explicit send, lets the user go back or cancel, and closes only on success', async () => {
  const page = render();
  try {
    await flushPromises();
    await button(page, 'unlink').trigger('click');
    await flushPromises();
    await button(page, 'canReceive').trigger('click');
    expect(page.get('[role="dialog"]').text()).toContain('ab***@example.test');
    await button(page, 'backUnlink').trigger('click');
    await button(page, 'cancelUnlink').trigger('click');
    expect(mocks.send).not.toHaveBeenCalled();
    await button(page, 'unlink').trigger('click');
    await flushPromises();
    await button(page, 'canReceive').trigger('click');
    mocks.send.mockRejectedValueOnce(new Error('offline'));
    await button(page, 'sendUnlinkMail').trigger('click');
    await flushPromises();
    expect(page.find('[role="dialog"] [role="alert"]').exists()).toBe(false);
    expect(requestTip()).toBe('ui.fallback.http.networkError');
    let accept!: () => void;
    mocks.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = () => resolve(ticket);
        }),
    );
    await button(page, 'sendUnlinkMail').trigger('click');
    expect(button(page, 'sendUnlinkMail').attributes('disabled')).toBeDefined();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    accept();
    await flushPromises();
    expect(page.find('[role="dialog"]').exists()).toBe(false);
    expect(page.get('aside').text()).toContain('email-auth.waitingLink');
    expect(mocks.verify).not.toHaveBeenCalled();
  } finally {
    page.unmount();
  }
});

it('keeps an empty recipient slot and a retry action when unlink details fail to load', async () => {
  const page = render('');
  try {
    await flushPromises();
    mocks.status.mockRejectedValueOnce(new Error('offline'));
    await button(page, 'unlink').trigger('click');
    await flushPromises();

    const placeholder = page.get(
      '[data-testid="unlink-recipient-placeholder"]',
    );
    expect(placeholder.text()).toBe('email-auth.unlinkRecipient');
    expect(placeholder.find('.ant-skeleton-input').exists()).toBe(true);
    expect(placeholder.attributes('aria-busy')).toBe('false');
    expect(page.find('[role="dialog"] [role="alert"]').exists()).toBe(false);
    expect(requestTip()).toBe('ui.fallback.http.networkError');

    await button(page, 'retryUnlink').trigger('click');
    await flushPromises();
    expect(
      page.find('[data-testid="unlink-recipient-placeholder"]').exists(),
    ).toBe(false);
    expect(button(page, 'canReceive').exists()).toBe(true);
  } finally {
    page.unmount();
  }
});

it('shows a transient message when resending while waiting for email confirmation fails', async () => {
  mocks.status.mockResolvedValue({ ...status, ...ticket, retry_at: 0 });
  mocks.send.mockRejectedValueOnce(new Error('offline'));
  const page = render();
  try {
    await flushPromises();
    await button(page, 'resend').trigger('click');
    await flushPromises();
    expect(page.get('aside').text()).toContain('email-auth.waitingLink');
    expect(page.get('aside').find('[role="alert"]').exists()).toBe(false);
    expect(requestTip()).toBe('ui.fallback.http.networkError');
  } finally {
    page.unmount();
  }
});

it('shows the email confirmation during cooldown and disables sending until the cooldown ends', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  mocks.status.mockResolvedValue({
    ...status,
    retry_at: status.server_time + 1000,
  });
  const page = render();
  try {
    await flushPromises();
    await button(page, 'unlink').trigger('click');
    await flushPromises();
    await button(page, 'canReceive').trigger('click');
    expect(button(page, 'countdown').attributes('disabled')).toBeDefined();
    expect(button(page, 'backUnlink').attributes('disabled')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1250);
    expect(
      button(page, 'sendUnlinkMail').attributes('disabled'),
    ).toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  } finally {
    page.unmount();
    vi.useRealTimers();
  }
});
