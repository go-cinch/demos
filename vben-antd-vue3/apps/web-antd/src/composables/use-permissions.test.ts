import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userInfo: null as null | Record<string, unknown> }));
vi.mock('@vben/stores', () => ({ useUserStore: () => state }));
vi.mock('#/api/core/user', () => ({ AUTH_SCOPE: 'admin' }));
import { usePermissions } from './use-permissions';

describe('configured permissions', () => {
  it('does not infer authority from action words or role labels', () => {
    state.userInfo = { scope: 'admin', roles: ['admin'], permission: { words: ['admin:all:system:all', 'admin:grant:system:permission-admin'], menus: [] } };
    expect(usePermissions().hasAllPermissions.value).toBe(false);
    expect(usePermissions().canAssignPermissions.value).toBe(false);
  });
  it('uses the wildcard permission scope and reacts to its removal', () => {
    const user = reactive({ scope: 'admin', permission: { permission_scope: '*' as string | undefined, words: ['admin:read:renamed:anything'], menus: [] } });
    state.userInfo = user;
    const permission = usePermissions();
    expect(permission.hasAllPermissions.value).toBe(true);
    user.permission.permission_scope = undefined;
    expect(permission.hasAllPermissions.value).toBe(false);
    user.permission.permission_scope = '*'; user.scope = 'mini';
    expect(permission.hasAllPermissions.value).toBe(false);
  });
  it('derives operation controls from explicit module button grants', () => {
    state.userInfo = { scope: 'admin', permission: { permission_scopes: ['user:update'], words: [], menus: [{ menu_key: 'admin:menu:system:user', menu_path: '/system/user', btns: ['admin:btn:system:user:edit'] }] } };
    const permission = usePermissions();
    expect(permission.canAssignPermissions.value).toBe(true);
    expect(permission.hasAllPermissions.value).toBe(false);
    expect(permission.hasButton('admin:btn:system:role:edit')).toBe(false);
    expect(permission.canManagePermission('user', 'update')).toBe(true);
    expect(permission.canManagePermission('role', 'update')).toBe(false);
  });
  it('fails closed for absent permissions', () => {
    state.userInfo = null;
    expect(usePermissions().canAssignPermissions.value).toBe(false);
  });
});

it('keeps developer publication tied to its configured page and button', () => {
  const user = reactive({ scope: 'admin', permission: { words: [], menus: [{ menu_key: 'admin:menu:system:developer', menu_path: '/system/developer', btns: ['admin:btn:system:developer:publish'] }] } });
  state.userInfo = user;
  const permission = usePermissions();
  expect(permission.canManageDeveloper.value).toBe(true);
  user.permission.menus[0]!.btns = [];
  expect(permission.canManageDeveloper.value).toBe(false);
});
