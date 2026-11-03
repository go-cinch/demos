import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QRCode } from 'ant-design-vue';
import { rememberAuthRequirements } from '#/api/auth-headers';
import MFAEnrollment from './mfa-enrollment.vue';
const calls = vi.hoisted(() => ({
  status: vi.fn(), begin: vi.fn(), confirm: vi.fn(), accept: vi.fn(), current: true,
}));
vi.mock('#/api/core/auth', () => ({ getMFAStatusApi: calls.status, beginMFAEnrollmentApi: calls.begin, confirmMFAEnrollmentApi: calls.confirm }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ acceptSession: calls.accept, captureSession: () => () => calls.current }) }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); calls.current = true; });

describe('authenticator enrollment form', () => {
  it('keeps personal enrollment in the modal and reports its stage and busy state', async () => {
    let resolveSetup!: (value: unknown) => void;
    calls.begin.mockReturnValue(new Promise(resolve => { resolveSetup = resolve; }));
    const wrapper = mount(MFAEnrollment, { global: { stubs: { QRCode: true } } });
    try {
      expect(wrapper.find('.mfa-steps').exists()).toBe(false);
      expect(wrapper.emitted('stage')?.at(-1)).toEqual(['password']);
      await wrapper.get('input[name="mfa_password"]').setValue('  password  ');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      expect(calls.begin).toHaveBeenCalledWith('  password  ');
      expect(wrapper.emitted('busy')?.at(-1)).toEqual([true]);
      expect(wrapper.get('.mfa-cancel').attributes('disabled')).toBeDefined();
      resolveSetup({ secret: 'setup-key', uri: 'otpauth://totp/test', expired_at: Date.now() + 60_000 }); await flushPromises();
      expect(wrapper.emitted('stage')?.at(-1)).toEqual(['scan']);
      expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);
      expect(wrapper.findAll('input[name="mfa_code"]')).toHaveLength(1);
      await wrapper.get('.mfa-cancel').trigger('click');
      expect(wrapper.emitted('cancel')).toHaveLength(1);
      expect(calls.confirm).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it.each([
    { mode: 'personal enrollment', mandatory: false, passwordReset: false },
    { mode: 'mandatory enrollment or re-enrollment', mandatory: true, passwordReset: false },
    { mode: 'mandatory enrollment before password reset', mandatory: true, passwordReset: true },
  ])('preserves recovery codes and the same acknowledgment in $mode', async ({ mandatory, passwordReset }) => {
    const codes = Array.from({ length: 10 }, (_, index) => `${String(index + 1).padStart(8, '0')}-a1b2c3d4-e5f6a7b8-c9d0e1f2`);
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({ secret: 'setup-key', uri: 'otpauth://totp/test', expired_at: Date.now() + 60_000 });
    const result = { access_token: 'replacement', refresh_token: 'replacement-refresh', recovery_codes: codes };
    if (passwordReset) rememberAuthRequirements(result, { 'X-Password-Reset-Required': 'true' });
    calls.confirm.mockResolvedValue(result);
    const wrapper = mount(MFAEnrollment, { props: { mandatory }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      if (!mandatory) {
        await wrapper.get('input[name="mfa_password"]').setValue('password');
        await wrapper.get('form').trigger('submit'); await flushPromises();
      }
      await wrapper.get('input[name="mfa_code"]').setValue('123456');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      expect(calls.accept).toHaveBeenCalledWith(result);
      expect(wrapper.get('[data-testid="mfa-recovery-codes"]').findAll('li').map(item => item.text())).toEqual(codes);
      expect(wrapper.get('.mfa-copy').text()).toBe('mfa.copyRecovery');
      expect(wrapper.emitted('stage')?.at(-1)).toEqual(['recovery']);
      expect(wrapper.emitted('complete')).toBeUndefined();
      expect(wrapper.get('[data-testid="mfa-save-recovery"]').text()).toBe('mfa.saved');
      await wrapper.get('[data-testid="mfa-save-recovery"]').trigger('click');
      expect(wrapper.emitted('complete')?.[0]).toEqual([result]);
    } finally { wrapper.unmount(); }
  });

  it('uses the final form slots while the initial status and QR code load', async () => {
    let resolveStatus!: (value: unknown) => void;
    let resolveSetup!: (value: unknown) => void;
    calls.status.mockReturnValue(new Promise(resolve => { resolveStatus = resolve; }));
    calls.begin.mockReturnValue(new Promise(resolve => { resolveSetup = resolve; }));
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      expect(wrapper.attributes('aria-busy')).toBe('true');
      expect(wrapper.find('.mfa-qr-frame').exists()).toBe(true);
      expect(wrapper.find('.mfa-field-control').exists()).toBe(true);
      expect(wrapper.find('.mfa-primary-shell').exists()).toBe(true);
      expect(wrapper.find('.mfa-manual-content').exists()).toBe(false);
      const heading = wrapper.get('.mfa-heading').text();
      resolveStatus({ password_required: false }); await flushPromises();
      expect(wrapper.attributes('aria-busy')).toBe('true');
      resolveSetup({ secret: 'first-key', uri: 'otpauth://totp/first', expired_at: Date.now() + 60_000 }); await flushPromises();
      expect(wrapper.attributes('aria-busy')).toBe('false');
      expect(wrapper.get('.mfa-heading').text()).toBe(heading);
      expect(wrapper.find('.mfa-qr-frame').exists()).toBe(true);
      expect(wrapper.find('.mfa-manual-content').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
  it.each([false, true])('preserves manual-key disclosure (%s) through a deferred QR refresh', async (expanded) => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({ secret: 'old-key', uri: 'otpauth://totp/old', expired_at: Date.now() + 60_000 });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      if (expanded) await wrapper.get('.mfa-manual-toggle').trigger('click');
      let resolveSetup!: (value: unknown) => void;
      calls.begin.mockReturnValue(new Promise(resolve => { resolveSetup = resolve; }));
      wrapper.findComponent(QRCode).vm.$emit('refresh'); await flushPromises();
      expect(wrapper.attributes('aria-busy')).toBe('true');
      expect(wrapper.get('.mfa-manual-toggle').attributes('aria-expanded')).toBe(String(expanded));
      expect(wrapper.find('.mfa-manual-content').exists()).toBe(expanded);
      expect(wrapper.get('input[name="mfa_code"]').attributes('disabled')).toBeDefined();
      if (expanded) expect(wrapper.get('[data-testid="mfa-copy-secret"]').attributes('disabled')).toBeDefined();
      wrapper.findComponent(QRCode).vm.$emit('refresh'); await flushPromises();
      expect(calls.begin).toHaveBeenCalledTimes(2);
      resolveSetup({ secret: 'replacement-key', uri: 'otpauth://totp/replacement', expired_at: Date.now() + 60_000 }); await flushPromises();
      expect(wrapper.attributes('aria-busy')).toBe('false');
      expect(wrapper.get('.mfa-manual-toggle').attributes('aria-expanded')).toBe(String(expanded));
      expect(wrapper.find('.mfa-manual-content').exists()).toBe(expanded);
      if (expanded) expect(wrapper.get('[data-testid="mfa-secret"]').text()).toBe('replacement-key');
    } finally { wrapper.unmount(); }
  });
  it('retains an expanded key area through refresh failure and retry', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({ secret: 'old-key', uri: 'otpauth://totp/old', expired_at: Date.now() + 60_000 });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      await wrapper.get('.mfa-manual-toggle').trigger('click');
      calls.begin.mockRejectedValueOnce(new Error('offline'));
      wrapper.findComponent(QRCode).vm.$emit('refresh'); await flushPromises();
      expect(wrapper.get('.mfa-manual-toggle').attributes('aria-expanded')).toBe('true');
      expect(wrapper.find('.mfa-qr-failure').exists()).toBe(true);
      expect(wrapper.get('input[name="mfa_code"]').attributes('disabled')).toBeDefined();
      calls.begin.mockResolvedValue({ secret: 'retry-key', uri: 'otpauth://totp/retry', expired_at: Date.now() + 60_000 });
      await wrapper.get('.mfa-qr-failure button').trigger('click'); await flushPromises();
      expect(wrapper.get('[data-testid="mfa-secret"]').text()).toBe('retry-key');
      expect(wrapper.get('.mfa-manual-toggle').attributes('aria-expanded')).toBe('true');
    } finally { wrapper.unmount(); }
  });
  it('rejects incomplete codes without sending confirmation', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({ secret: 'setup-secret', uri: 'otpauth://totp/test', expired_at: Date.now() + 60_000 });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      await wrapper.get('input[name="mfa_code"]').setValue('123');
      await wrapper.get('form').trigger('submit');
      expect(calls.confirm).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('mfa.codeRequired');
    } finally { wrapper.unmount(); }
  });
  it('refreshes an expired direct enrollment without asking for a password', async () => {
    vi.useFakeTimers();
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({ secret: 'setup-secret', uri: 'otpauth://totp/test', expired_at: Date.now() + 1000 });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1001);
      expect(wrapper.get('input[name="mfa_code"]').attributes('disabled')).toBeDefined();
      expect(wrapper.findComponent(QRCode).props('status')).toBe('expired');
      calls.begin.mockResolvedValue({ secret: 'new-secret', uri: 'otpauth://totp/new', expired_at: Date.now() + 60_000 });
      wrapper.findComponent(QRCode).vm.$emit('refresh');
      await flushPromises();
      expect(calls.begin).toHaveBeenCalledTimes(2);
      expect(wrapper.find('input[name="mfa_password"]').exists()).toBe(false);
      expect(wrapper.get('input[name="mfa_code"]').attributes('disabled')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
  it('loads a QR code directly for a server-authorized reset session', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockResolvedValue({ secret: 'reset-secret', uri: 'otpauth://totp/test', expired_at: Date.now() + 60_000 });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      expect(wrapper.find('input[name="mfa_password"]').exists()).toBe(false);
      await flushPromises();
      expect(calls.begin).toHaveBeenCalledWith(undefined);
      expect(wrapper.find('input[name="mfa_password"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="mfa-secret"]').exists()).toBe(false);
      await wrapper.get('.mfa-manual-toggle').trigger('click');
      expect(wrapper.get('[data-testid="mfa-secret"]').text()).toBe('reset-secret');
      expect(wrapper.find('input[name="mfa_code"]').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });
  it('keeps password verification when the server reports no reset grant', async () => {
    calls.status.mockResolvedValue({ password_required: true });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true } });
    try {
      await flushPromises();
      expect(wrapper.find('input[name="mfa_password"]').exists()).toBe(true);
      expect(calls.begin).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });
  it('offers retry after automatic setup fails without adding a password step', async () => {
    calls.status.mockResolvedValue({ password_required: false });
    calls.begin.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ secret: 'retry-secret', uri: 'otpauth://totp/test' });
    const wrapper = mount(MFAEnrollment, { props: { mandatory: true }, global: { stubs: { QRCode: true } } });
    try {
      await flushPromises();
      expect(wrapper.find('input[name="mfa_password"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('mfa.failed');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      await wrapper.get('.mfa-manual-toggle').trigger('click');
      expect(wrapper.get('[data-testid="mfa-secret"]').text()).toBe('retry-secret');
    } finally { wrapper.unmount(); }
  });
  it('submits the real Ant form and requires recovery acknowledgment before completion', async () => {
    calls.begin.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/test', expired_at: Date.now() + 60_000 });
    const result = { access_token: 'replacement', refresh_token: 'replacement-refresh', recovery_codes: ['recovery-one'] };
    calls.confirm.mockResolvedValue(result);
    const wrapper = mount(MFAEnrollment, { attachTo: document.body, global: { stubs: { QRCode: true } } });
    try {
      await wrapper.get('input[name="mfa_password"]').setValue('password');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      expect(calls.begin).toHaveBeenCalledWith('password');
      await wrapper.get('input[name="mfa_code"]').setValue('123456');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      expect(calls.confirm).toHaveBeenCalledWith('123456');
      expect(calls.accept).toHaveBeenCalledWith(result);
      expect(wrapper.emitted('complete')).toBeUndefined();
      await wrapper.get('[data-testid="mfa-save-recovery"]').trigger('click');
      expect(wrapper.emitted('complete')).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });
  it('does not install a late enrollment response after the session changes', async () => {
    calls.begin.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/test', expired_at: Date.now() + 60_000 });
    let complete!: (result: unknown) => void;
    calls.confirm.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const wrapper = mount(MFAEnrollment, { global: { stubs: { QRCode: true } } });
    try {
      await wrapper.get('input[name="mfa_password"]').setValue('password');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      await wrapper.get('input[name="mfa_code"]').setValue('123456');
      await wrapper.get('form').trigger('submit'); await flushPromises();
      calls.current = false;
      complete({ access_token: 'stale', recovery_codes: [] }); await flushPromises();
      expect(calls.accept).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });
});
