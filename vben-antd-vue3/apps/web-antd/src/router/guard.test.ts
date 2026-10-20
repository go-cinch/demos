import type { NavigationGuard, Router } from 'vue-router';

import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterGuard } from './guard';

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
    restoreSession: vi.fn(),
    fetchUserInfo: vi.fn(),
  },
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
  coreRouteNames: ['Login', 'Reset', 'Forbidden'],
  accessRoutes: [],
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
      { path: '/auth/login', name: 'Login', component: {} },
      { path: '/auth/reset-password', name: 'Reset', component: {} },
      { path: '/forbidden', name: 'Forbidden', component: {} },
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
      guard(
        resolved('/system/user'),
        resolved('/auth/login'),
        undefined,
      );
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
  guards[1]!(resolved(path), resolved(from), vi.fn());

describe('route authorization', () => {
  it('restores a session before deciding whether to redirect and preserves the intended URL', async () => {
    await expect(access('/system/user?code=USER1')).resolves.toEqual({
      path: '/auth/login',
      replace: true,
      query: { redirect: encodeURIComponent('/system/user?code=USER1') },
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
      replace: true,
    });
    await expect(access('/auth/reset-password')).resolves.toBe(true);
    expect(state.auth.fetchUserInfo).not.toHaveBeenCalled();
    expect(state.generateAccess).not.toHaveBeenCalled();
    state.auth.passwordResetRequired = false;
    state.user.userInfo = { homePath: '/system/user' };
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

  it('propagates permission loading failures without acknowledging access as checked', async () => {
    state.access.accessToken = 'access';
    state.auth.fetchUserInfo.mockRejectedValue(new Error('offline'));
    await expect(access('/system/user')).rejects.toThrow('offline');
    expect(state.access.setIsAccessChecked).not.toHaveBeenCalled();
  });
});

describe('navigation progress cleanup', () => {
  it('stops progress on failure or completion and cancels its deadline', async () => {
    guards[0]!(
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
    guards[0]!(to, resolved('/auth/login'), vi.fn());
    expect(to.meta.loaded).toBe(true);
    expect(state.startProgress).toHaveBeenCalledOnce();
  });
});
