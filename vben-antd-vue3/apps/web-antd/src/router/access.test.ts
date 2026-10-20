import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import type { RouteRecordRaw } from '@vben/types';
import { describe, expect, it, vi } from 'vitest';
import { generateAccess } from './access';
vi.mock('#/api', () => ({ getAllMenusApi: vi.fn() }));
vi.mock('#/layouts', () => ({ BasicLayout: {}, IFrameView: {} }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/router/routes', () => ({ coreRouteNames: ['Root', 'PermissionForbidden', 'Login'] }));
vi.mock('ant-design-vue', () => ({ message: { loading: vi.fn() } }));

describe('permission route rebuilding', () => {
  it('unmounts old business routes after switching permission sets and retains core routes', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { name: 'Root', path: '/', component: defineComponent({ render: () => null }), children: [{ name: 'PermissionForbidden', path: 'forbidden', component: defineComponent({ render: () => null }) }] },
      { name: 'Login', path: '/auth/login', component: defineComponent({ render: () => null }) },
    ] });
    const routes: RouteRecordRaw[] = [
      { name: 'SystemUser', path: '/system/user', component: defineComponent({ render: () => null }), meta: { title: 'Users', authority: ['/system/user'] } },
      { name: 'Overview', path: '/dashboard/overview', component: defineComponent({ render: () => null }), meta: { title: 'Overview', authority: ['/dashboard/overview'] } },
    ];
    await generateAccess({ router, roles: ['/system/user'], routes, permissionMenus: [{ menu_key: 'admin:menu:account:operators', menu_path: '/system/user', btns: [] }], navigation: [{ resource_key: 'admin:account:operators', menu_key: 'admin:menu:account:operators', menu_path: '/system/user' }] });
    expect(router.hasRoute('SystemUser')).toBe(true);
    expect(router.getRoutes().find((route) => route.name === 'SystemUser')?.meta.title).toBe('resources.admin:account:operators');
    expect(router.hasRoute('Overview')).toBe(false);
    await generateAccess({ router, roles: ['/dashboard/overview'], routes, permissionMenus: [{ menu_key: 'admin:menu:dashboard:overview', menu_path: '/dashboard/overview', btns: [] }], navigation: [{ resource_key: 'admin:dashboard:overview', menu_key: 'admin:menu:dashboard:overview', menu_path: '/dashboard/overview' }] });
    expect(router.hasRoute('SystemUser')).toBe(false);
    expect(router.hasRoute('Overview')).toBe(true);
    expect(router.getRoutes().find((route) => route.name === 'Root')?.children.map((route) => route.name)).toEqual(['PermissionForbidden', 'Overview']);
    await generateAccess({ router, roles: [], routes });
    expect(router.hasRoute('Overview')).toBe(false);
    expect(router.hasRoute('PermissionForbidden')).toBe(true);
    expect(router.hasRoute('Root')).toBe(true);
    expect(router.hasRoute('Login')).toBe(true);
  });
});
