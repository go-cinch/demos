import type { AppRouteRecord } from '@/types/router'

export const profileRoutes: AppRouteRecord = {
  path: '/profile',
  name: 'Profile',
  component: '/system/user-center',
  meta: {
    title: 'menus.system.userCenter',
    icon: 'ri:user-line',
    isHide: true,
    keepAlive: true,
    isHideTab: true
  }
}
