import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getBindEmailCodeStatusApi,
  getEmailUnlinkProgressApi,
  getEmailUnlinkStatusApi,
  getLoginEmailCodeStatusApi,
  getLoginRecoveryOptionsApi,
  getLoginVerificationApi,
  getMailboxCooldownApi,
  getOnboardingStatusApi,
  getSensitiveOptionsApi,
  getTOTPBindingApi,
  getTOTPStatusApi,
} from './auth';

const clients = vi.hoisted(() => ({
  publicGet: vi.fn(),
  publicPost: vi.fn(),
  authGet: vi.fn(),
  verificationGet: vi.fn(),
}));
vi.mock('#/api/request', () => ({
  authVerificationRequestClient: {
    get: clients.publicGet,
    post: clients.publicPost,
  },
  authRequestClient: { get: clients.authGet },
  authInlineVerificationRequestClient: { get: clients.verificationGet },
  authStatusRequestClient: { get: clients.authGet },
  authPublicRequestClient: {},
  authSessionRequestClient: {},
  authSilentPublicRequestClient: {},
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const code = {
  retry_at: 150,
  verification_id: 'pending',
  expired_at: 500,
  completed: false,
};

describe('verification status contracts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reads strict onboarding requirements without response headers', async () => {
    const requirements = {
      password_reset_required: true,
      totp_enrollment_required: false,
      email_binding_required: false,
    };
    clients.authGet.mockResolvedValue({ requirements });
    expect(await getOnboardingStatusApi()).toEqual(requirements);
    expect(clients.authGet).toHaveBeenCalledWith('/status', {
      params: { purpose: 'onboarding', f: 'requirements' },
    });
    expect(
      await getOnboardingStatusApi({ suppressErrorMessage: true }),
    ).toEqual(requirements);
    expect(clients.authGet).toHaveBeenLastCalledWith('/status', {
      params: { purpose: 'onboarding', f: 'requirements' },
      suppressErrorMessage: true,
    });
    clients.authGet.mockResolvedValue({ requirements: {} });
    await expect(getOnboardingStatusApi()).rejects.toThrow(
      'Invalid onboarding',
    );
  });

  it.each([false, true])(
    'reads login recovery methods with a ticket header and honors email eligibility (%s)',
    async (email) => {
      clients.publicGet.mockResolvedValue({
        methods: { recovery_code: true, email, address: 'ow***@example.test' },
      });
      expect(await getLoginRecoveryOptionsApi('ticket')).toEqual({
        address: email ? 'ow***@example.test' : '',
      });
      expect(clients.publicGet).toHaveBeenCalledExactlyOnceWith('/pub/status', {
        params: { purpose: 'login_totp_recovery', f: 'methods' },
        headers: { 'X-MFA-Ticket': 'ticket' },
        suppressErrorMessage: true,
      });
      expect(clients.authGet).not.toHaveBeenCalled();
      expect(clients.verificationGet).not.toHaveBeenCalled();
    },
  );

  it('loads account binding independently of enrollment requirements', async () => {
    clients.authGet.mockResolvedValueOnce({ totp: { bound: true } });
    expect(await getTOTPBindingApi()).toEqual({ bound: true });
    expect(clients.authGet).toHaveBeenLastCalledWith('/info', {
      params: { f: 'totp' },
    });
    clients.authGet.mockResolvedValueOnce({
      requirements: { enrollment_required: true, password_required: false },
    });
    expect(await getTOTPStatusApi()).toEqual({
      enrollment_required: true,
      password_required: false,
    });
    expect(clients.authGet).toHaveBeenLastCalledWith('/status', {
      params: { purpose: 'totp_enrollment', f: 'requirements' },
      suppressErrorMessage: true,
    });
  });

  it('combines login requirements and pending email without issuing a challenge unnecessarily', async () => {
    clients.publicGet.mockResolvedValue({
      server_time: 100,
      requirements: { captcha_required: false },
      email_code: code,
    });
    expect(await getLoginVerificationApi('owner', 'browser')).toEqual({
      captcha_required: false,
      email_code: { server_time: 100, ...code },
    });
    expect(clients.publicGet).toHaveBeenCalledExactlyOnceWith('/pub/status', {
      params: {
        purpose: 'login',
        f: 'requirements,email_code',
        username: 'owner',
        browser_uuid: 'browser',
      },
    });
    expect(clients.publicPost).not.toHaveBeenCalled();
  });

  it('explicitly issues a required point CAPTCHA using POST', async () => {
    clients.publicGet.mockResolvedValue({
      requirements: { captcha_required: true },
    });
    clients.publicPost.mockResolvedValue({
      captcha_required: true,
      captcha: { captcha_id: 'new' },
    });
    expect(await getLoginVerificationApi('owner')).toEqual({
      captcha_required: true,
      captcha: { captcha_id: 'new' },
    });
    expect(clients.publicPost).toHaveBeenCalledExactlyOnceWith('/pub/captcha', {
      username: 'owner',
    });
  });

  it('uses separate public and authenticated email status endpoints', async () => {
    clients.publicGet.mockResolvedValue({ server_time: 100, email_code: code });
    clients.verificationGet.mockResolvedValue({
      server_time: 100,
      email_code: code,
    });
    expect(await getLoginEmailCodeStatusApi('browser', 'owner')).toEqual({
      server_time: 100,
      ...code,
    });
    expect(clients.publicGet).toHaveBeenCalledWith('/pub/status', {
      params: {
        purpose: 'login',
        f: 'email_code',
        browser_uuid: 'browser',
        username: 'owner',
      },
    });
    await getBindEmailCodeStatusApi('browser', 'new@example.test');
    expect(clients.verificationGet).toHaveBeenCalledWith('/status', {
      params: {
        purpose: 'email_bind',
        f: 'email_code',
        browser_uuid: 'browser',
        email: 'new@example.test',
      },
    });
    await getBindEmailCodeStatusApi('browser', 'new@example.test', {
      suppressErrorMessage: true,
    });
    expect(clients.verificationGet).toHaveBeenLastCalledWith('/status', {
      params: {
        purpose: 'email_bind',
        f: 'email_code',
        browser_uuid: 'browser',
        email: 'new@example.test',
      },
      suppressErrorMessage: true,
    });
  });

  it('polls unlink progress without reloading methods', async () => {
    clients.verificationGet.mockResolvedValueOnce({
      server_time: 100,
      methods: { email: true, totp: true, fallback: 'verification' },
      email_code: code,
    });
    expect(await getEmailUnlinkStatusApi('browser')).toMatchObject({
      bound: true,
      can_send: true,
      fallback: 'totp',
    });
    expect(clients.verificationGet).toHaveBeenLastCalledWith('/status', {
      params: {
        purpose: 'email_unbind',
        f: 'methods,email_code',
        browser_uuid: 'browser',
      },
      suppressErrorMessage: true,
    });
    clients.verificationGet.mockResolvedValueOnce({
      server_time: 200,
      email_code: { retry_at: 0, completed: true },
    });
    expect(await getEmailUnlinkProgressApi('browser')).toMatchObject({
      bound: false,
    });
    expect(clients.verificationGet).toHaveBeenLastCalledWith('/status', {
      params: {
        purpose: 'email_unbind',
        f: 'email_code',
        browser_uuid: 'browser',
      },
      suppressErrorMessage: true,
    });
  });

  it('loads sensitive and recovery methods without public-options or user-info requests', async () => {
    clients.verificationGet.mockResolvedValue({
      methods: { totp: true, email: true, address: 'ow***@example.test' },
    });
    expect(await getSensitiveOptionsApi()).toEqual({
      totp: true,
      address: 'ow***@example.test',
    });
    expect(clients.verificationGet).toHaveBeenLastCalledWith('/status', {
      params: { purpose: 'sensitive', f: 'methods' },
      suppressErrorMessage: true,
    });
    await getSensitiveOptionsApi('totp_recovery');
    expect(clients.verificationGet).toHaveBeenLastCalledWith('/status', {
      params: { purpose: 'totp_recovery', f: 'methods' },
      suppressErrorMessage: true,
    });
    expect(clients.publicGet).not.toHaveBeenCalled();
    expect(clients.authGet).not.toHaveBeenCalled();
  });
});

it('reads mailbox cooldowns with the matching authentication boundary', async () => {
  clients.publicGet.mockResolvedValue({ server_time: 100, email_code: code });
  clients.verificationGet.mockResolvedValue({
    server_time: 100,
    email_code: code,
  });
  for (const purpose of ['sensitive', 'totp_recovery'] as const) {
    expect(await getMailboxCooldownApi('browser', purpose)).toEqual({
      server_time: 100,
      ...code,
    });
    expect(clients.verificationGet).toHaveBeenLastCalledWith('/status', {
      params: { purpose, f: 'email_code', browser_uuid: 'browser' },
      suppressErrorMessage: true,
    });
  }
  await getMailboxCooldownApi('browser', 'totp_recovery', 'ticket');
  expect(clients.publicGet).toHaveBeenLastCalledWith('/pub/status', {
    params: {
      purpose: 'login_totp_recovery',
      f: 'email_code',
      browser_uuid: 'browser',
    },
    headers: { 'X-MFA-Ticket': 'ticket' },
    suppressErrorMessage: true,
  });
});
