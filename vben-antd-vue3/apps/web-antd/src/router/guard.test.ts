import type { NavigationGuard, Router } from 'vue-router';

import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import { createRouterGuard } from './guard';
import { coreRoutes } from './routes/core';

const state = vi.hoisted(() => ({
  access: {
    accessToken: null as null | string,
    isAccessChecked: false,
    setAccessMenus: vi.fn(),
    setAccessRoutes: vi.fn(),
    setIsAccessChecked: vi.fn(),
  },
  user: { userInfo: null as null | Record<string, unknown> },
  auth: {
    passwordResetRequired: false,
    totpEnrollmentRequired: false,
    restoreSession: vi.fn(),
    fetchUserInfo: vi.fn(),
  },
  properties: vi.fn(),
  generateAccess: vi.fn(),
  startProgress: vi.fn(),
  stopProgress: vi.fn(),
}));
vi.mock('@vben/preferences', () => ({
  preferences: {
    app: { defaultHomePath: '/dashboard/overview' },
    transition: { progress: true },
  },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => state.access,
  useUserStore: () => state.user,
}));
vi.mock('@vben/utils', () => ({
  startProgress: state.startProgress,
  stopProgress: state.stopProgress,
}));
vi.mock('#/store', () => ({ useAuthStore: () => state.auth }));
vi.mock('#/router/routes', () => ({
  coreRouteNames: [
    'Login',
    'Register',
    'ResetPassword',
    'PersonalProfileFallback',
    'PermissionForbidden',
  ],
  accessRoutes: [],
}));
vi.mock('#/store/system-properties', () => ({
  loadSystemProperties: state.properties,
}));
vi.mock('./access', () => ({ generateAccess: state.generateAccess }));

let router: Router;
let guards: NavigationGuard[];
let afterNavigation: () => void;
let failNavigation: () => void;
function resolved(path: string) {
  const route = router.resolve(path);
  return { ...route, name: route.name ?? undefined };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  state.access.accessToken = null;
  state.access.isAccessChecked = false;
  state.user.userInfo = null;
  state.auth.passwordResetRequired = false;
  state.auth.totpEnrollmentRequired = false;
  state.auth.fetchUserInfo.mockResolvedValue({
    email: 'bound@example.com',
    emailBindingRequired: false,
    permission: { menus: [], navigation: [] },
  });
  state.auth.restoreSession.mockResolvedValue(false);
  state.generateAccess.mockResolvedValue({
    accessibleMenus: ['menu'],
    accessibleRoutes: ['route'],
  });
  state.access.setIsAccessChecked.mockImplementation((value) => {
    state.access.isAccessChecked = value;
  });
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...coreRoutes,
      { path: '/system/user', name: 'User', component: {} },
      { path: '/dashboard/overview', name: 'Overview', component: {} },
      {
        path: '/public',
        name: 'Public',
        component: {},
        meta: { title: 'Public', ignoreAccess: true },
      },
    ],
  });
  guards = [];
  vi.spyOn(router, 'beforeEach').mockImplementation((guard) => {
    guards.push(guard);
    return () => {};
  });
  vi.spyOn(router, 'afterEach').mockImplementation((guard) => {
    afterNavigation = () =>
      guard(resolved('/system/user'), resolved('/auth/login'), undefined);
    return () => {};
  });
  vi.spyOn(router, 'onError').mockImplementation((handler) => {
    failNavigation = () =>
      handler(
        new Error('navigation'),
        resolved('/system/user'),
        resolved('/auth/login'),
      );
    return () => {};
  });
  createRouterGuard(router);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const access = (path: string, from = '/auth/login') =>
  required(guards[1])(resolved(path), resolved(from), vi.fn());

