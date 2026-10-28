import { computed } from 'vue'
import { useUserStore } from '@/store/modules/user'

const AUTH_SCOPE = 'admin'

export function usePermissions() {
  const user = useUserStore()
  const permission = () => (user.info.scope === AUTH_SCOPE ? user.info.permission : undefined)
  const hasWord = (word: string) =>
    Array.isArray(permission()?.words) && permission()!.words.includes(word)
  const hasPage = (path: string) =>
    Array.isArray(permission()?.menus) &&
    permission()!.menus.some((menu) => menu.menu_path === path)
  const hasButton = (key: string, path?: string) =>
    Array.isArray(permission()?.menus) &&
    permission()!.menus.some(
      (menu) =>
        (!path || menu.menu_path === path) && Array.isArray(menu.btns) && menu.btns.includes(key)
    )
  const hasAllPermissions = computed(() => permission()?.permission_scope === '*')
  const canManagePermission = (resource: string, operation: string) =>
    hasAllPermissions.value ||
    (Array.isArray(permission()?.permission_scopes) &&
      permission()!.permission_scopes!.includes(`${resource}:${operation}`))
  const canAssignPermissions = computed(
    () =>
      hasAllPermissions.value ||
      (Array.isArray(permission()?.permission_scopes) &&
        permission()!.permission_scopes!.length > 0)
  )
  const canReadDeveloper = computed(() => hasAllPermissions.value || hasPage('/system/developer'))
  const canManageDeveloper = computed(
    () =>
      hasAllPermissions.value ||
      hasButton(`${AUTH_SCOPE}:btn:system:developer:publish`, '/system/developer')
  )
  return {
    hasAllPermissions,
    hasPage,
    hasButton,
    hasWord,
    canManagePermission,
    canAssignPermissions,
    canReadDeveloper,
    canManageDeveloper
  }
}
