import { flushPromises, mount } from '@vue/test-utils';

import { userCache } from '@vben/utils/cache';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import Login from './login.vue';

const mocks = vi.hoisted(() => ({
  properties: vi.fn(),
  status: vi.fn(),
  check: vi.fn(),
  send: vi.fn(),
  login: vi.fn(),
}));
vi.mock('#/api/core/auth', () => ({
  getLoginEmailCodeStatusApi: mocks.status,
  sendLoginEmailCodeApi: mocks.send,
  getLoginFailure: (cause: unknown) =>
    (cause as { response?: { data?: unknown } })?.response?.data,
}));
vi.mock('#/store/system-properties', () => ({
  loadSystemProperties: mocks.properties,
}));
vi.mock('#/store', () => ({
  consumeRegistrationLogin: () => undefined,
  useAuthStore: () => ({
    resetLoginVerification: vi.fn(),
    checkLoginVerification: mocks.check,
    authLogin: mocks.login,
    acceptLoginCaptcha: vi.fn(),
  }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const draftKey = userCache.anonymous('session').key('email-login');

describe('public email login setting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.setItem(
      draftKey,
      JSON.stringify({ username: 'tester@example.com', method: 'email_code' }),
    );
  });

  it.each(['enabled', 'disabled', 'unavailable'])(
    'restores an email draft only when enabled (%s)',
    async (mode) => {
      if (mode === 'unavailable') mocks.properties.mockResolvedValue(undefined);
      else
        mocks.properties.mockResolvedValue({
          email_enabled: mode === 'enabled',
        });
      mocks.status.mockResolvedValue({ server_time: 1000, retry_at: 0 });

      const page = mount(Login, {
        global: { stubs: { LoginAccountInput: true } },
      });
      try {
        expect(page.find('.email-auth-switch').exists()).toBe(false);
        await flushPromises();
        expect(mocks.properties).toHaveBeenCalledOnce();
        expect(page.find('.email-auth-switch').exists()).toBe(
          mode === 'enabled',
        );
        expect(
          page.find('input[autocomplete="current-password"]').exists(),
        ).toBe(mode !== 'enabled');
        expect(mocks.status).toHaveBeenCalledTimes(mode === 'enabled' ? 1 : 0);
        const identifier = page.get('#login-identifier');
        expect(identifier.attributes('aria-label')).toBe(
          mode === 'enabled' ? 'email-auth.email' : 'system.fields.username',
        );
        expect(identifier.attributes('placeholder')).toBe(
          mode === 'enabled'
            ? 'name@example.com'
            : 'authentication.usernameTip',
        );
        expect(identifier.attributes('modelvalue') ?? '').toBe(
          mode === 'enabled' ? 'tester@example.com' : '',
        );
        expect(sessionStorage.getItem(draftKey) !== null).toBe(
          mode === 'enabled',
        );
      } finally {
        page.unmount();
        sessionStorage.clear();
      }
    },
  );

  it.each([500, 502, 503, 504])(
    'avoids duplicating the global toast when restoring a draft returns %s',
    async (status) => {
      mocks.properties.mockResolvedValue({ email_enabled: true });
      mocks.status.mockRejectedValue({ response: { status } });
      const page = mount(Login, {
        global: { stubs: { LoginAccountInput: true } },
      });
      try {
        await flushPromises();
        expect(mocks.status).toHaveBeenCalledWith(
          expect.any(String),
          'tester@example.com',
        );
        const feedback = page.find('.login-request-feedback');
        expect(feedback.exists()).toBe(false);
      } finally {
        page.unmount();
        sessionStorage.clear();
      }
    },
  );
});

