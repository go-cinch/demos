import type { AppRouteRecord } from '@/types/router'

export const dashboardRoutes: AppRouteRecord = {
  name: 'Dashboard',
  path: '/dashboard',
  component: '/index/index',
  meta: {
    title: 'menus.dashboard.title',
    icon: 'ri:dashboard-line',
    roles: ['*', '/dashboard/overview']
  },
  children: [
    {
      path: 'overview',
      name: 'Overview',
      component: '/dashboard/analysis',
      meta: {
        title: 'menus.dashboard.overview',
        icon: 'ri:line-chart-line',
        roles: ['*', '/dashboard/overview'],
        fixedTab: true
      }
    },
    {
      path: 'workspace',
      name: 'Workspace',
      component: '/dashboard/console',
      meta: {
        title: 'menus.dashboard.workspace',
        icon: 'ri:home-office-line',
        roles: ['*']
      }
    }
  ]
}
