import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import type { PermissionMenu, PermissionNavigation } from '#/api/core/user';

import { prepareAccessibleRoutes } from '@vben/access';
import { generateMenus } from '@vben/utils';
import { userCache } from '@vben/utils/cache';

import { BasicLayout, IFrameView } from '#/layouts';

import { resourceNavigationRoutes } from './navigation';
import { installPermissionRoutes } from './permission-routes';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(
  options: GenerateMenuAndRoutesOptions & {
    permissionMenus?: PermissionMenu[];
    navigation?: PermissionNavigation[];
  },
) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  const current = userCache.capture();
  const accessibleRoutes = await prepareAccessibleRoutes('frontend', {
    ...options,
    routes: resourceNavigationRoutes(
      options.routes,
      options.permissionMenus ?? [],
      options.navigation ?? [],
    ),
    // 可以指定没有权限跳转403页面
    forbiddenComponent,
    // 如果 route.meta.menuVisibleWithForbidden = true
    layoutMap,
    pageMap,
  });
  if (!current()) throw new Error('Navigation belongs to an expired session');
  installPermissionRoutes(options.router, accessibleRoutes);
  return {
    accessibleRoutes,
    accessibleMenus: generateMenus(accessibleRoutes, options.router),
  };
}

export { generateAccess };