describe('email-code login address validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    mocks.properties.mockResolvedValue({ email_enabled: true });
    mocks.status.mockResolvedValue({ server_time: 1000, retry_at: 0 });
  });

  const accountInput = {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
  };
  function openLogin() {
    return mount(Login, {
      global: {
        stubs: { LoginAccountInput: accountInput, ServerSliderCaptcha: true },
      },
    });
  }

  it.each([
    'super',
    'user@',
    '@example.com',
    'user@example',
    'user@@example.com',
    'user name@example.com',
  ])('rejects %s before verification or sending', async (address) => {
    const page = openLogin();
    try {
      await flushPromises();
      await page.get('.email-auth-switch').trigger('click');
      await page.get('#login-identifier').setValue(address);
      await page.get('#login-identifier').trigger('blur');
      expect(page.get('#login-identifier-error').text()).toBe(
        'email-auth.emailRequired',
      );
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.get('#login-identifier').attributes('aria-invalid')).toBe(
        'true',
      );
      expect(page.find('.email-auth-human').exists()).toBe(false);
      expect(mocks.status).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        '',
      );
      expect(mocks.check).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      await page.get('#login-identifier').setValue(' Person+tag@Example.COM ');
      expect(page.find('#login-identifier-error').exists()).toBe(false);
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(mocks.check).toHaveBeenCalledWith('Person+tag@Example.COM');
      expect(page.find('.email-auth-human').exists()).toBe(true);
    } finally {
      page.unmount();
    }
  });

  it('does not restore an old username-only email-code draft', async () => {
    sessionStorage.setItem(
      draftKey,
      JSON.stringify({ username: 'super', method: 'email_code' }),
    );
    const page = openLogin();
    try {
      await flushPromises();
      expect(mocks.status).not.toHaveBeenCalled();
      expect(page.find('#login-email-code').exists()).toBe(false);
      await page.get('form').trigger('submit');
      expect(page.get('#login-identifier-error').text()).toBe(
        'email-auth.emailRequired',
      );
      await page.get('.email-auth-switch').trigger('click');
      await page.get('#login-password').setValue('password');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(page.find('#login-identifier-error').exists()).toBe(false);
      expect(mocks.check).toHaveBeenCalledWith('super');
    } finally {
      page.unmount();
      sessionStorage.clear();
    }
  });

  it('opens the code step during a shared cooldown and lets the user send when it ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'performance'] });
    mocks.check.mockResolvedValue({ server_time: 1000, retry_at: 4000 });
    const page = openLogin();
    try {
      await flushPromises();
      await page.get('.email-auth-switch').trigger('click');
      await page.get('#login-identifier').setValue('user@example.com');
      await vi.advanceTimersByTimeAsync(300);

      expect(page.get('h1').text()).toBe('app.journey.title 👋🏻');
      expect(page.text()).not.toContain('verification.backToLogin');
      expect(page.find('#login-identifier').exists()).toBe(false);
      expect(
        page.get('#login-email-code').attributes('disabled'),
      ).toBeDefined();
      expect(
        page.get('.email-auth-primary').attributes('disabled'),
      ).toBeDefined();
      const resend = page.get('.email-auth-resend button');
      expect(resend.text()).toBe('email-auth.countdown');
      expect(resend.attributes('disabled')).toBeDefined();

      await vi.advanceTimersByTimeAsync(3250);
      expect(resend.text()).toBe('email-auth.send');
      expect(resend.attributes('disabled')).toBeUndefined();
      await resend.trigger('click');
      expect(page.find('.email-auth-human').exists()).toBe(true);
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      page.unmount();
      vi.useRealTimers();
    }
  });

  it('recovers the same email’s code when a simultaneous send returns only a cooldown', async () => {
    mocks.status
      .mockResolvedValueOnce({ server_time: 1000, retry_at: 0 })
      .mockResolvedValue({
        server_time: 1000,
        retry_at: 0,
        verification_id: 'existing-code',
        expired_at: 120_000,
      });
    mocks.send.mockRejectedValue({
      response: {
        data: {
          error_code: 'AUTH_EMAIL_COOLDOWN',
          server_time: 1000,
          retry_at: 61_000,
        },
      },
    });
    const page = openLogin();
    try {
      await flushPromises();
      await page.get('.email-auth-switch').trigger('click');
      await page.get('#login-identifier').setValue('user@example.com');
      await page.get('form').trigger('submit');
      page
        .findComponent({ name: 'ServerSliderCaptcha' })
        .vm.$emit('update:modelValue', 'proof');
      await flushPromises();

      expect(mocks.status).toHaveBeenLastCalledWith(
        expect.any(String),
        'user@example.com',
      );
      expect(page.get('h1').text()).toBe('app.journey.title 👋🏻');
      expect(
        page.get('.email-auth-resend button').attributes('disabled'),
      ).toBeDefined();
      await page.get('#login-email-code').setValue('123456');
      await page.get('form').trigger('submit');
      expect(mocks.login).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          username: 'user@example.com',
          verification_id: 'existing-code',
          verification_code: '123456',
        }),
      );
      expect(mocks.send).toHaveBeenCalledOnce();
    } finally {
      page.unmount();
    }
  });

  it('shows a server mailbox rejection beside the editable address without a countdown', async () => {
    mocks.send.mockRejectedValue({
      response: { data: { error_code: 'AUTH_EMAIL_ADDRESS_INVALID' } },
    });
    const page = openLogin();
    try {
      await flushPromises();
      await page.get('.email-auth-switch').trigger('click');
      await page.get('#login-identifier').setValue('user@example.com');
      await page.get('form').trigger('submit');
      await flushPromises();
      page
        .findComponent({ name: 'ServerSliderCaptcha' })
        .vm.$emit('update:modelValue', 'proof');
      await flushPromises();
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(page.get('#login-identifier-error').text()).toBe(
        'email-auth.emailRequired',
      );
      expect(page.find('#login-email-code').exists()).toBe(false);
      expect(page.find('.email-auth-resend').exists()).toBe(false);
    } finally {
      page.unmount();
    }
  });
});

