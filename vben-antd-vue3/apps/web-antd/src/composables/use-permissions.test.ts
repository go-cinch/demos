import { reactive } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import { usePermissions } from './use-permissions';

const state = vi.hoisted(() => ({
  userInfo: null as null | Record<string, unknown>,
}));
vi.mock('@vben/stores', () => ({ useUserStore: () => state }));
vi.mock('#/api/core/user', () => ({ AUTH_SCOPE: 'admin' }));

describe('configured permissions', () => {
  it('does not infer authority from action words or role labels', () => {
    state.userInfo = {
      scope: 'admin',
      roles: ['admin'],
      permission: {
        words: ['admin:all:system:all', 'admin:grant:system:permission-admin'],
        menus: [],
      },
    };
    expect(usePermissions().hasAllPermissions.value).toBe(false);
    expect(usePermissions().hasButton('admin:btn:system:user:edit')).toBe(
      false,
    );
  });
  it('uses the wildcard permission scope and reacts to its removal', () => {
    const user = reactive({
      scope: 'admin',
      permission: {
        permission_scope: '*' as string | undefined,
        words: ['admin:read:renamed:anything'],
        menus: [],
      },
    });
    state.userInfo = user;
    const permission = usePermissions();
    expect(permission.hasAllPermissions.value).toBe(true);
    user.permission.permission_scope = undefined;
    expect(permission.hasAllPermissions.value).toBe(false);
    user.permission.permission_scope = '*';
    user.scope = 'mini';
    expect(permission.hasAllPermissions.value).toBe(false);
  });
  it('derives operation controls from explicit module button grants', () => {
    state.userInfo = {
      scope: 'admin',
      permission: {
        permission_scopes: ['role:update'],
        words: [],
        menus: [
          {
            menu_key: 'admin:menu:system:user',
            menu_path: '/system/user',
            btns: ['admin:btn:system:user:edit'],
          },
        ],
      },
    };
    const permission = usePermissions();
    expect(permission.hasAllPermissions.value).toBe(false);
    expect(
      permission.hasButton('admin:btn:system:user:edit', '/system/user'),
    ).toBe(true);
    expect(
      permission.hasButton('admin:btn:system:user:edit', '/system/role'),
    ).toBe(false);
    expect(permission.hasButton('admin:btn:system:role:edit')).toBe(false);
  });
  it('requires a scoped self-service grant independently of the profile menu', () => {
    const user = reactive({
      scope: 'admin',
      permission: { menus: [], profile_actions: ['test_totp'] },
    });
    state.userInfo = user;
    const grants = usePermissions();
    expect(grants.hasProfileAction('test_totp')).toBe(true);
    expect(grants.hasProfileAction('enroll_totp')).toBe(false);
    expect(grants.hasPage('/profile')).toBe(false);
    user.scope = 'mini';
    expect(grants.hasProfileAction('test_totp')).toBe(false);
  });

  it('fails closed for absent permissions', () => {
    state.userInfo = null;
    expect(usePermissions().hasButton('admin:btn:system:user:edit')).toBe(
      false,
    );
  });
});

it('keeps developer publication tied to its configured page and button', () => {
  const user = reactive({
    scope: 'admin',
    permission: {
      words: [],
      menus: [
        {
          menu_key: 'admin:menu:system:developer',
          menu_path: '/system/developer',
          btns: ['admin:btn:system:developer:publish'],
        },
      ],
    },
  });
  state.userInfo = user;
  const permission = usePermissions();
  expect(permission.canManageDeveloper.value).toBe(true);
  required(user.permission.menus[0]).btns = [];
  expect(permission.canManageDeveloper.value).toBe(false);
});
