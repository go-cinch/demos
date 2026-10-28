import type { AppRouteRecord } from '@/types/router'
export const auditRoutes: AppRouteRecord = {
  path: '/audit',
  name: 'Audit',
  component: '/index/index',
  meta: {
    title: 'menus.audit.title',
    icon: 'ri:shield-check-line',
    roles: ['*', '/audit/login', '/audit/operation']
  },
  children: [
    {
      path: 'login',
      name: 'AuditLogin',
      component: '/audit/login',
      meta: {
        title: 'menus.audit.login',
        icon: 'ri:login-box-line',
        roles: ['*', '/audit/login'],
        keepAlive: true
      }
    },
    {
      path: 'operation',
      name: 'AuditOperation',
      component: '/audit/operation',
      meta: {
        title: 'menus.audit.operation',
        icon: 'ri:history-line',
        roles: ['*', '/audit/operation'],
        keepAlive: true
      }
    }
  ]
}
