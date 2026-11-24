import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, describe, expect, it, vi } from 'vitest';

import TOTPSetting from './totp-setting.vue';

const calls = vi.hoisted(() => ({
  status: vi.fn(),
  restartRecovery: vi.fn(),
  prompt: vi.fn(),
}));
vi.mock('#/api/core/auth', () => ({ getTOTPBindingApi: calls.status }));
vi.mock('@vben/icons', () => ({
  IconifyIcon: { template: '<svg aria-hidden="true" />' },
}));
const grants = vi.hoisted(() => vi.fn((_action: string) => true));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasProfileAction: grants }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    fetchUserInfo: vi.fn(),
    openTOTPRecovery: calls.restartRecovery,
  }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/security/verification-prompt', () => ({
  requestVerification: calls.prompt,
  VerificationCancelled: class extends Error {},
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('profile authenticator recovery', () => {
  it('opens the account recovery dialog for a bound authenticator', async () => {
    calls.status.mockResolvedValue({ bound: true });
    const page = mount(TOTPSetting, {
      global: { stubs: { AccountRecovery: true } },
    });
    try {
      await flushPromises();
      const recover = page.get('[data-testid="totp-restart-recovery"]');
      expect(recover.text()).toBe('verification.authenticatorUnavailable');
      await recover.trigger('click');
      expect(page.find('account-recovery-stub').exists()).toBe(true);
      expect(page.find('.totp-recovery-cue').exists()).toBe(false);
      expect(calls.restartRecovery).not.toHaveBeenCalled();
      expect(page.find('input').exists()).toBe(false);
    } finally {
      page.unmount();
    }
  });

  it('waits for binding status before opening requested recovery and supports another request on the same page', async () => {
    vi.useFakeTimers();
    let resolveStatus!: (value: { bound: boolean }) => void;
    calls.status.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const page = mount(TOTPSetting, {
      props: { recoveryRequested: true },
      global: { stubs: { AccountRecovery: true } },
    });
    try {
      expect(page.find('account-recovery-stub').exists()).toBe(false);
      expect(page.emitted('recoveryOpened')).toBeUndefined();
      resolveStatus({ bound: true });
      await flushPromises();
      expect(page.find('.totp-recovery-cue').exists()).toBe(true);
      expect(page.find('account-recovery-stub').exists()).toBe(false);
      await vi.advanceTimersByTimeAsync(950);
      expect(page.find('.totp-recovery-cue').exists()).toBe(false);
      expect(page.find('account-recovery-stub').exists()).toBe(true);
      expect(page.emitted('recoveryOpened')).toHaveLength(1);
      await page.setProps({ recoveryRequested: false });
      page.getComponent({ name: 'AccountRecovery' }).vm.$emit('close');
      await flushPromises();
      expect(page.find('account-recovery-stub').exists()).toBe(false);
      await page.setProps({ recoveryRequested: true });
      expect(page.find('.totp-recovery-cue').exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(950);
      expect(page.find('account-recovery-stub').exists()).toBe(true);
      expect(page.emitted('recoveryOpened')).toHaveLength(2);
    } finally {
      page.unmount();
    }
  });

  it.each([
    new Error('Network Error'),
    { response: { status: 502 } },
    { response: { status: 500, data: { msg: 'Service unavailable' } } },
  ])(
    'shows a retry action without offering enrollment on a failed status read: %j',
    async (cause) => {
      calls.status.mockRejectedValueOnce(cause);
      const page = mount(TOTPSetting, {
        props: { recoveryRequested: true },
        global: { stubs: { AccountRecovery: true, TOTPEnrollment: true } },
      });
      try {
        await flushPromises();
        expect(page.get('.ant-alert').text()).toContain('app.errors.dataLoad');
        expect(page.find('.security-section-actions button').exists()).toBe(
          false,
        );
        expect(page.find('[data-testid="totp-test"]').exists()).toBe(false);
        expect(page.emitted('recoveryOpened')).toBeUndefined();
        calls.status.mockResolvedValueOnce({ bound: false });
        await page.get('.ant-alert button').trigger('click');
        await flushPromises();
        expect(page.get('.security-section-actions button').text()).toBe(
          'verification.beginBinding',
        );
      } finally {
        page.unmount();
      }
    },
  );

  it('lets a manual click interrupt the cue without reopening the dialog after it is closed', async () => {
    vi.useFakeTimers();
    calls.status.mockResolvedValue({ bound: true });
    const page = mount(TOTPSetting, {
      props: { recoveryRequested: true },
      global: { stubs: { AccountRecovery: true } },
    });
    try {
      await flushPromises();
      expect(page.find('.totp-recovery-cue').exists()).toBe(true);
      await page.setProps({ recoveryRequested: false });
      await page.get('[data-testid="totp-restart-recovery"]').trigger('click');
      expect(page.find('.totp-recovery-cue').exists()).toBe(false);
      expect(page.find('account-recovery-stub').exists()).toBe(true);
      page.getComponent({ name: 'AccountRecovery' }).vm.$emit('close');
      await vi.advanceTimersByTimeAsync(1200);
      expect(page.find('account-recovery-stub').exists()).toBe(false);
    } finally {
      page.unmount();
    }
  });

  it('keeps initial enrollment available when no authenticator is bound', async () => {
    calls.status.mockResolvedValue({ bound: false });
    const page = mount(TOTPSetting, {
      global: { stubs: { AccountRecovery: true } },
    });
    try {
      await flushPromises();
      expect(page.find('[data-testid="totp-restart-recovery"]').exists()).toBe(
        false,
      );
      expect(page.find('[data-testid="totp-test"]').exists()).toBe(false);
      expect(page.text()).toContain('verification.beginBinding');
      expect(calls.restartRecovery).not.toHaveBeenCalled();
    } finally {
      page.unmount();
    }
  });

  it('opens a dedicated test before the recovery action without restarting login', async () => {
    calls.status.mockResolvedValue({ bound: true });
    let complete!: () => void;
    calls.prompt.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const page = mount(TOTPSetting, {
      global: { stubs: { AccountRecovery: true } },
    });
    try {
      await flushPromises();
      const actions = page.findAll('.totp-card-actions button');
      expect(actions.map((button) => button.text())).toEqual([
        'verification.test',
        'verification.authenticatorUnavailable',
      ]);
      await page.get('[data-testid="totp-test"]').trigger('click');
      expect(calls.prompt).toHaveBeenCalledExactlyOnceWith('test');
      expect(
        page
          .get('[data-testid="totp-restart-recovery"]')
          .attributes('disabled'),
      ).toBeDefined();
      expect(calls.restartRecovery).not.toHaveBeenCalled();
      complete();
      await flushPromises();
      expect(
        page
          .get('[data-testid="totp-restart-recovery"]')
          .attributes('disabled'),
      ).toBeUndefined();
    } finally {
      page.unmount();
    }
  });

  it('keeps enrollment inline, supports collapse and refreshes status after completion', async () => {
    calls.status
      .mockResolvedValueOnce({ bound: false })
      .mockResolvedValueOnce({ bound: true });
    const page = mount(TOTPSetting, {
      global: { stubs: { AccountRecovery: true, TOTPEnrollment: true } },
    });
    try {
      await flushPromises();
      const toggle = page.get('.security-section-actions button');
      expect(toggle.attributes('aria-expanded')).toBe('false');
      await toggle.trigger('click');
      expect(
        page.find('m-f-a-enrollment-stub').exists() ||
          page.findComponent({ name: 'TOTPEnrollment' }).exists(),
      ).toBe(true);
      expect(calls.prompt).not.toHaveBeenCalled();
      await toggle.trigger('click');
      expect(toggle.attributes('aria-expanded')).toBe('false');
      await toggle.trigger('click');
      page
        .getComponent({ name: 'TOTPEnrollment' })
        .vm.$emit('stage', 'recovery');
      await flushPromises();
      expect(page.get('.security-section-title').text()).toContain(
        'verification.enabled',
      );
      expect(page.find('[data-testid="totp-test"]').exists()).toBe(false);
      expect(page.find('[data-testid="totp-restart-recovery"]').exists()).toBe(
        false,
      );
      expect(page.find('.security-section-actions button').exists()).toBe(
        false,
      );
      page.getComponent({ name: 'TOTPEnrollment' }).vm.$emit('complete', {});
      await flushPromises();
      expect(calls.status).toHaveBeenCalledTimes(2);
      expect(page.find('[data-testid="totp-test"]').exists()).toBe(true);
    } finally {
      page.unmount();
    }
  });
});

it('shows testing independently of recovery permission for a bound factor', async () => {
  grants.mockImplementation((action) => action === 'test_totp');
  calls.status.mockResolvedValue({ bound: true });
  const page = mount(TOTPSetting, {
    props: { recoveryRequested: true },
    global: { stubs: { AccountRecovery: true } },
  });
  try {
    await flushPromises();
    expect(page.find('[data-testid="totp-test"]').exists()).toBe(true);
    expect(page.find('[data-testid="totp-restart-recovery"]').exists()).toBe(
      false,
    );
    expect(page.find('account-recovery-stub').exists()).toBe(false);
  } finally {
    page.unmount();
    grants.mockImplementation(() => true);
  }
});
