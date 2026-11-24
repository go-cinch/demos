import { createApp, ref } from 'vue';

import { resetAllStores } from '@vben/stores';
import { browserSession } from '@vben/stores/session';

import { UnsecuredJWT } from 'jose';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showRequestErrorToast } from '#/api/request-feedback';
import {
  enrollmentFromPasswordLogin,
  setTOTPEnrollmentSource,
} from '#/security/totp-enrollment-context';
import {
  requestVerification,
  verificationPrompt,
} from '#/security/verification-prompt';

import { rejectionOf } from '../../../../scripts/test-utils/rejection-of';
import {
  consumeRegistrationLogin,
  stageRegistrationLogin,
  useAuthStore,
} from './auth';
import { readDraft, writeDraft } from './preference-drafts';
import { releaseSessionCache } from './session-cache';

const requirementFixtures = new Map<
  string,
  {
    password_reset_required: boolean;
    totp_enrollment_required: boolean;
    email_binding_required: boolean;
  }
>();
const noRequirements = {
  password_reset_required: false,
  totp_enrollment_required: false,
  email_binding_required: false,
};
function rememberAuthRequirements(
  data: { access_token: string },
  requirements: Partial<typeof noRequirements>,
) {
  requirementFixtures.set(data.access_token, {
    ...noRequirements,
    ...requirements,
  });
}

const mocks = vi.hoisted(() => ({
  properties: vi.fn(),
  applyPendingLanguage: vi.fn(),
  loadLocale: vi.fn(),
  syncLanguage: vi.fn(),
  syncTimezone: vi.fn(),
  selectTimezone: vi.fn(),
  selectLanguage: vi.fn(),
  onboarding: vi.fn(),
  skip: vi.fn(),
  skipOnboarding: vi.fn(),
  access: {
    accessToken: null as null | string,
    refreshToken: null as null | string,
    loginExpired: false,
    isAccessChecked: false,
    setAccessToken: vi.fn(),
    setRefreshToken: vi.fn(),
    setIsAccessChecked: vi.fn(),
    setLoginExpired: vi.fn(),
    setAccessCodes: vi.fn(),
    setAccessMenus: vi.fn(),
    setAccessRoutes: vi.fn(),
  },
  user: {
    userInfo: null as null | Record<string, unknown>,
    $reset: vi.fn(),
    setUserInfo: vi.fn(),
  },
  router: {
    replace: vi.fn(),
    push: vi.fn(),
    currentRoute: {
      value: { path: '/auth/reset-password', fullPath: '/auth/reset-password' },
    },
  },
  login: vi.fn(),
  refresh: vi.fn(),
  reset: vi.fn(),
  info: vi.fn(),
  logout: vi.fn(),
  recordAccount: vi.fn(),
  transition: vi.fn(),
  generateAccess: vi.fn(),
  resetRoutes: vi.fn(),
}));
vi.mock('./ui-preferences', () => ({
  createUIPreferenceSync: () => ({
    sync: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  }),
}));
vi.mock('./timezone-preference', () => ({
  createTimezonePreferenceSync: () => ({
    sync: mocks.syncTimezone,
    select: mocks.selectTimezone,
  }),
}));
vi.mock('./language-preference', () => ({
  createLanguagePreferenceSync: () => ({
    applyPendingSelection: mocks.applyPendingLanguage,
    sync: mocks.syncLanguage,
    select: mocks.selectLanguage,
  }),
}));
vi.mock('./system-properties', () => ({
  loadSystemProperties: mocks.properties,
}));
vi.mock('#/router/access', () => ({ generateAccess: mocks.generateAccess }));
vi.mock('#/router/routes', () => ({ accessRoutes: [] }));
vi.mock('#/router', () => ({
  router: mocks.router,
  resetRoutes: mocks.resetRoutes,
}));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { defaultHomePath: '/dashboard/overview', locale: 'en-US' } },
}));
vi.mock('@vben/locales', () => ({ loadLocaleMessages: mocks.loadLocale }));
vi.mock('#/locales/catalog', () => ({ resolveCatalogLocale: (locale: string) => locale }));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => mocks.access,
  useUserStore: () => mocks.user,
  resetAllStores: vi.fn(),
}));
vi.mock('ant-design-vue', () => ({
  notification: { success: vi.fn() },
  message: { error: vi.fn() },
}));
vi.mock('#/api/request-feedback', () => ({ showRequestErrorToast: vi.fn() }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/api', () => ({
  loginApi: mocks.login,
  getOnboardingStatusApi: mocks.onboarding,
  refreshTokenApi: mocks.refresh,
  resetPasswordApi: mocks.reset,
  getUserInfoApi: mocks.info,
  skipEmailBindingApi: mocks.skip,
  skipOnboardingApi: mocks.skipOnboarding,
  logoutApi: mocks.logout,
  getLoginFailure: () => undefined,
  getLoginVerificationApi: vi.fn(),
  refreshLoginCaptchaApi: vi.fn(),
  verifyLoginCaptchaApi: vi.fn(),
}));
vi.mock('./login-account-history', () => ({
  recordLoginAccount: mocks.recordAccount,
}));
vi.mock('./login-transition', () => ({
  playLoginTransition: mocks.transition,
}));

const pending = {
  access_token: 'pending-access',
  refresh_token: 'pending-refresh',
  expired_at: 123,
};
rememberAuthRequirements(pending, { password_reset_required: true });
const complete = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expired_at: 234,
};

