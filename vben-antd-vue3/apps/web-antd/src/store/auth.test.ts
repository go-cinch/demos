import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
vi.mock('#/router/access', () => ({ generateAccess: mocks.generateAccess }));
vi.mock('#/router/routes', () => ({ accessRoutes: [] }));
vi.mock('#/router', () => ({ resetRoutes: mocks.resetRoutes }));
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
vi.mock('./login-transition', () => ({
  playLoginTransition: mocks.transition,
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

describe('authentication session lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transition.mockResolvedValue(undefined);
    consumeRegistrationLogin();
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
      permission: { words: [], menus: [] },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shares permission loading within a session and rebuilds routes after navigation changes', async () => {
    const auth = useAuthStore();
    auth.acceptSession(complete);
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
    auth.acceptSession(complete);
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
    const rejected = expect(pendingInfo).rejects.toThrow('expired session');
    await vi.waitFor(() => expect(mocks.generateAccess).toHaveBeenCalledOnce());
    auth.acceptSession({ ...complete, access_token: 'another-account' });
    finish({ accessibleMenus: ['stale'], accessibleRoutes: ['stale'] });
    await rejected;
    expect(mocks.access.setAccessMenus).not.toHaveBeenCalled();
    expect(mocks.access.setAccessRoutes).not.toHaveBeenCalled();
  });

  it('does not clear a newer session when an old logout completes late', async () => {
    const auth = useAuthStore();
    auth.acceptSession(complete);
    let finish!: () => void;
    mocks.logout.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const signingOut = auth.logout();
    auth.acceptSession({ ...complete, access_token: 'another-account' });
    finish();
    await signingOut;
    expect(mocks.access.accessToken).toBe('another-account');
    expect(mocks.router.replace).not.toHaveBeenCalled();
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
    auth.acceptSession(complete);
    fail(new Error('old session expired'));
    await expect(restoring).resolves.toBe(true);
    expect(mocks.access.accessToken).toBe('new-access');
    expect(mocks.access.refreshToken).toBe('new-refresh');
  });

  it('fetches a fresh permission snapshot after a mutation instead of reusing the earlier in-flight response', async () => {
    const auth = useAuthStore();
    auth.acceptSession(complete);
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
    auth.acceptSession({ ...complete, access_token: 'old-account' });
    let finishOld!: (value: unknown) => void;
    mocks.info.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const old = auth.fetchUserInfo();
    const oldRejected = expect(old).rejects.toThrow('expired session');
    const fresh = auth.fetchUserInfo({ fresh: true });
    const freshRejected = expect(fresh).rejects.toThrow('expired session');
    auth.acceptSession({ ...complete, access_token: 'new-account' });
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
    await Promise.all([oldRejected, freshRejected]);
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.user.setUserInfo).toHaveBeenLastCalledWith(current);
  });

  it('accepts user info retried after token rotation within the same session', async () => {
    const auth = useAuthStore();
    auth.acceptSession({ ...complete, access_token: 'original-token' });
    mocks.info.mockImplementationOnce(async () => {
      auth.acceptSession({ ...complete, access_token: 'rotated-token' }, true);
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
    auth.acceptSession({ ...complete, access_token: 'admin-token' });
    let finishAdmin!: (value: unknown) => void;
    mocks.info.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishAdmin = resolve;
        }),
    );
    const administrator = auth.fetchUserInfo();
    const rejected = expect(administrator).rejects.toThrow('expired session');
    auth.acceptSession({ ...complete, access_token: 'guest-token' });
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
    await rejected;
    expect(mocks.user.setUserInfo).toHaveBeenLastCalledWith(guest);
    expect(mocks.access.setAccessCodes).toHaveBeenLastCalledWith([]);
  });

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
    expect(mocks.transition).not.toHaveBeenCalled();
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
    expect((await auth.authLogin(params)).userInfo).toBeNull();
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
    expect(
      (await auth.authLogin({ username: 'tester', password: 'password' }))
        .userInfo,
    ).toBeNull();
    arrived();
    await signingIn;
    expect(mocks.router.push).toHaveBeenCalledWith('/profile');
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
});
