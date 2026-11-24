import { reactive } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { totpEnabled } from '#/store/system-properties';

import { useManagementPermissions } from './use-management-permissions';

const { store } = vi.hoisted(() => ({
  store: { userInfo: {} as Record<string, unknown> },
}));
vi.mock('@vben/stores', () => ({ useUserStore: () => store }));
vi.mock('#/api/core/user', () => ({ AUTH_SCOPE: 'admin' }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store/system-properties', async () => {
  const vue = await import('vue');
  return {
    totpEnabled: vue.ref(false),
  };
});

function grantButtons(resource: string, ...controls: string[]) {
  const menu = reactive({
    menu_key: `admin:menu:system:${resource}`,
    menu_path: `/system/${resource}`,
    btns: controls.map((control) => `admin:btn:system:${resource}:${control}`),
  });
  store.userInfo = { scope: 'admin', permission: { menus: [menu], words: [] } };
  return menu;
}

describe.each(['role', 'user', 'user-group'] as const)(
  '%s resource permissions',
  (resource) => {
    it('uses the corresponding create or edit button for assignment without legacy scopes', () => {
      const menu = grantButtons(resource, 'create');
      const permissions = useManagementPermissions(() => resource);

      expect(permissions.canAssignPermissions.value).toBe(true);
      permissions.editorOperation.value = 'update';
      expect(permissions.canAssignPermissions.value).toBe(false);

      menu.btns = [`admin:btn:system:${resource}:edit`];
      expect(permissions.canAssignPermissions.value).toBe(true);
      permissions.editorOperation.value = 'create';
      expect(permissions.canAssignPermissions.value).toBe(false);
    });

    it('uses the matching delete control for associated records and sparse rows', () => {
      const menu = grantButtons(resource, 'delete');
      const permissions = useManagementPermissions(() => resource);
      const assigned = {
        word: 'super',
        action_codes: ['ALL'],
        member_count: 1,
      };

      expect(permissions.canRemoveRecord(assigned)).toBe(true);
      expect(permissions.canRemoveRecord({ id: 2 })).toBe(true);
      expect(permissions.canSelectRecord(assigned)).toBe(false);

      menu.btns = [`admin:btn:system:${resource}:delete-selected`];
      expect(permissions.canRemoveRecord(assigned)).toBe(false);
      expect(permissions.canSelectRecord(assigned)).toBe(true);
    });
  },
);

it('requires the reset button and an enabled authenticator on the user page', () => {
  const menu = grantButtons('user', 'view-detail', 'edit');
  const permissions = useManagementPermissions(() => 'user');
  const enabled = vi.mocked(totpEnabled) as import('vue').Ref<boolean>;
  enabled.value = true;
  expect(permissions.canResetTOTP.value).toBe(false);
  menu.btns = ['admin:btn:system:user:reset-totp'];
  expect(permissions.canResetTOTP.value).toBe(true);
  enabled.value = false;
  expect(permissions.canResetTOTP.value).toBe(false);
});