describe('authentication session lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.applyPendingLanguage.mockResolvedValue(undefined);
    mocks.loadLocale.mockResolvedValue(undefined);
    mocks.syncLanguage.mockResolvedValue(true);
    mocks.syncTimezone.mockResolvedValue(true);
    mocks.selectTimezone.mockResolvedValue(undefined);
    mocks.selectLanguage.mockResolvedValue(undefined);
    requirementFixtures.clear();
    rememberAuthRequirements(pending, { password_reset_required: true });
    mocks.onboarding.mockImplementation(
      async () =>
        requirementFixtures.get(mocks.access.accessToken ?? '') ??
        noRequirements,
    );
    mocks.transition.mockResolvedValue(undefined);
    consumeRegistrationLogin();
    setTOTPEnrollmentSource();
    setActivePinia(createPinia());
    localStorage.clear();
    mocks.access.accessToken = null;
    mocks.access.refreshToken = null;
    mocks.access.loginExpired = false;
    mocks.access.isAccessChecked = false;
    mocks.user.userInfo = null;
    mocks.router.currentRoute.value = {
      path: '/auth/reset-password',
      fullPath: '/auth/reset-password',
    };
    mocks.generateAccess.mockResolvedValue({
      accessibleMenus: ['menu'],
      accessibleRoutes: ['route'],
    });
    mocks.user.setUserInfo.mockImplementation((value) => {
      mocks.user.userInfo = value;
    });
    mocks.access.setIsAccessChecked.mockImplementation((value) => {
      mocks.access.isAccessChecked = value;
    });
    mocks.access.setAccessToken.mockImplementation((value) => {
      mocks.access.accessToken = value;
    });
    mocks.access.setRefreshToken.mockImplementation((value) => {
      mocks.access.refreshToken = value;
    });
    mocks.info.mockResolvedValue({
      username: 'tester',
      homePath: '/profile',
      email: 'tester@example.com',
      emailBindingRequired: false,
      permission: { words: [], menus: [] },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('binds a login-page choice when accepting the session even if onboarding fails', async () => {
    const auth = useAuthStore();
    const session = (id: string) => ({
      ...complete,
      access_token: new UnsecuredJWT({ code: 'users' }).setSubject(id).encode(),
    });
    releaseSessionCache();
    const light = { value: 'light', changed_at: Date.now() };
    writeDraft('theme.mode', light);
    const language = { value: 'zh-CN', changed_at: Date.now() };
    writeDraft('language', language);
    let claimedLanguage: ReturnType<typeof readDraft>;
    mocks.applyPendingLanguage.mockImplementationOnce(async () => {
      claimedLanguage = readDraft('language');
    });
    mocks.onboarding.mockRejectedValueOnce(new Error('offline'));
    await expect(auth.acceptSession(session('101'))).rejects.toThrow('offline');
    expect(claimedLanguage).toEqual(language);
    expect(mocks.applyPendingLanguage).toHaveBeenCalledBefore(mocks.onboarding);
    auth.$reset();
    expect(readDraft('theme.mode')).toBeUndefined();
    await auth.acceptSession(session('202'));
    expect(readDraft('theme.mode')).toBeUndefined();
    expect(readDraft('language')).toBeUndefined();
    await auth.acceptSession(session('101'));
    expect(readDraft('theme.mode')).toEqual(light);
  });
  it('navigates login and logout when public requests create the store before router installation', async () => {
    // Bootstrap installs Pinia before public options load, and installs the router later.
    // Do not mock useRouter: there is deliberately no router injection at creation time.
    const app = createApp({});
    app.use(createPinia());
    const auth = app.runWithContext(() => useAuthStore());
    mocks.router.currentRoute.value = {
      path: '/auth/login',
      fullPath: '/auth/login?redirect=%2Fprofile',
    };
    mocks.login.mockResolvedValue(complete);

    await auth.authLogin({ username: 'tester', password: 'password' });

    expect(auth.loginFailureMessage).toBe('');
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/profile');

    mocks.router.currentRoute.value = {
      path: '/profile',
      fullPath: '/profile',
    };
    await auth.logout();

    expect(mocks.logout).toHaveBeenCalledWith(complete.refresh_token);
    expect(resetAllStores).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: '/auth/login',
      query: { redirect: '/profile' },
    });
  });

  it('synchronizes account language once per session and retries optional failures without failing profile loading', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    mocks.info.mockResolvedValue({
      username: 'tester',
      language: 'zh-CN',
      permission: { words: [], menus: [] },
    });
    mocks.syncLanguage.mockRejectedValueOnce(new Error('offline'));
    await expect(auth.fetchUserInfo()).resolves.toHaveProperty(
      'language',
      'zh-CN',
    );
    await auth.fetchUserInfo();
    await auth.fetchUserInfo();
    expect(mocks.syncLanguage).toHaveBeenCalledTimes(2);
    expect(mocks.syncLanguage).toHaveBeenLastCalledWith(
      'zh-CN',
      expect.any(Function),
      expect.any(Number),
    );
    await auth.acceptSession({ ...complete, access_token: 'another-session' });
    await auth.fetchUserInfo();
    expect(mocks.syncLanguage).toHaveBeenCalledTimes(3);
  });

  it('restores global timezone once per session, retries failed writes and records only manual selections', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    mocks.info.mockResolvedValue({
      username: 'tester',
      timezone: 'America/New_York',
      permission: { words: [], menus: [] },
    });
    mocks.syncTimezone.mockRejectedValueOnce(new Error('offline'));
    await expect(auth.fetchUserInfo()).resolves.toHaveProperty(
      'timezone',
      'America/New_York',
    );
    await auth.fetchUserInfo();
    await auth.fetchUserInfo();
    expect(mocks.syncTimezone).toHaveBeenCalledTimes(2);
    expect(mocks.selectTimezone).not.toHaveBeenCalled();
    auth.selectTimezone('Asia/Tokyo');
    expect(mocks.selectTimezone).toHaveBeenCalledWith(
      'Asia/Tokyo',
      true,
      expect.any(Function),
    );
  });

  it('acknowledges hidden optional gates in order before any onboarding navigation', async () => {
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      totp_enrollment_required: true,
      totp_skip_allowed: true,
      totp_onboarding_hidden: true,
      password_reset_required: true,
      password_reset_skip_allowed: true,
      password_reset_onboarding_hidden: true,
    });
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      password_reset_required: true,
      password_reset_skip_allowed: true,
      password_reset_onboarding_hidden: true,
    });
    mocks.onboarding.mockResolvedValueOnce(noRequirements);
    const auth = useAuthStore();
    await auth.acceptSession(pending);
    expect(mocks.skipOnboarding.mock.calls).toEqual([
      ['totp', undefined],
      ['password', undefined],
    ]);
    expect(mocks.onboarding).toHaveBeenCalledTimes(3);
    expect(auth.totpEnrollmentRequired).toBe(false);
    expect(auth.passwordResetRequired).toBe(false);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    await auth.continueLogin();
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/profile');
  });

  it('never hides mandatory MFA or advances past a visible MFA gate', async () => {
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      totp_enrollment_required: true,
      totp_skip_allowed: false,
      totp_onboarding_hidden: true,
      password_reset_required: true,
      password_reset_skip_allowed: true,
      password_reset_onboarding_hidden: true,
    });
    const auth = useAuthStore();
    await auth.acceptSession(pending);
    await auth.continueLogin();
    expect(mocks.skipOnboarding).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/auth/bind-totp' }),
    );
  });

  it.each([false, true])(
    'hides only optional email prompts (required=%s)',
    async (required) => {
      mocks.onboarding.mockResolvedValue({
        ...noRequirements,
        email_binding_required: required,
        email_onboarding_hidden: true,
      });
      mocks.info.mockResolvedValue({
        username: 'tester',
        homePath: '/profile',
        email: '',
        emailBindingRequired: required,
        permission: { words: [], menus: [] },
      });
      mocks.properties.mockResolvedValue({
        email_enabled: true,
        totp_enabled: true,
      });
      const auth = useAuthStore();
      await auth.acceptSession(complete);
      await auth.continueLogin(true);
      const binding = expect.objectContaining({ path: '/auth/bind-email' });
      expect(mocks.router.replace).toHaveBeenLastCalledWith(
        required ? binding : '/profile',
      );
      expect(mocks.skip).not.toHaveBeenCalled();
    },
  );

  it('keeps tokens and blocks navigation when automatic skip fails, then permits retry', async () => {
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      password_reset_required: true,
      password_reset_skip_allowed: true,
      password_reset_onboarding_hidden: true,
    });
    mocks.skipOnboarding.mockRejectedValueOnce(new Error('skip unavailable'));
    const auth = useAuthStore();
    await expect(auth.acceptSession(pending)).rejects.toThrow(
      'skip unavailable',
    );
    expect(mocks.access.accessToken).toBe(pending.access_token);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    mocks.onboarding.mockResolvedValueOnce(noRequirements);
    await auth.restoreSession();
    expect(auth.passwordResetRequired).toBe(false);
  });

  it('stops automatic skipping when a replaced session finishes its request', async () => {
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      password_reset_required: true,
      password_reset_skip_allowed: true,
      password_reset_onboarding_hidden: true,
    });
    let resolve!: () => void;
    mocks.skipOnboarding.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const auth = useAuthStore();
    const old = auth.acceptSession(pending);
    const rejected = rejectionOf(old);
    await vi.waitFor(() =>
      expect(mocks.skipOnboarding).toHaveBeenCalledTimes(1),
    );
    await auth.acceptSession(complete);
    resolve();
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(mocks.onboarding).toHaveBeenCalledTimes(2);
    expect(mocks.access.accessToken).toBe(complete.access_token);
  });

  it('skips optional steps in server-confirmed order without replacing credentials', async () => {
    const auth = useAuthStore();
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      totp_enrollment_required: true,
      password_reset_required: true,
      totp_skip_allowed: true,
      password_reset_skip_allowed: true,
    });
    await auth.acceptSession(pending);
    expect(auth.totpSkipAllowed).toBe(true);
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      password_reset_required: true,
      password_reset_skip_allowed: true,
    });
    await auth.skipOnboarding('totp');
    expect(mocks.skipOnboarding).toHaveBeenCalledWith('totp', {
      suppressErrorMessage: true,
    });
    expect(mocks.onboarding).toHaveBeenLastCalledWith({
      suppressErrorMessage: true,
    });
    expect(auth.totpEnrollmentRequired).toBe(false);
    expect(auth.passwordResetRequired).toBe(true);
    expect(mocks.router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/auth/reset-password' }),
    );
    mocks.onboarding.mockResolvedValueOnce(noRequirements);
    await auth.skipOnboarding('password');
    expect(mocks.skipOnboarding).toHaveBeenLastCalledWith(
      'password',
      undefined,
    );
    expect(auth.passwordResetRequired).toBe(false);
    expect(mocks.access.accessToken).toBe(pending.access_token);
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/profile');
  });

  it('keeps the gate and refreshes skip permission after a policy rejection', async () => {
    const auth = useAuthStore();
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      password_reset_required: true,
      password_reset_skip_allowed: true,
    });
    await auth.acceptSession(pending);
    mocks.skipOnboarding.mockRejectedValueOnce(new Error('required'));
    mocks.onboarding.mockResolvedValueOnce({
      ...noRequirements,
      password_reset_required: true,
      password_reset_skip_allowed: false,
    });
    await expect(auth.skipOnboarding('password')).rejects.toThrow('required');
    expect(auth.passwordResetRequired).toBe(true);
    expect(auth.passwordResetSkipAllowed).toBe(false);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('waits for current deployment flags before loading profile fields and entering the app', async () => {
    mocks.login.mockResolvedValue(complete);
    let resolve!: (value: unknown) => void;
    mocks.properties.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const login = useAuthStore().authLogin({
      username: 'tester',
      password: 'password',
    });
    await vi.waitFor(() =>
      expect(mocks.properties).toHaveBeenCalledWith({ fresh: true }),
    );
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    resolve({ email_enabled: true, totp_enabled: true });
    await login;
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
  });

  it('does not load a profile when the session ends during settings revalidation', async () => {
    mocks.login.mockResolvedValue(complete);
    let resolve!: (value: unknown) => void;
    mocks.properties.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const auth = useAuthStore();
    const login = auth.authLogin({ username: 'tester', password: 'password' });
    await vi.waitFor(() =>
      expect(mocks.properties).toHaveBeenCalledWith({ fresh: true }),
    );
    auth.$reset();
    resolve({ email_enabled: true, totp_enabled: true });
    await login;
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('shares permission loading within a session and rebuilds routes after navigation changes', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    mocks.access.isAccessChecked = true;
    mocks.user.userInfo = {
      roles: ['/profile'],
      permission: { navigation: [] },
    };
    const current = {
      roles: ['/profile'],
      permission: {
        words: ['admin:read:profile'],
        menus: [{ menu_path: '/profile', btns: ['admin:btn:profile:edit'] }],
        navigation: [
          {
            resource_key: 'admin:profile',
            menu_key: 'admin:menu:profile',
            menu_path: '/profile',
          },
        ],
      },
    };
    let finish!: (value: unknown) => void;
    mocks.info.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = auth.fetchUserInfo();
    const second = auth.fetchUserInfo();
    finish(current);
    await expect(Promise.all([first, second])).resolves.toEqual([
      current,
      current,
    ]);
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.resetRoutes).toHaveBeenCalledOnce();
    expect(mocks.generateAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: current.roles,
        permissionMenus: current.permission.menus,
        navigation: current.permission.navigation,
      }),
    );
    expect(mocks.access.setAccessCodes).toHaveBeenCalledWith([
      'admin:read:profile',
      'admin:btn:profile:edit',
    ]);
    expect(mocks.access.setAccessMenus).toHaveBeenCalledWith(['menu']);
    expect(mocks.access.setAccessRoutes).toHaveBeenCalledWith(['route']);
    mocks.info.mockResolvedValue(current);
    await auth.fetchUserInfo();
    expect(mocks.generateAccess).toHaveBeenCalledOnce();
  });

  it('does not publish routes built for a previous account', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    mocks.access.isAccessChecked = true;
    mocks.info.mockResolvedValue({
      roles: ['/profile'],
      permission: { words: [], menus: [] },
    });
    let finish!: (value: unknown) => void;
    mocks.generateAccess.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pendingInfo = auth.fetchUserInfo();
    const rejected = rejectionOf(pendingInfo);
    await vi.waitFor(() => expect(mocks.generateAccess).toHaveBeenCalledOnce());
    await auth.acceptSession({ ...complete, access_token: 'another-account' });
    finish({ accessibleMenus: ['stale'], accessibleRoutes: ['stale'] });
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(mocks.access.setAccessMenus).not.toHaveBeenCalled();
    expect(mocks.access.setAccessRoutes).not.toHaveBeenCalled();
  });

  it('does not clear a newer session when an old logout completes late', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    let finish!: () => void;
    mocks.logout.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const signingOut = auth.logout();
    await auth.acceptSession({ ...complete, access_token: 'another-account' });
    finish();
    await signingOut;
    expect(mocks.access.accessToken).toBe('another-account');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('cancels every pending MFA operation as soon as ordinary sign-out starts', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    const current = auth.captureSession();
    const verify = vi.fn();
    const first = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    const second = requestVerification('sensitive');
    const outcomes = Promise.allSettled([first, second]);
    let finish!: () => void;
    mocks.logout.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const signingOut = auth.logout();
    expect(verificationPrompt.value).toBeUndefined();
    expect(current()).toBe(false);
    for (const outcome of await outcomes) {
      expect(outcome).toMatchObject({
        status: 'rejected',
        reason: { message: 'Verification cancelled' },
      });
    }
    expect(verify).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    finish();
    await signingOut;
  });

  it('discards a login response received after logout without resetting a newer login attempt', async () => {
    const auth = useAuthStore();
    vi.mocked(resetAllStores).mockImplementation(() => auth.$reset());
    let finishOld!: (value: typeof complete) => void;
    let finishNew!: (value: typeof complete) => void;
    mocks.login
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishNew = resolve;
        }),
      );
    const oldLogin = auth.authLogin({
      username: 'first',
      password: 'password',
    });
    await auth.logout();
    const newLogin = auth.authLogin({
      username: 'second',
      password: 'password',
    });
    expect(auth.loginLoading).toBe(true);
    finishOld({
      ...complete,
      access_token: 'old-login-access',
      refresh_token: 'old-login-refresh',
    });
    await oldLogin;
    expect(mocks.access.setAccessToken).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.recordAccount).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(auth.loginLoading).toBe(true);
    finishNew(complete);
    await newLogin;
    expect(mocks.access.accessToken).toBe('new-access');
    expect(mocks.recordAccount).toHaveBeenCalledExactlyOnceWith('second');
    expect(auth.loginLoading).toBe(false);
  });

  it('does not navigate back into the account if logout happens during login arrival', async () => {
    const auth = useAuthStore();
    vi.mocked(resetAllStores).mockImplementation(() => auth.$reset());
    mocks.login.mockResolvedValueOnce(complete);
    let finish!: () => void;
    mocks.transition.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const signingIn = auth.authLogin({
      username: 'tester',
      password: 'password',
    });
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce());
    await auth.logout();
    finish();
    await signingIn;
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ path: '/auth/login' }),
    );
    expect(auth.loginEntering).toBe(false);
  });

  it.each([
    '/auth/login',
    '/auth/bind-totp',
    '/auth/reset-password',
    '/auth/bind-email',
    '/auth/register',
  ])(
    'keeps a single business redirect when repeatedly logging out from %s',
    async (path) => {
      const target = '/profile?tab=security&search=a%26b#email';
      const legacy = `${path}?redirect=${encodeURIComponent(encodeURIComponent(target))}`;
      mocks.router.currentRoute.value = { path, fullPath: legacy };
      const auth = useAuthStore();
      for (let i = 0; i < 3; i += 1) {
        await auth.logout();
        expect(mocks.router.replace).toHaveBeenLastCalledWith({
          path: '/auth/login',
          query: { redirect: target },
        });
        mocks.router.currentRoute.value = {
          path: '/auth/login',
          fullPath: `/auth/login?redirect=${encodeURIComponent(target)}`,
        };
      }
    },
  );

  it('captures the business page before logout can change the route', async () => {
    mocks.access.refreshToken = 'refresh';
    mocks.router.currentRoute.value = {
      path: '/profile',
      fullPath: '/profile?tab=security#email',
    };
    mocks.logout.mockImplementation(async () => {
      mocks.router.currentRoute.value = {
        path: '/auth/login',
        fullPath: '/auth/login',
      };
    });
    await useAuthStore().logout();
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: '/auth/login',
      query: { redirect: '/profile?tab=security#email' },
    });
  });

  it('signs out of enrollment without a redirect and clears the old enrollment source', async () => {
    const auth = useAuthStore();
    setTOTPEnrollmentSource('password-login');
    mocks.router.currentRoute.value = {
      path: '/auth/bind-totp',
      fullPath: '/auth/bind-totp?redirect=%252Fauth%252Fbind-totp',
    };
    await auth.logout(false);
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith({
      path: '/auth/login',
      query: {},
    });
    expect(enrollmentFromPasswordLogin.value).toBe(false);
  });

  it('cancels every sensitive waiter and opens profile recovery without signing out', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    const isCurrentSession = auth.captureSession();
    const verify = vi.fn();
    const first = requestVerification(
      'sensitive',
      undefined,
      undefined,
      verify,
    );
    const second = requestVerification('sensitive');
    const outcomes = Promise.allSettled([first, second]);
    mocks.router.push.mockImplementationOnce(async () => {
      mocks.router.currentRoute.value.path = '/profile';
    });
    const recovering = auth.openTOTPRecovery();
    expect(verificationPrompt.value).toBeUndefined();
    expect(isCurrentSession()).toBe(true);
    for (const outcome of await outcomes) {
      expect(outcome).toMatchObject({
        status: 'rejected',
        reason: { message: 'Verification cancelled' },
      });
    }
    expect(verify).not.toHaveBeenCalled();
    await recovering;
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(auth.totpRecoveryRequested).toBe(true);
    expect(mocks.access.accessToken).toBe(complete.access_token);
    expect(mocks.access.refreshToken).toBe(complete.refresh_token);
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith({
      path: '/profile',
    });
  });

  it.each([undefined, 403, 429, 502])(
    'retains a restorable session after refresh fails with %s',
    async (status) => {
      const auth = useAuthStore();
      mocks.access.refreshToken = 'previous-refresh';
      const failure = status ? { response: { status } } : new Error('offline');
      mocks.refresh
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(complete);
      expect(await auth.restoreSession()).toBe('unavailable');
      expect(mocks.access.refreshToken).toBe('previous-refresh');
      expect(mocks.access.accessToken).toBeNull();
      expect(await auth.restoreSession()).toBe(true);
      expect(mocks.refresh).toHaveBeenLastCalledWith('previous-refresh', undefined);
    },
  );

  it('uses the restored locale for the request and recovery screen until authorization expires', async () => {
    const auth = useAuthStore();
    mocks.access.refreshToken = 'previous-refresh';
    vi.spyOn(browserSession, 'restorationLocale').mockReturnValue('zh-CN');
    mocks.refresh
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockRejectedValueOnce({ response: { status: 401 } });

    await expect(auth.restoreSession()).resolves.toBe('unavailable');
    expect(mocks.refresh).toHaveBeenLastCalledWith('previous-refresh', 'zh-CN');
    expect(mocks.loadLocale).toHaveBeenLastCalledWith('zh-CN');
    await expect(auth.restoreSession()).resolves.toBe(false);
    expect(mocks.loadLocale).toHaveBeenLastCalledWith('en-US');
    expect(mocks.access.refreshToken).toBeNull();
  });

  it('does not start a stored-session refresh while explicit logout is pending', async () => {
    const auth = useAuthStore();
    mocks.access.refreshToken = 'previous-refresh';
    let finishLogout!: () => void;
    mocks.logout.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishLogout = resolve;
      }),
    );
    const leaving = auth.logout(false);
    expect(await auth.restoreSession()).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
    finishLogout();
    await leaving;
  });

  it('keeps the user signed out when an earlier session restoration succeeds late', async () => {
    const auth = useAuthStore();
    mocks.access.refreshToken = 'fixture-refresh';
    vi.mocked(resetAllStores).mockImplementationOnce(() => {
      mocks.access.accessToken = null;
      mocks.access.refreshToken = null;
    });
    let finishRefresh!: (result: typeof complete) => void;
    mocks.refresh.mockReturnValueOnce(
      new Promise<typeof complete>((resolve) => {
        finishRefresh = resolve;
      }),
    );
    const restoring = auth.restoreSession();
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await auth.logout(false);
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: '/auth/login',
      query: {},
    });
    finishRefresh(complete);

    await expect(restoring).resolves.toBe(false);
    expect(mocks.access.accessToken).toBeNull();
    expect(mocks.access.refreshToken).toBeNull();
    expect(mocks.onboarding).not.toHaveBeenCalled();
  });

  it('ignores a failed session restoration that belongs to an earlier account', async () => {
    const auth = useAuthStore();
    mocks.access.refreshToken = 'old-refresh';
    let fail!: (error: unknown) => void;
    mocks.refresh.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const restoring = auth.restoreSession();
    await auth.acceptSession(complete);
    fail(new Error('old session expired'));
    await expect(restoring).resolves.toBe(true);
    expect(mocks.access.accessToken).toBe('new-access');
    expect(mocks.access.refreshToken).toBe('new-refresh');
  });

  it('fetches a fresh permission snapshot after a mutation instead of reusing the earlier in-flight response', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    let finishOld!: (value: unknown) => void;
    const oldInfo = {
      username: 'operator',
      roles: [],
      permission: { words: ['admin:read:system:user'], menus: [] },
    };
    const newInfo = {
      username: 'operator',
      roles: [],
      permission: {
        words: [
          'admin:read:system:user',
          'admin:grant:system:permission-admin',
        ],
        menus: [],
      },
    };
    mocks.info.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    mocks.info.mockResolvedValueOnce(newInfo);
    const beforeMutation = auth.fetchUserInfo();
    const afterMutation = auth.fetchUserInfo({ fresh: true });
    expect(mocks.info).toHaveBeenCalledTimes(1);
    finishOld(oldInfo);
    await beforeMutation;
    await expect(afterMutation).resolves.toEqual(newInfo);
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.user.setUserInfo).toHaveBeenLastCalledWith(newInfo);
    expect(mocks.access.setAccessCodes).toHaveBeenLastCalledWith(
      newInfo.permission.words,
    );
  });

  it('does not start a queued fresh refresh for an account that has since signed out or changed', async () => {
    const auth = useAuthStore();
    await auth.acceptSession({ ...complete, access_token: 'old-account' });
    let finishOld!: (value: unknown) => void;
    mocks.info.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const old = auth.fetchUserInfo();
    const oldRejected = rejectionOf(old);
    const fresh = auth.fetchUserInfo({ fresh: true });
    const freshRejected = rejectionOf(fresh);
    await auth.acceptSession({ ...complete, access_token: 'new-account' });
    const current = {
      username: 'guest',
      roles: [],
      permission: { words: [], menus: [] },
    };
    mocks.info.mockResolvedValueOnce(current);
    await auth.fetchUserInfo();
    finishOld({
      username: 'administrator',
      roles: [],
      permission: { words: ['admin:all:system:all'], menus: [] },
    });
    expect(await oldRejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(await freshRejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.user.setUserInfo).toHaveBeenLastCalledWith(current);
  });

  it('accepts user info retried after token rotation within the same session', async () => {
    const auth = useAuthStore();
    await auth.acceptSession({ ...complete, access_token: 'original-token' });
    mocks.info.mockImplementationOnce(async () => {
      await auth.acceptSession(
        { ...complete, access_token: 'rotated-token' },
        true,
      );
      return {
        username: 'same-user',
        roles: [],
        permission: { words: [], menus: [] },
      };
    });
    await expect(auth.fetchUserInfo()).resolves.toHaveProperty(
      'username',
      'same-user',
    );
    expect(mocks.user.setUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'same-user' }),
    );
  });

  it('discards a delayed administrator response after another account signs in', async () => {
    const auth = useAuthStore();
    await auth.acceptSession({ ...complete, access_token: 'admin-token' });
    let finishAdmin!: (value: unknown) => void;
    mocks.info.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishAdmin = resolve;
        }),
    );
    const administrator = auth.fetchUserInfo();
    const rejected = rejectionOf(administrator);
    await auth.acceptSession({ ...complete, access_token: 'guest-token' });
    const guest = {
      username: 'guest',
      permission: { words: [], menus: [] },
      roles: [],
    };
    mocks.info.mockResolvedValueOnce(guest);
    await auth.fetchUserInfo();
    finishAdmin({
      username: 'admin',
      permission: { words: ['admin:delete:system:user'], menus: [] },
      roles: ['/system/user'],
    });
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(mocks.user.setUserInfo).toHaveBeenLastCalledWith(guest);
    expect(mocks.access.setAccessCodes).toHaveBeenLastCalledWith([]);
  });

  it('hands registration credentials to the login page once, in memory only', async () => {
    const write = vi.spyOn(localStorage, 'setItem');
    const sessionWrite = vi.spyOn(sessionStorage, 'setItem');
    const credentials = {
      password: 'registered-password',
      username: 'new-user',
    };
    stageRegistrationLogin(credentials);
    credentials.username = 'changed-by-caller';
    credentials.password = 'changed-by-caller';

    expect(consumeRegistrationLogin()).toEqual({
      password: 'registered-password',
      username: 'new-user',
    });
    expect(consumeRegistrationLogin()).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(sessionWrite).not.toHaveBeenCalled();
  });

  it('clears unconsumed registration credentials when auth state is reset', async () => {
    stageRegistrationLogin({
      password: 'registered-password',
      username: 'new-user',
    });
    useAuthStore().$reset();
    expect(consumeRegistrationLogin()).toBeNull();
  });

  it('does not read or write remembered credentials after a password reset', async () => {
    const read = vi.spyOn(localStorage, 'getItem');
    const write = vi.spyOn(localStorage, 'setItem');
    mocks.reset.mockResolvedValue(complete);
    await useAuthStore().completePasswordReset('new-password');
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('waits for inline MFA before installing tokens or playing arrival', async () => {
    let finish!: (result: typeof complete) => void;
    mocks.login.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const auth = useAuthStore();
    const loggingIn = auth.authLogin({
      username: 'tester',
      password: 'initial',
    });
    await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledOnce());
    expect(mocks.access.setAccessToken).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    finish(complete);
    await loggingIn;
    expect(mocks.access.setAccessToken).toHaveBeenCalledWith('new-access');
    expect(mocks.transition).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
  });

  it('enters reset before fetching profile or menus', async () => {
    mocks.login.mockResolvedValue(pending);
    const auth = useAuthStore();
    await auth.authLogin({
      password: 'initial',
      sliderProof: 'one-time-proof',
      username: 'tester',
    });
    expect(mocks.login).toHaveBeenCalledWith(
      expect.objectContaining({ slider_proof: 'one-time-proof' }),
    );
    expect(auth.passwordResetRequired).toBe(true);
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: '/auth/reset-password',
      query: {},
    });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('restores the restriction from the server after a page reload', async () => {
    mocks.access.refreshToken = 'pending-refresh';
    mocks.refresh.mockResolvedValue(pending);
    const auth = useAuthStore();
    expect(await auth.restoreSession()).toBe(true);
    expect(auth.passwordResetRequired).toBe(true);
  });

  it.each(['login', 'refresh', 'MFA confirmation'] as const)(
    'uses a queried onboarding restriction after %s',
    async (operation) => {
      const result = {
        access_token: 'pending-access',
        refresh_token: 'pending-refresh',
        expired_at: 123,
      };
      rememberAuthRequirements(result, { password_reset_required: true });
      const auth = useAuthStore();
      const enrollmentResult = ref(result);
      expect(enrollmentResult.value).not.toBe(result);
      let restored: boolean | string = false;
      if (operation === 'login') {
        mocks.login.mockResolvedValue(result);
        await auth.authLogin({ username: 'tester', password: 'initial' });
      } else if (operation === 'refresh') {
        mocks.access.refreshToken = 'previous-refresh';
        mocks.refresh.mockResolvedValue(result);
        restored = await auth.restoreSession();
      } else {
        await auth.completeVerificationEnrollment(enrollmentResult.value);
      }
      expect(auth.passwordResetRequired).toBe(true);
      expect(mocks.access.accessToken).toBe('pending-access');
      expect(mocks.info).not.toHaveBeenCalled();
      expect(mocks.transition).not.toHaveBeenCalled();
      expect(restored).toBe(operation === 'refresh');
      expect(mocks.router.replace.mock.calls).toEqual(
        operation === 'refresh'
          ? []
          : [[{ path: '/auth/reset-password', query: {} }]],
      );
    },
  );

  it('clears the restriction when replacement onboarding status no longer requires a reset', async () => {
    const result = { ...complete, access_token: 'restricted-access' };
    rememberAuthRequirements(result, { password_reset_required: true });
    const auth = useAuthStore();
    await auth.acceptSession(result);
    expect(auth.passwordResetRequired).toBe(true);
    await auth.acceptSession({ ...complete });
    expect(auth.passwordResetRequired).toBe(false);
  });

  it('preserves both header restrictions through a Vue response ref and keeps MFA enrollment first', async () => {
    const result = {
      access_token: 'pending-access',
      refresh_token: 'pending-refresh',
      expired_at: 123,
    };
    rememberAuthRequirements(result, {
      totp_enrollment_required: true,
      password_reset_required: true,
    });
    const reactiveResult = ref(result).value;
    expect(reactiveResult).not.toBe(result);
    const auth = useAuthStore();
    await auth.acceptSession(reactiveResult);
    expect(auth.totpEnrollmentRequired).toBe(true);
    expect(auth.passwordResetRequired).toBe(true);
    await auth.requirePasswordReset();
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: '/auth/bind-totp',
      query: {},
    });
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it('replaces both tokens before fetching profile and continues without login', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(pending);
    mocks.reset.mockResolvedValue(complete);
    mocks.info.mockImplementation(async () => {
      expect(mocks.access.accessToken).toBe('new-access');
      expect(mocks.access.refreshToken).toBe('new-refresh');
      return {
        username: 'tester',
        homePath: '/profile',
        email: 'tester@example.com',
        emailBindingRequired: false,
        permission: { words: [], menus: [] },
      };
    });
    await auth.completePasswordReset('new-password');
    expect(auth.passwordResetRequired).toBe(false);
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('preserves restriction and tokens when the password is rejected', async () => {
    const auth = useAuthStore();
    await auth.acceptSession(pending);
    mocks.reset.mockRejectedValue(new Error('same password'));
    await expect(auth.completePasswordReset('initial')).rejects.toThrow(
      'same password',
    );
    expect(auth.passwordResetRequired).toBe(true);
    expect(mocks.access.accessToken).toBe('pending-access');
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('records only the account after a successful login', async () => {
    mocks.login.mockResolvedValue(complete);
    const result = await useAuthStore().authLogin({
      password: 'current-password',
      username: 'tester',
    });
    expect(result.userInfo?.username).toBe('tester');
    expect(mocks.recordAccount).toHaveBeenCalledExactlyOnceWith('tester');
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
  });

  it('does not add rejected logins to account history', async () => {
    mocks.login.mockRejectedValue(new Error('invalid credentials'));
    const result = await useAuthStore().authLogin({
      password: 'incorrect-password',
      username: 'tester',
    });
    expect(result.userInfo).toBeNull();
    expect(mocks.recordAccount).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('records a successful login requiring reset without saving either password', async () => {
    const write = vi.spyOn(localStorage, 'setItem');
    mocks.login.mockResolvedValue(pending);
    mocks.reset.mockResolvedValue(complete);
    const auth = useAuthStore();
    await auth.authLogin({ password: 'initial-password', username: 'tester' });
    expect(mocks.recordAccount).toHaveBeenCalledExactlyOnceWith('tester');
    await auth.completePasswordReset('new-password');
    expect(write).not.toHaveBeenCalled();
    expect(mocks.recordAccount).toHaveBeenCalledTimes(1);
  });

  it('prevents concurrent login submissions from recording history twice', async () => {
    let resolveLogin!: (value: typeof complete) => void;
    mocks.login.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const auth = useAuthStore();
    const params = { password: 'current-password', username: 'tester' };
    const first = auth.authLogin(params);
    const result = await auth.authLogin(params);
    expect(result.userInfo).toBeNull();
    resolveLogin(complete);
    await first;
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(mocks.recordAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps login pending until arrival completes and preserves the destination', async () => {
    let arrived!: () => void;
    mocks.transition.mockReturnValue(
      new Promise<void>((resolve) => {
        arrived = resolve;
      }),
    );
    mocks.login.mockResolvedValue(complete);
    const auth = useAuthStore();
    const signingIn = auth.authLogin({
      username: 'tester',
      password: 'password',
    });
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce());
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(auth.loginLoading).toBe(true);
    const result = await auth.authLogin({
      username: 'tester',
      password: 'password',
    });
    expect(result.userInfo).toBeNull();
    arrived();
    await signingIn;
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
    expect(auth.loginLoading).toBe(false);
  });

  it('plays arrival after a successful required password reset, before navigation', async () => {
    let arrived!: () => void;
    mocks.transition.mockReturnValue(
      new Promise<void>((resolve) => {
        arrived = resolve;
      }),
    );
    mocks.reset.mockResolvedValue(complete);
    const reset = useAuthStore().completePasswordReset('new-password');
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce());
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    arrived();
    await reset;
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
  });

  it('waits for arrival after recovery acknowledgment before entering the system', async () => {
    let arrived!: () => void;
    mocks.transition.mockReturnValue(
      new Promise<void>((resolve) => {
        arrived = resolve;
      }),
    );
    const auth = useAuthStore();
    await auth.acceptSession(complete);
    expect(mocks.transition).not.toHaveBeenCalled();
    const entering = auth.completeVerificationEnrollment(complete);
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce());
    expect(mocks.router.replace).not.toHaveBeenCalled();
    arrived();
    await entering;
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
  });

  it('does not enter the old account if its session changes during arrival', async () => {
    let arrived!: () => void;
    mocks.transition.mockReturnValue(
      new Promise<void>((resolve) => {
        arrived = resolve;
      }),
    );
    const auth = useAuthStore();
    const entering = auth.completeVerificationEnrollment(complete);
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce());
    auth.$reset();
    arrived();
    await entering;
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('requires MFA enrollment before password reset on login', async () => {
    const result = { ...complete };
    rememberAuthRequirements(result, {
      totp_enrollment_required: true,
      password_reset_required: true,
    });
    mocks.login.mockResolvedValue(result);
    const auth = useAuthStore();
    await auth.authLogin({ username: 'tester', password: 'password' });
    expect(auth.passwordResetRequired).toBe(true);
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: '/auth/bind-totp',
      query: {},
    });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('keeps a recovered session on enrollment and loads business data only after binding a new factor', async () => {
    const recovered = { ...complete, access_token: 'enrollment-only' };
    rememberAuthRequirements(recovered, { totp_enrollment_required: true });
    mocks.login.mockResolvedValue(recovered);
    const auth = useAuthStore();
    await auth.authLogin({ username: 'tester', password: 'password' });
    expect(auth.totpEnrollmentRequired).toBe(true);
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: '/auth/bind-totp',
      query: {},
    });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    await auth.completeVerificationEnrollment(ref({ ...complete }).value);
    expect(auth.totpEnrollmentRequired).toBe(false);
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/profile');
  });

  it('continues to password reset after saving MFA recovery codes', async () => {
    const result = { ...complete, access_token: 'restricted-access' };
    rememberAuthRequirements(result, { password_reset_required: true });
    await useAuthStore().completeVerificationEnrollment(result);
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: '/auth/reset-password',
      query: {},
    });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('keeps sailing when a password reset still requires authenticator enrollment', async () => {
    const result = { ...complete };
    rememberAuthRequirements(result, { totp_enrollment_required: true });
    mocks.reset.mockResolvedValue(result);
    await useAuthStore().completePasswordReset('new-password');
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: '/auth/bind-totp',
      query: {},
    });
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('does not play arrival when profile loading fails', async () => {
    mocks.login.mockResolvedValue(complete);
    mocks.info.mockRejectedValueOnce(new Error('profile unavailable'));
    await useAuthStore().authLogin({
      username: 'tester',
      password: 'password',
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it('does not delay reauthentication in an expired-session modal', async () => {
    mocks.login.mockResolvedValue(complete);
    mocks.access.loginExpired = true;
    await useAuthStore().authLogin({
      username: 'tester',
      password: 'password',
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.access.setLoginExpired).toHaveBeenCalledWith(false);
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
  });
  it.each([
    [true, true],
    [true, false],
    [false, true],
  ])(
    'checks delivery (%s) and permission (%s) before offering optional binding',
    async (enabled, allowed) => {
      mocks.login.mockResolvedValue(complete);
      mocks.properties.mockResolvedValue({ email_enabled: enabled });
      mocks.info.mockResolvedValue({
        username: 'tester',
        email: '',
        emailBindingRequired: false,
        permission: {
          words: [],
          menus: [],
          profile_actions: allowed ? ['bind_email'] : [],
        },
      });
      await useAuthStore().authLogin({
        username: 'tester',
        password: 'password',
      });
      expect(mocks.router.replace).toHaveBeenLastCalledWith(
        enabled && allowed
          ? { path: '/auth/bind-email', query: {} }
          : '/profile',
      );
    },
  );
  it.each([false, true])(
    'uses the saved skip preference unless binding is mandatory (%s)',
    async (required) => {
      mocks.login.mockResolvedValue(complete);
      mocks.properties.mockResolvedValue({ email_enabled: true });
      mocks.info.mockResolvedValue({
        username: 'tester',
        email: '',
        emailBindingSkipped: true,
        emailBindingRequired: required,
        permission: { menus: [], words: [] },
      });
      await useAuthStore().authLogin({
        username: 'tester',
        password: 'password',
      });
      expect(mocks.router.replace).toHaveBeenLastCalledWith(
        required ? { path: '/auth/bind-email', query: {} } : '/profile',
      );
    },
  );
  it('stays on the binding form when saving Skip fails', async () => {
    mocks.skip.mockRejectedValueOnce(new Error('offline'));
    await expect(useAuthStore().skipEmailBinding()).rejects.toThrow('offline');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
  it('reads binding policy from info and rechecks it before allowing Skip', async () => {
    mocks.login.mockResolvedValue(complete);
    mocks.info.mockResolvedValue({
      username: 'tester',
      email: '',
      emailBindingRequired: true,
      permission: { words: [], menus: [] },
    });
    const auth = useAuthStore();
    await auth.authLogin({ username: 'tester', password: 'password' });
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: '/auth/bind-email',
      query: {},
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    await auth.skipEmailBinding();
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: '/auth/bind-email',
      query: {},
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    mocks.info.mockResolvedValue({
      username: 'tester',
      email: '',
      emailBindingRequired: false,
      permission: { words: [], menus: [] },
    });
    await auth.skipEmailBinding();
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/profile');
  });
  it('keeps rotated tokens and blocks navigation when onboarding status fails', async () => {
    mocks.onboarding.mockRejectedValueOnce(new Error('status offline'));
    const auth = useAuthStore();
    await expect(auth.acceptSession(complete)).rejects.toThrow(
      'status offline',
    );
    expect(mocks.access.refreshToken).toBe(complete.refresh_token);
    expect(mocks.access.accessToken).toBe(complete.access_token);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    mocks.onboarding.mockResolvedValue(noRequirements);
    await expect(auth.restoreSession()).resolves.toBe(true);
  });

  it('ignores a late onboarding response after another account signs in', async () => {
    let release!: (value: typeof noRequirements) => void;
    mocks.onboarding.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const auth = useAuthStore();
    const old = auth.acceptSession({ ...complete, access_token: 'old-access' });
    const rejected = rejectionOf(old);
    await auth.acceptSession({ ...complete, access_token: 'new-access' });
    release({ ...noRequirements, password_reset_required: true });
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('expired session'),
    });
    expect(auth.passwordResetRequired).toBe(false);
    expect(mocks.access.accessToken).toBe('new-access');
  });

  it('clears the login loading state and reports an onboarding outage', async () => {
    mocks.login.mockResolvedValue(complete);
    mocks.onboarding.mockRejectedValueOnce(new Error('status offline'));
    const auth = useAuthStore();
    await auth.authLogin({ username: 'tester', password: 'password' });
    expect(auth.loginLoading).toBe(false);
    expect(auth.loginFailureMessage).toBe('');
    expect(showRequestErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'status offline' }),
    );
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});
