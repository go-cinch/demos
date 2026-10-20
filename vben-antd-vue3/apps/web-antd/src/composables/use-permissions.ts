import { computed } from 'vue';
import { useUserStore } from '@vben/stores';
import { AUTH_SCOPE, type UserInfoWithPermissions } from '#/api/core/user';

export function usePermissions() {
  const userStore = useUserStore();
  const permission = () => {
    const user = userStore.userInfo as UserInfoWithPermissions | null;
    return user?.scope === AUTH_SCOPE ? user.permission : undefined;
  };
  const hasWord = (word: string) => Array.isArray(permission()?.words) && permission()!.words.includes(word);
  const hasPage = (path: string) => Array.isArray(permission()?.menus) && permission()!.menus.some((menu) => menu.menu_path === path);
  const hasButton = (key: string, path?: string) => Array.isArray(permission()?.menus) && permission()!.menus.some((menu) => (!path || menu.menu_path === path) && Array.isArray(menu.btns) && menu.btns.includes(key));
  const hasAllPermissions = computed(() => permission()?.permission_scope === '*');
  const canManagePermission = (resource: string, operation: string) => hasAllPermissions.value || (permission()?.permission_scopes ?? []).includes(`${resource}:${operation}`);
  const canAssignPermissions = computed(() => hasAllPermissions.value || (permission()?.permission_scopes ?? []).length > 0);
  const canReadDeveloper = computed(() => hasAllPermissions.value || hasPage('/system/developer'));
  const canManageDeveloper = computed(() => hasAllPermissions.value || hasButton(`${AUTH_SCOPE}:btn:system:developer:publish`, '/system/developer'));
  return { canManagePermission, hasButton, hasPage, hasWord, hasAllPermissions, canAssignPermissions, canReadDeveloper, canManageDeveloper };
}