describe('route authorization', () => {
  it('re-resolves a pending target if permission loading replaces its same-name route record', async () => {
    state.access.accessToken = 'session';
    state.access.isAccessChecked = true;
    const permission = { menus: [{ menu_path: '/system/user', btns: [] }] };
    state.auth.fetchUserInfo.mockImplementationOnce(async () => {
      router.addRoute({ name: 'User', path: '/system/user', component: {} });
      return { permission };
    });
    const target = '/system/user?q=test#details';
    await expect(access(target)).resolves.toMatchObject({
      fullPath: target,
      replace: true,
    });
    state.auth.fetchUserInfo.mockResolvedValue({ permission });
    await expect(access(target)).resolves.toBe(true);
  });

  it('repairs legacy login URLs while preserving unrelated query and hash', async () => {
    const nested = `/auth/bind-totp?redirect=${encodeURIComponent(encodeURIComponent('/system/user?code=A%26B#account'))}`;
    const result = await access(
      `/auth/login?lang=en&redirect=${encodeURIComponent(encodeURIComponent(nested))}#login`,
    );
    expect(result).toEqual({
      path: '/auth/login',
      query: { lang: 'en', redirect: '/system/user?code=A%26B#account' },
      hash: '#login',
      replace: true,
    });
    await expect(access(router.resolve(result as any).fullPath)).resolves.toBe(
      true,
    );
  });

  it('removes authentication-only loops and duplicate redirect parameters', async () => {
    for (const path of [
      '/auth/login?redirect=%252Fauth%252Fbind-totp%253Fredirect%253D%2525252Fauth%2525252Fbind-totp',
      '/auth/login?redirect=/profile&redirect=/system/user',
    ]) {
      await expect(access(path)).resolves.toEqual({
        path: '/auth/login',
        query: {},
        hash: '',
        replace: true,
      });
    }
  });

  it.each(['totpEnrollmentRequired', 'passwordResetRequired'] as const)(
    'retains a protected page through %s',
    async (requirement) => {
      state.access.accessToken = 'pending';
      state.auth[requirement] = true;
      await expect(
        access('/system/user?code=A%26B#account'),
      ).resolves.toMatchObject({
        query: { redirect: '/system/user?code=A%26B#account' },
        replace: true,
      });
    },
  );

  it('initializes the sidebar when a restored session opens the profile fallback directly', async () => {
    const permission = {
      menus: [
        {
          menu_key: 'admin:menu:system:user',
          menu_path: '/system/user',
          btns: [],
        },
      ],
      navigation: [
        {
          resource_key: 'admin:system:user',
          menu_key: 'admin:menu:system:user',
          menu_path: '/system/user',
        },
      ],
    };
    state.auth.restoreSession.mockImplementation(async () => {
      state.access.accessToken = 'restored';
      return true;
    });
    state.auth.fetchUserInfo.mockResolvedValue({
      roles: ['/system/user'],
      permission,
    });
    const target = '/profile?tab=account#security';
    await expect(access(target, '/')).resolves.toMatchObject({
      fullPath: target,
      replace: true,
    });
    expect(state.generateAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionMenus: permission.menus,
        navigation: permission.navigation,
      }),
    );
    expect(state.access.setAccessMenus).toHaveBeenCalledWith(['menu']);
    await expect(access(target, '/')).resolves.toBe(true);
    expect(state.generateAccess).toHaveBeenCalledTimes(1);
  });

  it('requires a session for profile while keeping registration public', async () => {
    await expect(access('/profile', '/')).resolves.toMatchObject({
      path: '/auth/login',
      query: { redirect: '/profile' },
    });
    await expect(
      access('/auth/register?redirect=/profile', '/'),
    ).resolves.toEqual({
      path: '/auth/login',
      query: { redirect: '/profile' },
      replace: true,
    });
    state.properties.mockResolvedValue({ registration_enabled: true });
    await expect(access('/auth/register', '/')).resolves.toBe(true);
    expect(state.generateAccess).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'opens the email confirmation link only with delivery enabled (%s)',
    async (enabled) => {
      state.properties.mockResolvedValue({ email_enabled: enabled });
      await expect(access('/auth/unbind-email#token=example')).resolves.toEqual(
        enabled ? true : { path: '/auth/login', replace: true },
      );
      expect(state.auth.restoreSession).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'checks the deployment setting for a direct authenticator enrollment visit (%s)',
    async (enabled) => {
      state.access.accessToken = 'access';
      state.properties.mockResolvedValue({
        email_enabled: false,
        totp_enabled: enabled,
      });
      state.auth.fetchUserInfo.mockResolvedValue({
        permission: { menus: [], profile_actions: ['enroll_totp'] },
      });
      await expect(access('/auth/bind-totp')).resolves.toEqual(
        enabled ? true : { path: '/profile', replace: true },
      );
    },
  );

  it.each(['/auth/bind-totp', '/auth/bind-email'])(
    'returns an account without the optional binding grant to its landing page from %s',
    async (path) => {
      state.access.accessToken = 'access';
      state.properties.mockResolvedValue({
        email_enabled: true,
        totp_enabled: true,
      });
      await expect(access(path)).resolves.toEqual({
        path: '/profile',
        replace: true,
      });
    },
  );

  it('redirects a direct optional binding visit when email is disabled', async () => {
    state.access.accessToken = 'access';
    state.properties.mockResolvedValue({ email_enabled: false });
    state.auth.fetchUserInfo.mockResolvedValue({
      email: '',
      emailBindingRequired: false,
      permission: { menus: [] },
    });
    await expect(access('/auth/bind-email')).resolves.toEqual({
      path: '/profile',
      replace: true,
    });
  });

  it('restores a session before deciding whether to redirect and preserves the intended URL', async () => {
    await expect(access('/system/user?code=USER1')).resolves.toEqual({
      path: '/auth/login',
      replace: true,
      query: { redirect: '/system/user?code=USER1' },
    });
    expect(state.auth.restoreSession).toHaveBeenCalledOnce();
    await expect(access('/dashboard/overview')).resolves.toEqual({
      path: '/auth/login',
      replace: true,
      query: {},
    });
    await expect(access('/public')).resolves.toBe(true);
  });

  it('keeps first-login sessions on password reset until the restriction is removed', async () => {
    state.access.accessToken = 'pending';
    state.auth.passwordResetRequired = true;
    await expect(access('/system/user')).resolves.toEqual({
      path: '/auth/reset-password',
      query: { redirect: '/system/user' },
      replace: true,
    });
    await expect(access('/auth/reset-password')).resolves.toBe(true);
    expect(state.auth.fetchUserInfo).not.toHaveBeenCalled();
    expect(state.generateAccess).not.toHaveBeenCalled();
    state.auth.passwordResetRequired = false;
    state.user.userInfo = { homePath: '/system/user' };
    state.auth.fetchUserInfo.mockResolvedValue({
      permission: { menus: [{ menu_path: '/system/user' }] },
    });
    await expect(access('/auth/reset-password')).resolves.toEqual({
      path: '/system/user',
      replace: true,
    });
  });

  it('rechecks cached business routes and blocks revoked page access', async () => {
    state.access.accessToken = 'access';
    state.access.isAccessChecked = true;
    state.auth.fetchUserInfo.mockResolvedValue({ permission: { menus: [] } });
    await expect(access('/system/user')).resolves.toEqual({
      path: '/forbidden',
      replace: true,
    });
    state.auth.fetchUserInfo.mockResolvedValue({
      permission: { menus: [{ menu_path: '/system/user' }] },
    });
    await expect(access('/system/user')).resolves.toBe(true);
    expect(state.auth.fetchUserInfo).toHaveBeenCalledTimes(2);
  });

  it('publishes only generated routes and forwards backend permission navigation', async () => {
    const info = {
      roles: ['/system/user'],
      homePath: '/system/user',
      permission: {
        menus: [
          {
            menu_key: 'admin:menu:system:user',
            menu_path: '/system/user',
            btns: [],
          },
        ],
        navigation: [
          {
            resource_key: 'admin:system:user',
            menu_key: 'admin:menu:system:user',
            menu_path: '/system/user',
          },
        ],
      },
    };
    state.auth.restoreSession.mockImplementation(async () => {
      state.access.accessToken = 'restored';
      return true;
    });
    state.auth.fetchUserInfo.mockResolvedValue(info);
    await expect(access('/dashboard/overview')).resolves.toMatchObject({
      path: '/system/user',
      replace: true,
    });
    expect(state.generateAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: info.roles,
        permissionMenus: info.permission.menus,
        navigation: info.permission.navigation,
        router,
      }),
    );
    expect(state.access.setAccessMenus).toHaveBeenCalledWith(['menu']);
    expect(state.access.setAccessRoutes).toHaveBeenCalledWith(['route']);
    expect(state.access.setIsAccessChecked).toHaveBeenCalledWith(true);
  });

  it('distinguishes login redirect fallback from direct denied navigation after reload', async () => {
    state.access.accessToken = 'access';
    state.auth.fetchUserInfo.mockResolvedValue({
      roles: ['/system/user'],
      emailBindingRequired: false,
      permission: { menus: [{ menu_path: '/system/user' }], navigation: [] },
    });
    await expect(
      access('/dashboard/overview', '/system/user'),
    ).resolves.toMatchObject({ path: '/forbidden', replace: true });
    state.access.isAccessChecked = false;
    await expect(
      access(
        '/dashboard/overview',
        '/auth/login?redirect=%2Fdashboard%2Foverview',
      ),
    ).resolves.toMatchObject({ path: '/system/user', replace: true });
    state.access.isAccessChecked = false;
    await expect(
      access(
        '/system/user',
        '/auth/login?redirect=%2Fsystem%2Fuser%3Fview%3Dmine%23account',
      ),
    ).resolves.toMatchObject({
      path: '/system/user',
      query: { view: 'mine' },
      hash: '#account',
      replace: true,
    });
  });

  it('propagates permission loading failures without acknowledging access as checked', async () => {
    state.access.accessToken = 'access';
    state.auth.fetchUserInfo.mockRejectedValue(new Error('offline'));
    await expect(access('/system/user')).rejects.toThrow('offline');
    expect(state.access.setIsAccessChecked).not.toHaveBeenCalled();
  });
});

describe('navigation progress cleanup', () => {
  it('stops progress on failure or completion and cancels its deadline', async () => {
    required(guards[0])(
      resolved('/system/user'),
      resolved('/auth/login'),
      vi.fn(),
    );
    expect(state.startProgress).toHaveBeenCalledOnce();
    failNavigation();
    const count = state.stopProgress.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.stopProgress).toHaveBeenCalledTimes(count);
    afterNavigation();
    const to = resolved('/system/user');
    required(guards[0])(to, resolved('/auth/login'), vi.fn());
    expect(to.meta.loaded).toBe(true);
    expect(state.startProgress).toHaveBeenCalledOnce();
  });
});
