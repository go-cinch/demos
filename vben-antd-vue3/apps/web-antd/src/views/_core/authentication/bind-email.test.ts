import { flushPromises, mount } from '@vue/test-utils';

import { message } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import BindEmail from './bind-email.vue';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  status: vi.fn(),
  send: vi.fn(),
  bind: vi.fn(),
  complete: vi.fn(),
  skip: vi.fn(),
  logout: vi.fn(),
  auth: { emailBindingRequired: false },
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    captureSession: () => () => true,
    fetchUserInfo: mocks.info,
    completeEmailBinding: mocks.complete,
    skipEmailBinding: mocks.skip,
    continueLogin: vi.fn(),
    logout: mocks.logout,
    get emailBindingRequired() {
      return mocks.auth.emailBindingRequired;
    },
  }),
}));
vi.mock('#/api/core/auth', () => ({
  bindEmailApi: mocks.bind,
  getBindEmailCodeStatusApi: mocks.status,
  sendBindEmailCodeApi: mocks.send,
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.auth.emailBindingRequired = false;
  mocks.status
    .mockReset()
    .mockResolvedValue({ server_time: 1000, retry_at: 0 });
  mocks.info.mockResolvedValue({
    userId: '7',
    email: '',
    emailBindingRequired: false,
  });
});

describe('initial email binding', () => {
  it.each([false, true])(
    'uses the info binding policy (required=%s)',
    async (required) => {
      mocks.info.mockResolvedValue({
        userId: '7',
        email: '',
        emailBindingRequired: required,
      });
      const page = mount(BindEmail);
      try {
        await flushPromises();
        expect(mocks.info).toHaveBeenCalledWith({ fresh: true });
        expect(
          page
            .findAll('button')
            .some((button) => button.text() === 'email-auth.skip'),
        ).toBe(!required);
        expect(mocks.send).not.toHaveBeenCalled();
        const logout = page.get('.onboarding-sign-out button');
        expect(logout.text()).toBe('verification.logout');
        await logout.trigger('click');
        expect(mocks.logout).toHaveBeenCalledExactlyOnceWith(false);
      } finally {
        page.unmount();
      }
    },
  );

  it('keeps a usable email form when the profile request returns 502', async () => {
    mocks.info.mockRejectedValueOnce({ response: { status: 502 } });
    mocks.send.mockResolvedValueOnce({
      server_time: 1000,
      retry_at: 61_000,
      expired_at: 301_000,
      verification_id: 'new-code',
    });
    sessionStorage.setItem(
      'cinch-email-binding-context',
      JSON.stringify({ userID: '7', address: 'old@example.com' }),
    );
    const page = mount(BindEmail);
    try {
      await flushPromises();
      const email = page.get<HTMLInputElement>('#binding-email');
      expect(email.element.value).toBe('');
      expect(email.element.disabled).toBe(false);
      expect(page.find('.email-binding-error').exists()).toBe(false);
      expect(page.find('.email-binding-secondary').exists()).toBe(false);
      expect(mocks.status).not.toHaveBeenCalled();

      await email.setValue('tester@example.com');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
        browser_uuid: expect.any(String),
        email: 'tester@example.com',
      });
      expect(page.find('#binding-code').exists()).toBe(true);
    } finally {
      page.unmount();
    }
  });

  it('restores the sent-code step after hydration without sending again', async () => {
    sessionStorage.setItem(
      'cinch-email-binding-context',
      JSON.stringify({ userID: '7', address: 'tester@example.com' }),
    );
    mocks.status.mockResolvedValue({
      server_time: 1000,
      retry_at: 61_000,
      expired_at: 301_000,
      verification_id: 'verification',
    });
    const page = mount(BindEmail);
    try {
      await flushPromises();
      expect(mocks.status).toHaveBeenCalledWith(
        expect.any(String),
        'tester@example.com',
        { suppressErrorMessage: true },
      );
      expect(page.find('#binding-code').exists()).toBe(true);
      expect(page.find('#binding-email').exists()).toBe(false);
      await page.get('#binding-code').setValue('123456');
      await flushPromises();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.bind).not.toHaveBeenCalled();
    } finally {
      page.unmount();
    }
  });

  it('shows pending feedback on Skip alone', async () => {
    let finish!: () => void;
    mocks.skip.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const page = mount(BindEmail);
    try {
      await flushPromises();
      const skip = page.get('.email-binding-secondary');
      await skip.trigger('click');
      expect(skip.classes()).toContain('ant-btn-loading');
      expect(page.get('.ant-btn-primary').classes()).not.toContain(
        'ant-btn-loading',
      );
      expect(page.get('.ant-btn-primary').attributes('disabled')).toBeDefined();
      expect(
        page.get('.onboarding-sign-out button').attributes('disabled'),
      ).toBeDefined();
    } finally {
      finish();
      await flushPromises();
      page.unmount();
    }
  });

  it('shows a toast for a failed skip and keeps the form usable', async () => {
    mocks.skip.mockRejectedValueOnce(new Error('Could not continue'));
    const toast = vi.spyOn(message, 'error');
    const page = mount(BindEmail);
    try {
      await flushPromises();
      const skip = page.get('.email-binding-secondary');
      await skip.trigger('click');
      await flushPromises();
      expect(toast).toHaveBeenCalledExactlyOnceWith('email-auth.requestFailed');
      expect(page.find('.email-binding-error').exists()).toBe(false);
      expect(skip.classes()).not.toContain('ant-btn-loading');
      expect(page.get('#binding-email').attributes('disabled')).toBeUndefined();
    } finally {
      page.unmount();
      toast.mockRestore();
    }
  });

  it('withdraws Skip if the refreshed server policy becomes mandatory', async () => {
    mocks.skip.mockImplementation(async () => {
      mocks.auth.emailBindingRequired = true;
    });
    const page = mount(BindEmail);
    try {
      await flushPromises();
      await required(
        page
          .findAll('button')
          .find((button) => button.text() === 'email-auth.skip'),
      ).trigger('click');
      await flushPromises();
      expect(mocks.skip).toHaveBeenCalledOnce();
      expect(
        page
          .findAll('button')
          .some((button) => button.text() === 'email-auth.skip'),
      ).toBe(false);
    } finally {
      page.unmount();
    }
  });
  it('does not let a delayed status lookup strand an in-flight send', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    let finish!: (value: unknown) => void;
    mocks.send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mocks.status
      .mockResolvedValueOnce({ server_time: 1000, retry_at: 0 })
      .mockResolvedValue({
        server_time: 1000,
        retry_at: 61_000,
        expired_at: 301_000,
        verification_id: 'context',
      });
    const page = mount(BindEmail);
    try {
      await flushPromises();
      await page.get('#binding-email').setValue('tester@example.com');
      await page.get('form').trigger('submit');
      expect(mocks.send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();
      expect(mocks.status).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        '',
        { suppressErrorMessage: true },
      );
      finish({
        server_time: 1000,
        retry_at: 61_000,
        expired_at: 301_000,
        verification_id: 'context',
      });
      await flushPromises();
      expect(page.find('#binding-code').exists()).toBe(true);
      expect(page.get('#binding-code').attributes('disabled')).toBeUndefined();
    } finally {
      page.unmount();
      vi.useRealTimers();
    }
  });
});
