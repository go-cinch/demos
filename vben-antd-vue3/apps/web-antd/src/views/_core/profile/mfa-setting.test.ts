import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MFASetting from './mfa-setting.vue';
import { MFACancelled } from '#/security/mfa-prompt';

const calls = vi.hoisted(() => ({ status: vi.fn(), restartRecovery: vi.fn(), prompt: vi.fn() }));
vi.mock('#/api/core/auth', () => ({ getMFAStatusApi: calls.status }));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<svg aria-hidden="true" />' } }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ restartLoginForMFARecovery: calls.restartRecovery }) }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/security/mfa-prompt', () => ({ requestMFA: calls.prompt, MFACancelled: class extends Error {} }));

afterEach(() => vi.clearAllMocks());

describe('profile authenticator recovery', () => {
  it('offers the same sign-out recovery flow for a bound authenticator', async () => {
    calls.status.mockResolvedValue({ enabled: true });
    const page = mount(MFASetting);
    try {
      await flushPromises();
      const recover = page.get('[data-testid="mfa-restart-recovery"]');
      expect(recover.text()).toBe('mfa.restartRecovery');
      await recover.trigger('click');
      expect(calls.restartRecovery).toHaveBeenCalledOnce();
      expect(page.find('input').exists()).toBe(false);
    } finally { page.unmount(); }
  });

  it('keeps initial enrollment available when no authenticator is bound', async () => {
    calls.status.mockResolvedValue({ enabled: false });
    const page = mount(MFASetting);
    try {
      await flushPromises();
      expect(page.find('[data-testid="mfa-restart-recovery"]').exists()).toBe(false);
      expect(page.find('[data-testid="mfa-test"]').exists()).toBe(false);
      expect(page.text()).toContain('mfa.beginBinding');
      expect(calls.restartRecovery).not.toHaveBeenCalled();
    } finally { page.unmount(); }
  });

  it('opens a dedicated test before the recovery action without restarting login', async () => {
    calls.status.mockResolvedValue({ enabled: true });
    let complete!: () => void;
    calls.prompt.mockReturnValue(new Promise<void>(resolve => { complete = resolve; }));
    const page = mount(MFASetting);
    try {
      await flushPromises();
      const actions = page.findAll('.mfa-card-actions button');
      expect(actions.map(button => button.text())).toEqual(['mfa.test', 'mfa.restartRecovery']);
      await page.get('[data-testid="mfa-test"]').trigger('click');
      expect(calls.prompt).toHaveBeenCalledExactlyOnceWith('test');
      expect(page.get('[data-testid="mfa-restart-recovery"]').attributes('disabled')).toBeDefined();
      expect(calls.restartRecovery).not.toHaveBeenCalled();
      complete(); await flushPromises();
      expect(page.get('[data-testid="mfa-restart-recovery"]').attributes('disabled')).toBeUndefined();
    } finally { page.unmount(); }
  });

  it('refreshes the bound state when the recovery-code screen is dismissed', async () => {
    calls.status.mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce({ enabled: true });
    calls.prompt.mockRejectedValueOnce(new MFACancelled());
    const page = mount(MFASetting);
    try {
      await flushPromises();
      await page.get('.mfa-card-actions button').trigger('click'); await flushPromises();
      expect(calls.prompt).toHaveBeenCalledExactlyOnceWith('enroll');
      expect(calls.status).toHaveBeenCalledTimes(2);
      expect(page.find('[data-testid="mfa-test"]').exists()).toBe(true);
      expect(page.text()).not.toContain('mfa.failed');
    } finally { page.unmount(); }
  });
});
