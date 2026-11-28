import type { RouteRecordRaw } from '@vben/types';

import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import { generateAccess } from './access';
import {
  installPermissionRoutes,
  trackPermissionRouteChanges,
} from './permission-routes';
vi.mock('#/layouts', () => ({ BasicLayout: {}, IFrameView: {} }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/router/routes', () => ({
  coreRouteNames: ['Root', 'PermissionForbidden', 'Login'],
}));
vi.mock('ant-design-vue', () => ({ message: { loading: vi.fn() } }));

const EmptyPage = defineComponent({ render: () => null });

describe('permission route rebuilding', () => {
  it('retains the matched layout and cached role when the navigation catalog changes during a tab switch', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ name: 'Root', path: '/', component: EmptyPage }],
    });
    const user = { menu_key: 'menu:user', menu_path: '/user', btns: [] };
    const role = { menu_key: 'menu:role', menu_path: '/role', btns: [] };
    const routes: RouteRecordRaw[] = [
      { name: 'User', path: user.menu_path, component: EmptyPage },
      {
        name: 'Role',
        path: role.menu_path,
        component: async () => EmptyPage,
        meta: { keepAlive: true, title: 'Role' },
      },
    ];
    const permissions = {
      router,
      routes,
      roles: ['/role', '/user'],
      permissionMenus: [user, role],
      navigation: [
        { ...role, resource_key: 'initial-role' },
        { ...user, resource_key: 'user' },
      ],
    };
    await generateAccess(permissions);
    await router.push('/role');
    const [layout, cachedRole] = router.currentRoute.value.matched;
    const cachedType = cachedRole!.components!.default;
    await router.push('/user');
    const openUser = router.currentRoute.value.matched.at(-1);
    router.beforeEach(async (to) => {
      if (to.path === '/role')
        await generateAccess({
          ...permissions,
          navigation: [
            { ...user, resource_key: 'user' },
            { ...role, resource_key: 'renamed-role' },
          ],
        });
    });
    await router.push('/role');
    const matched = router.currentRoute.value.matched;
    expect(router.resolve('/role').matched[0]).toBe(layout);
    expect(router.resolve('/role').matched.at(-1)).toBe(cachedRole);
    expect(matched.at(-1)).toBe(cachedRole);
    expect(cachedRole!.components!.default).toBe(cachedType);
    expect(cachedRole!.meta.title).toBe('resources.renamed-role');
    expect(router.resolve('/user').matched.at(-1)).toBe(openUser);
  });

  it('rematches a moved open page with its query and hash and lets a newer navigation win', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ name: 'Root', path: '/', component: EmptyPage }],
    });
    trackPermissionRouteChanges(router);
    const user = { name: 'User', path: '/user', component: EmptyPage };
    const role = { name: 'Role', path: '/role', component: EmptyPage };
    const moveRole = (parent: string) =>
      installPermissionRoutes(router, [
        user,
        {
          name: parent,
          path: '/' + parent,
          redirect: '/role',
          children: [role],
        },
      ]);
    moveRole('first');
    await router.push('/role?q=one#details');
    const moved = new Promise<void>((resolve) => {
      const dispose = router.afterEach(() => {
        dispose();
        resolve();
      });
    });
    moveRole('second');
    await moved;
    expect(router.currentRoute.value.fullPath).toBe('/role?q=one#details');
    expect(
      router.currentRoute.value.matched.map((record) => record.name),
    ).toEqual(['Root', 'second', 'Role']);
    router.beforeEach((to) => {
      if (to.name === 'User') moveRole('third');
    });
    await router.push('/user');
    expect(router.currentRoute.value.name).toBe('User');
    expect(
      router.resolve('/role').matched.map((record) => record.name),
    ).toEqual(['Root', 'third', 'Role']);
  });

  it('unmounts old business routes after switching permission sets and retains core routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          name: 'Root',
          path: '/',
          component: EmptyPage,
          children: [
            {
              name: 'PermissionForbidden',
              path: 'forbidden',
              component: EmptyPage,
            },
          ],
        },
        { name: 'Login', path: '/auth/login', component: EmptyPage },
      ],
    });
    const routes: RouteRecordRaw[] = [
      {
        name: 'SystemUser',
        path: '/system/user',
        component: EmptyPage,
        meta: { title: 'Users', authority: ['/system/user'] },
      },
      {
        name: 'Overview',
        path: '/dashboard/overview',
        component: EmptyPage,
        meta: { title: 'Overview', authority: ['/dashboard/overview'] },
      },
    ];
    await generateAccess({
      router,
      roles: ['/system/user'],
      routes,
      permissionMenus: [
        {
          menu_key: 'admin:menu:account:operators',
          menu_path: '/system/user',
          btns: [],
        },
      ],
      navigation: [
        {
          resource_key: 'admin:account:operators',
          menu_key: 'admin:menu:account:operators',
          menu_path: '/system/user',
        },
      ],
    });
    expect(router.hasRoute('SystemUser')).toBe(true);
    expect(
      router.getRoutes().find((route) => route.name === 'SystemUser')?.meta
        .title,
    ).toBe('resources.admin:account:operators');
    expect(router.hasRoute('Overview')).toBe(false);
    await generateAccess({
      router,
      roles: ['/dashboard/overview'],
      routes,
      permissionMenus: [
        {
          menu_key: 'admin:menu:dashboard:overview',
          menu_path: '/dashboard/overview',
          btns: [],
        },
      ],
      navigation: [
        {
          resource_key: 'admin:dashboard:overview',
          menu_key: 'admin:menu:dashboard:overview',
          menu_path: '/dashboard/overview',
        },
      ],
    });
    expect(router.hasRoute('SystemUser')).toBe(false);
    expect(router.hasRoute('Overview')).toBe(true);
    expect(
      router
        .getRoutes()
        .find((route) => route.name === 'Root')
        ?.children.map((route) => route.name),
    ).toEqual(['PermissionForbidden', 'Overview']);
    await generateAccess({ router, roles: [], routes });
    expect(router.hasRoute('Overview')).toBe(false);
    expect(router.hasRoute('PermissionForbidden')).toBe(true);
    expect(router.hasRoute('Root')).toBe(true);
    expect(router.hasRoute('Login')).toBe(true);
  });
});
