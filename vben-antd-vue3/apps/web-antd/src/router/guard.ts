import type { Router } from 'vue-router';

import type { UserInfoWithPermissions } from '#/api/core/user';

import { ref } from 'vue';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';
import { browserSession } from '@vben/stores/session';
import { startProgress, stopProgress } from '@vben/utils';
import { userCache } from '@vben/utils/cache';

import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';
import {
  canVisitAuthenticatedPage,
  loginDestination,
  loginRedirectQuery,
} from '#/store/login-destination';
import { loadSystemProperties } from '#/store/system-properties';

import { generateAccess } from './access';
import { matchChanged } from './permission-routes';

// A failed initial navigation has no mounted route to render its retry action.
export const sessionRetryTarget = ref('');

/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();
  let progressDeadline: ReturnType<typeof setTimeout> | undefined;

  router.beforeEach((to) => {
    clearTimeout(progressDeadline);
    stopProgress();
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded && preferences.transition.progress) {
      startProgress();
      progressDeadline = setTimeout(stopProgress, 10_000);
    }
    return true;
  });

  router.onError(() => {
    clearTimeout(progressDeadline);
    stopProgress();
  });
  router.afterEach((to, _from, failure) => {
    if (!failure) sessionRetryTarget.value = '';
    clearTimeout(progressDeadline);
    // 记录页面是否加载,如果已经加载，后续的页面切换动画等效果不在重复执行

    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (preferences.transition.progress) {
      stopProgress();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
async function enabled(feature: 'email_enabled' | 'registration_enabled') {
  const properties = await loadSystemProperties();
  return properties?.[feature] === true;
}
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    // Repair bookmarked legacy links before any login/onboarding handoff.
    if (to.path.startsWith('/auth/') && 'redirect' in to.query) {
      const normalized = loginRedirectQuery(to.query.redirect);
      const query = { ...to.query, ...normalized };
      if (!normalized.redirect) delete query.redirect;
      if (query.redirect !== to.query.redirect) {
        return { path: to.path, query, hash: to.hash, replace: true };
      }
    }
    // The single-use email link identifies its owner independently of this browser session.
    if (to.name === 'UnbindEmail') {
      const properties = await loadSystemProperties();
      return properties?.email_enabled === true
        ? true
        : { path: LOGIN_PATH, replace: true };
    }
    const accessStore = useAccessStore();
    const authStore = useAuthStore();

    if (
      !accessStore.accessToken &&
      (await authStore.restoreSession()) === 'unavailable'
    ) {
      sessionRetryTarget.value = to.fullPath;
      return false;
    }

    if (accessStore.accessToken && authStore.totpEnrollmentRequired) {
      return to.path === '/auth/bind-totp'
        ? true
        : {
            path: '/auth/bind-totp',
            query: loginRedirectQuery(to.fullPath),
            replace: true,
          };
    }
    if (accessStore.accessToken && authStore.passwordResetRequired) {
      return to.path === '/auth/reset-password'
        ? true
        : {
            path: '/auth/reset-password',
            query: loginRedirectQuery(to.fullPath),
            replace: true,
          };
    }
    let currentInfo: undefined | UserInfoWithPermissions;
    if (accessStore.accessToken) {
      currentInfo = await authStore.fetchUserInfo();
      if (currentInfo.emailBindingRequired && to.path !== '/auth/bind-email') {
        return {
          path: '/auth/bind-email',
          query: loginRedirectQuery(to.fullPath),
          replace: true,
        };
      }
      if (
        to.path === '/profile' &&
        to.query.focus === 'email' &&
        currentInfo.email
      ) {
        const { focus: _focus, ...query } = to.query;
        return { path: to.path, query, hash: to.hash, replace: true };
      }
      if (to.redirectedFrom?.path === '/') {
        const home = loginDestination(currentInfo.permission);
        if (home !== to.fullPath) return { path: home, replace: true };
      }
    }
    if (to.path === '/auth/bind-email') {
      if (!accessStore.accessToken)
        return {
          path: LOGIN_PATH,
          query: loginRedirectQuery(to.fullPath),
          replace: true,
        };
      if (
        currentInfo &&
        (currentInfo.email ||
          (!currentInfo.emailBindingRequired &&
            (!currentInfo.permission.profile_actions?.includes('bind_email') ||
              !(await enabled('email_enabled')))))
      ) {
        return {
          path: loginDestination(currentInfo.permission, to.query.redirect),
          replace: true,
        };
      }
      return true;
    }
    if (to.path === '/auth/bind-totp') {
      if (!currentInfo)
        return {
          path: LOGIN_PATH,
          query: loginRedirectQuery(to.fullPath),
          replace: true,
        };
      const properties = await loadSystemProperties();
      return properties?.totp_enabled === true &&
        currentInfo.permission.profile_actions?.includes('enroll_totp')
        ? true
        : {
            path: loginDestination(currentInfo.permission, to.query.redirect),
            replace: true,
          };
    }
    if (to.path === '/auth/reset-password') {
      return {
        path: currentInfo
          ? loginDestination(currentInfo.permission, to.query.redirect)
          : LOGIN_PATH,
        ...(currentInfo ? {} : { query: loginRedirectQuery(to.fullPath) }),
        replace: true,
      };
    }

    if (to.name === 'Register' && !(await enabled('registration_enabled'))) {
      return {
        path: LOGIN_PATH,
        query: loginRedirectQuery(to.query.redirect),
        replace: true,
      };
    }
    if (to.meta.ignoreAccess) {
      if (to.path === LOGIN_PATH && currentInfo) {
        return loginDestination(currentInfo.permission, to.query.redirect);
      }
      return true;
    }

    // accessToken 检查
    if (!currentInfo) {
      // 没有访问权限，跳转登录页面
      if (to.fullPath !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          // 如不需要，直接删除 query
          query:
            browserSession.detached ||
            to.fullPath === preferences.app.defaultHomePath
              ? {}
              : loginRedirectQuery(to.fullPath),
          // 携带当前跳转的页面，登录后重新跳转该页面
          replace: true,
        };
      }
      return to;
    }

    const { permission, roles } = currentInfo;
    const resolved = router.resolve(to.fullPath);
    // Authenticated layout fallbacks are available even with no menu grants.
    const allowed =
      coreRouteNames.includes(resolved.name as string) ||
      canVisitAuthenticatedPage(permission, to.path);

    if (accessStore.isAccessChecked) {
      if (!allowed) return { path: '/forbidden', replace: true };
      if (matchChanged(to, resolved))
        return { ...resolved, replace: true, force: true };
      return true;
    }

    // 生成菜单和路由
    const current = userCache.capture();
    const { accessibleMenus, accessibleRoutes } = await generateAccess({
      roles: roles ?? [],
      permissionMenus: permission.menus,
      navigation: permission.navigation,
      router,
      // 则会在菜单中显示，但是访问会被重定向到403
      routes: accessRoutes,
    });

    if (!current()) return false;
    // 保存菜单信息和路由信息
    accessStore.setAccessMenus(accessibleMenus);
    accessStore.setAccessRoutes(accessibleRoutes);
    accessStore.setIsAccessChecked(true);
    let destination = to.fullPath;
    if (from.path.startsWith('/auth/')) {
      destination = loginDestination(
        permission,
        from.query.redirect ?? to.fullPath,
      );
    } else if (!allowed) {
      // A direct navigation or reload is not a login redirect. Preserve the
      // business permission boundary instead of silently replacing the target.
      destination = '/forbidden';
    }
    return { ...router.resolve(destination), replace: true };
  });
}

/**
 * 项目守卫配置
 * @param router
 */
function createRouterGuard(router: Router) {
  /** 通用 */
  setupCommonGuard(router);
  /** 权限访问 */
  setupAccessGuard(router);
}

export { createRouterGuard };
