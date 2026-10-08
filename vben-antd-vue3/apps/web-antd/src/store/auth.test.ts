import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: {
    accessToken: null as null | string,
    refreshToken: null as null | string,
    loginExpired: false,
    setAccessToken: vi.fn(),
    setRefreshToken: vi.fn(),
    setIsAccessChecked: vi.fn(),
    setLoginExpired: vi.fn(),
    setAccessCodes: vi.fn(),
  },
  user: { $reset: vi.fn(), setUserInfo: vi.fn() },
  router: {
    replace: vi.fn(),
    push: vi.fn(),
    currentRoute: { value: { fullPath: '/auth/reset-password' } },
  },
  login: vi.fn(),
  refresh: vi.fn(),
  reset: vi.fn(),
  info: vi.fn(),
  logout: vi.fn(),
  recordAccount: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { defaultHomePath: '/dashboard/overview' } },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => mocks.access,
  useUserStore: () => mocks.user,
  resetAllStores: vi.fn(),
}));
vi.mock('ant-design-vue', () => ({ notification: { success: vi.fn() } }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/api', () => ({
  loginApi: mocks.login,
  refreshTokenApi: mocks.refresh,
  resetPasswordApi: mocks.reset,
  getUserInfoApi: mocks.info,
  logoutApi: mocks.logout,
  getLoginFailure: () => undefined,
  getLoginVerificationApi: vi.fn(),
  refreshLoginCaptchaApi: vi.fn(),
  verifyLoginCaptchaApi: vi.fn(),
}));
vi.mock('./login-account-history', () => ({
  recordLoginAccount: mocks.recordAccount,
}));
import {
  consumeRegistrationLogin,
  stageRegistrationLogin,
  useAuthStore,
} from './auth';

const pending = {
  access_token: 'pending-access',
  refresh_token: 'pending-refresh',
  password_reset_required: true,
  expired_at: 123,
};
const complete = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  password_reset_required: false,
  expired_at: 234,
};

describe('first-login password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRegistrationLogin();
    setActivePinia(createPinia());
    localStorage.clear();
    mocks.access.accessToken = null;
    mocks.access.refreshToken = null;
    mocks.access.loginExpired = false;
    mocks.access.setAccessToken.mockImplementation((value) => {
      mocks.access.accessToken = value;
    });
    mocks.access.setRefreshToken.mockImplementation((value) => {
      mocks.access.refreshToken = value;
    });
    mocks.info.mockResolvedValue({
      username: 'tester',
      homePath: '/profile',
      permission: { btns: [] },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('hands registration credentials to the login page once, in memory only', () => {
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

  it('clears unconsumed registration credentials when auth state is reset', () => {
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
    expect(mocks.router.replace).toHaveBeenCalledWith('/auth/reset-password');
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it('restores the restriction from the server after a page reload', async () => {
    mocks.access.refreshToken = 'pending-refresh';
    mocks.refresh.mockResolvedValue(pending);
    const auth = useAuthStore();
    expect(await auth.restoreSession()).toBe(true);
    expect(auth.passwordResetRequired).toBe(true);
  });
  it('replaces both tokens before fetching profile and continues without login', async () => {
    const auth = useAuthStore();
    auth.acceptSession(pending);
    mocks.reset.mockResolvedValue(complete);
    mocks.info.mockImplementation(async () => {
      expect(mocks.access.accessToken).toBe('new-access');
      expect(mocks.access.refreshToken).toBe('new-refresh');
      return {
        username: 'tester',
        homePath: '/profile',
        permission: { btns: [] },
      };
    });
    await auth.completePasswordReset('new-password');
    expect(auth.passwordResetRequired).toBe(false);
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile');
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('preserves restriction and tokens when the password is rejected', async () => {
    const auth = useAuthStore();
    auth.acceptSession(pending);
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
    expect(mocks.router.push).toHaveBeenCalledWith('/profile');
  });

  it('does not add rejected logins to account history', async () => {
    mocks.login.mockRejectedValue(new Error('invalid credentials'));
    const result = await useAuthStore().authLogin({
      password: 'incorrect-password',
      username: 'tester',
    });
    expect(result.userInfo).toBeNull();
    expect(mocks.recordAccount).not.toHaveBeenCalled();
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
    expect((await auth.authLogin(params)).userInfo).toBeNull();
    resolveLogin(complete);
    await first;
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(mocks.recordAccount).toHaveBeenCalledTimes(1);
  });
});