describe('password login input matrix', () => {
  it.each([
    {
      variant: 'username-empty',
      username: '',
      password: 'valid-password',
      field: 'identifier',
    },
    {
      variant: 'username-blank',
      username: '   ',
      password: 'valid-password',
      field: 'identifier',
    },
    {
      variant: 'password-empty',
      username: 'valid-user',
      password: '',
      field: 'password',
    },
    {
      variant: 'password-blank',
      username: 'valid-user',
      password: '   ',
      field: 'password',
    },
  ])(
    '$variant blocks verification and can be corrected',
    async ({ username, password, field }) => {
      vi.resetAllMocks();
      sessionStorage.clear();
      mocks.properties.mockResolvedValue({ email_enabled: false });
      mocks.check.mockResolvedValue(undefined);
      const page = mount(Login, {
        global: {
          stubs: {
            LoginAccountInput: {
              props: ['modelValue'],
              emits: ['update:modelValue'],
              template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
            },
            ServerSliderCaptcha: true,
          },
        },
      });
      try {
        await flushPromises();
        await page.get('#login-identifier').setValue(username);
        await page.get('#login-password').setValue(password);
        await page.get('form').trigger('submit');
        await flushPromises();
        expect(page.get(`#login-${field}`).attributes('aria-invalid')).toBe(
          'true',
        );
        expect(mocks.check).not.toHaveBeenCalled();
        expect(mocks.login).not.toHaveBeenCalled();
        expect(page.find('.email-auth-human').exists()).toBe(false);
        await page.get('#login-identifier').setValue('valid-user');
        await page.get('#login-password').setValue('valid-password');
        await page.get('form').trigger('submit');
        await flushPromises();
        expect(mocks.check).toHaveBeenCalledWith('valid-user');
        expect(page.find('.email-auth-human').exists()).toBe(true);
        expect(mocks.login).not.toHaveBeenCalled();
      } finally {
        page.unmount();
        sessionStorage.clear();
      }
    },
  );
});
