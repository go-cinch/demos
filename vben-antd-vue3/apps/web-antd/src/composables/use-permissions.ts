import type { ProfileAction, UserInfoWithPermissions } from '#/api/core/user';

import { computed } from 'vue';

import { useUserStore } from '@vben/stores';

import { AUTH_SCOPE } from '#/api/core/user';

export function usePermissions() {
  const userStore = useUserStore();
  const permission = () => {
    const user = userStore.userInfo as null | UserInfoWithPermissions;
    return user?.scope === AUTH_SCOPE ? user.permission : undefined;
  };
  const hasProfileAction = (action: ProfileAction) =>
    permission()?.profile_actions?.includes(action) === true;
  const hasWord = (word: string) => {
    const words = permission()?.words;
    return Array.isArray(words) && words.includes(word);
  };
  const hasPage = (path: string) => {
    const menus = permission()?.menus;
    return (
      Array.isArray(menus) && menus.some((menu) => menu.menu_path === path)
    );
  };
  const hasButton = (key: string, path?: string) => {
    const menus = permission()?.menus;
    return (
      Array.isArray(menus) &&
      menus.some(
        (menu) =>
          (!path || menu.menu_path === path) &&
          Array.isArray(menu.btns) &&
          menu.btns.includes(key),
      )
    );
  };
  const hasAllPermissions = computed(
    () => permission()?.permission_scope === '*',
  );
  const canReadDeveloper = computed(
    () => hasAllPermissions.value || hasPage('/system/developer'),
  );
  const canManageDeveloper = computed(
    () =>
      hasAllPermissions.value ||
      hasButton(
        `${AUTH_SCOPE}:btn:system:developer:publish`,
        '/system/developer',
      ),
  );
  return {
    hasButton,
    hasPage,
    hasProfileAction,
    hasWord,
    hasAllPermissions,
    canReadDeveloper,
    canManageDeveloper,
  };
}
