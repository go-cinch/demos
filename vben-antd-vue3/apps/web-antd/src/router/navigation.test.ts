import { describe, expect, it } from 'vitest';
import type { RouteRecordRaw } from '@vben/types';
import { resourceNavigationRoutes } from './navigation';

describe('resource navigation', () => {
  const routes: RouteRecordRaw[] = [
    {
      path: '/system',
      name: 'System',
      meta: { title: 'menus.admin:menu:system', order: 1 },
      children: [
        {
          path: 'user',
          name: 'User',
          component: {},
          meta: { title: 'User', order: 0 },
        },
        {
          path: 'role',
          name: 'Role',
          component: {},
          meta: { title: 'Role', order: 1 },
        },
      ],
    },
    {
      path: '/audit',
      name: 'Audit',
      meta: { title: 'menus.admin:menu:audit', order: 99 },
      children: [{ path: 'login', name: 'Logs', component: {} }],
    },
    { path: '/profile', name: 'Profile', component: {} },
  ];
  const menus = [
    { menu_key: 'admin:menu:system:user', menu_path: '/system/user', btns: [] },
    { menu_key: 'admin:menu:audit:login', menu_path: '/audit/login', btns: [] },
    { menu_key: 'admin:menu:profile', menu_path: '/profile', btns: [] },
  ];
  it('uses catalog hierarchy/order while preserving page components and paths', () => {
    const result = resourceNavigationRoutes(routes, menus, [
      {
        resource_key: 'admin:audit',
        children: [
          {
            resource_key: 'admin:audit:login',
            menu_key: menus[1]!.menu_key,
            menu_path: '/audit/login',
          },
          {
            resource_key: 'admin:audit:user',
            menu_key: menus[0]!.menu_key,
            menu_path: '/system/user',
          },
          {
            resource_key: 'admin:audit:role',
            menu_key: 'admin:menu:role',
            menu_path: '/system/role',
          },
        ],
      },
    ]);
    expect(result[0]?.path).toBe('/audit');
    expect(result[0]?.children?.map((page) => page.path)).toEqual([
      '/audit/login',
      '/system/user',
    ]);
    expect(result[0]?.children?.[1]?.meta?.title).toBe(
      'resources.admin:audit:user',
    );
    expect(result[1]).toMatchObject({
      path: '/profile',
      meta: { hideInMenu: true },
    });
    expect(routes[0]?.children?.[0]?.path).toBe('user');
  });
  it('hides all navigation when roots are hidden and preserves authorized direct routes', () => {
    const result = resourceNavigationRoutes(routes, menus, []);
    expect(result.map((page) => page.path)).toEqual(
      menus.map((menu) => menu.menu_path),
    );
    expect(result.every((page) => page.meta?.hideInMenu)).toBe(true);
  });
  it('supports new and nested directories without static directory definitions', () => {
    const result = resourceNavigationRoutes(routes, menus, [
      {
        resource_key: 'admin:new',
        children: [
          {
            resource_key: 'admin:new:nested',
            children: [
              {
                resource_key: 'admin:new:nested:user',
                menu_key: menus[0]!.menu_key,
                menu_path: '/system/user',
              },
            ],
          },
        ],
      },
    ]);
    expect(result[0]?.path).toBe('/_resource/admin/new');
    expect(result[0]?.children?.[0]?.children?.[0]?.path).toBe('/system/user');
  });
});
