import { AppRouteRecord } from '@/types/router'
import { dashboardRoutes } from './dashboard'
import { systemRoutes } from './system'
import { profileRoutes } from './profile'

/**
 * 导出所有模块化路由
 */
export const routeModules: AppRouteRecord[] = [
  dashboardRoutes,
  systemRoutes,
  profileRoutes,
  {
    path: '/msg',
    name: 'Msg',
    component: '/index/index',
    meta: { title: 'menus.inbox', isHide: true },
    children: [
      {
        path: 'inbox',
        name: 'Inbox',
        component: '/msg',
        meta: { title: 'menus.inbox', isHide: true, isHideTab: true }
      }
    ]
  }
]
