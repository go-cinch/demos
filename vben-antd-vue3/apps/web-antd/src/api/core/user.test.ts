import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authRequestClient } from '#/api/request';

import { getUserInfoApi } from './user';
vi.mock('#/api/request', () => ({ authRequestClient: { get: vi.fn() } }));
const user = { code: 'ABC12345', id: 1, scope: 'admin', username: 'operator' };
const menu = {
  menu_key: 'admin:menu:system:user',
  menu_path: '/system/user',
  btns: ['admin:btn:system:user:query'],
};
describe('scoped user permissions', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the scoped request client without a scope query and keeps permission identities separate', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      role: { id: 3, name: 'Operator', word: 'operator' },
      permission: { words: ['admin:read:system:user'], menus: [menu] },
    });
    const result = await getUserInfoApi();
    expect(authRequestClient.get).toHaveBeenCalledWith('/info', {
      params: { f: 'id,username,code,role,scope,permission' },
    });
    expect(result.roles).toEqual(['/system/user']);
    expect(result.permission.words).toEqual(['admin:read:system:user']);
    expect(result.permission.menus[0]?.btns).toEqual([
      'admin:btn:system:user:query',
    ]);
    expect(result.roleName).toBe('Operator');
    expect(result.homePath).toBe('/system/user');
  });
  it('does not promote a role, wildcard, wrong scope or business word to page/button access', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      role: { id: 1, name: 'Admin', word: 'admin' },
      permission: {
        words: ['*', 'mini:read:system:user'],
        menus: [{ ...menu, menu_key: 'mini:menu:system:user' }],
      },
    });
    const result = await getUserInfoApi();
    expect(result.roles).toEqual([]);
    expect(result.permission).toEqual({ words: [], menus: [] });
    expect(result.homePath).toBe('/forbidden');
  });
  it('deduplicates buttons within their page and rejects mismatched response scopes', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [
          menu,
          menu,
          {
            ...menu,
            menu_path: '/system/role',
            btns: ['admin:btn:system:role:delete'],
          },
        ],
      },
    });
    expect((await getUserInfoApi()).permission.menus).toHaveLength(1);
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      scope: 'mini',
    });
    await expect(getUserInfoApi()).rejects.toThrow('Invalid permission scope');
  });
  it('filters navigation through authorized pages and scope while preserving catalog order', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [menu],
        navigation: [
          {
            resource_key: 'admin:audit',
            children: [
              {
                resource_key: 'admin:audit:user',
                menu_key: menu.menu_key,
                menu_path: menu.menu_path,
              },
              {
                resource_key: 'admin:audit:role',
                menu_key: 'admin:menu:system:role',
                menu_path: '/system/role',
              },
            ],
          },
          {
            resource_key: 'mini:other',
            children: [
              {
                resource_key: 'mini:other:user',
                menu_key: menu.menu_key,
                menu_path: menu.menu_path,
              },
            ],
          },
        ],
      },
    });
    expect((await getUserInfoApi()).permission.navigation).toEqual([
      {
        resource_key: 'admin:audit',
        children: [
          {
            resource_key: 'admin:audit:user',
            menu_key: menu.menu_key,
            menu_path: menu.menu_path,
          },
        ],
      },
    ]);
  });
  it('retains explicitly granted developer menus, buttons and navigation without all permissions', async () => {
    const developerMenu = {
      menu_key: 'admin:menu:system:developer',
      menu_path: '/system/developer',
      btns: ['admin:btn:system:developer:publish'],
    };
    const navigation = [
      {
        resource_key: 'admin:system',
        children: [
          {
            resource_key: 'admin:system:developer',
            menu_key: developerMenu.menu_key,
            menu_path: developerMenu.menu_path,
          },
        ],
      },
    ];
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      username: 'developer',
      role: { id: 4, name: 'Developer', word: 'developer' },
      permission: {
        words: ['admin:update:system:developer'],
        menus: [developerMenu],
        navigation,
      },
    });
    const result = await getUserInfoApi();
    expect(result.permission.words).not.toContain('admin:all:system:all');
    expect(result.permission.menus).toEqual([developerMenu]);
    expect(result.permission.navigation).toEqual(navigation);
    expect(result.roles).toEqual(['/system/developer']);
  });
  it('does not grant the developer page from its word or role when the backend omits its page entry', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      role: { id: 4, name: 'Developer', word: 'developer' },
      permission: {
        words: ['admin:update:system:developer'],
        menus: [menu],
        navigation: [
          {
            resource_key: 'admin:system',
            children: [
              {
                resource_key: 'admin:system:developer',
                menu_key: 'admin:menu:system:developer',
                menu_path: '/system/developer',
              },
            ],
          },
        ],
      },
    });
    const result = await getUserInfoApi();
    expect(result.permission.menus).toEqual([menu]);
    expect(result.permission.navigation).toEqual([]);
    expect(result.roles).not.toContain('/system/developer');
  });
  it('normalizes assignment scopes separately from business words and wildcard authority', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        permission_scope: '*',
        permission_scopes: [
          ' user:update ',
          'user:update',
          'role:read',
          'user:*',
          'admin:user:update',
          1,
          '',
        ],
        words: [
          ' admin:read:system:user ',
          'admin:read:system:user',
          'mini:read:system:user',
          null,
        ],
        menus: [menu],
      },
    });
    expect((await getUserInfoApi()).permission).toMatchObject({
      permission_scope: '*',
      permission_scopes: ['user:update', 'role:read'],
      words: ['admin:read:system:user'],
    });
  });
  it('drops external and relative page paths and cross-page button identifiers', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [
          { ...menu, menu_path: '//outside.example' },
          { ...menu, menu_path: 'system/user' },
          {
            ...menu,
            btns: [
              menu.btns[0],
              'admin:btn:system:role:delete',
              'mini:btn:system:user:query',
              '*',
            ],
          },
        ],
      },
    });
    expect((await getUserInfoApi()).permission.menus).toEqual([menu]);
  });
  it('prefers an authorized overview and fails closed when permission data is absent', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [
          menu,
          {
            menu_key: 'admin:menu:dashboard:overview',
            menu_path: '/dashboard/overview',
            btns: [],
          },
        ],
      },
    });
    expect((await getUserInfoApi()).homePath).toBe('/dashboard/overview');
    vi.mocked(authRequestClient.get).mockResolvedValue(user);
    expect(await getUserInfoApi()).toMatchObject({
      homePath: '/forbidden',
      roles: [],
      permission: { words: [], menus: [] },
    });
  });
});
