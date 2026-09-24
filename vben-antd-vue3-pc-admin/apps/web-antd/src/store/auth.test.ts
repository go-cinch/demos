import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

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
import { useAuthStore } from './auth';

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
    setActivePinia(createPinia());
    localStorage.clear();
    mocks.access.accessToken = null;
    mocks.access.refreshToken = null;
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
  it('enters reset before fetching profile or menus', async () => {
    mocks.login.mockResolvedValue(pending);
    const auth = useAuthStore();
    await auth.authLogin({ username: 'tester', password: 'initial' });
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
});
