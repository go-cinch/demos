import { router } from '@/router'
import { refreshAuthorizationRoutes } from '@/router/guards/beforeEach'
import { useUserStore as useArtUserStore } from '@/store/modules/user'
import { fetchGetUserInfo } from '@/api/auth'
import { useAdminTimezone } from '@/utils/admin/preferences'
import { adminDate } from '@/utils/admin/model'
import i18n from '@/locales'
export const preferences = {
  app: {
    get locale() {
      return String((i18n.global.locale as any).value ?? i18n.global.locale).startsWith('zh')
        ? 'zh-CN'
        : 'en-US'
    }
  }
}
export function formatDateTime(value: unknown) {
  return adminDate(value, useAdminTimezone().value)
}
export function useUserStore() {
  const user = useArtUserStore()
  return {
    get userInfo() {
      return user.info
    }
  }
}
export function useAuthStore() {
  return {
    async fetchUserInfo(options?: unknown) {
      void options
      const info = await fetchGetUserInfo()
      useArtUserStore().setUserInfo(info)
      await refreshAuthorizationRoutes(router)
      return info
    }
  }
}
const closeGuards = new Map<string, () => Promise<boolean> | boolean>()
export function registerTabCloseGuard(path: string, guard: () => Promise<boolean> | boolean) {
  closeGuards.set(path, guard)
  return () => {
    closeGuards.delete(path)
  }
}
export async function canCloseCatalogTab(path: string) {
  return (await closeGuards.get(path)?.()) !== false
}
