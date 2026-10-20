import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import type { PermissionMenu, PermissionNavigation } from '#/api/core/user';
import { resourceNavigationRoutes } from './navigation';

import { generateAccessible } from '@vben/access';

import { BasicLayout, IFrameView } from '#/layouts';
import { coreRouteNames } from '#/router/routes';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(options: GenerateMenuAndRoutesOptions & { permissionMenus?: PermissionMenu[]; navigation?: PermissionNavigation[] }) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  // Remove prior business routes before rebuilding the current navigation.
  const root = options.router.getRoutes().find((route) => route.path === '/');
  if (root) root.children = root.children.filter((route) => coreRouteNames.includes(route.name as string));
  return await generateAccessible('frontend', {
    ...options,
    routes: resourceNavigationRoutes(options.routes, options.permissionMenus ?? [], options.navigation ?? []),
    // 可以指定没有权限跳转403页面
    forbiddenComponent,
    // 如果 route.meta.menuVisibleWithForbidden = true
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
