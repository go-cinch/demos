import type { AppRouteRecord } from '@/types/router'

export const systemRoutes: AppRouteRecord = {
  path: '/system',
  name: 'System',
  component: '/index/index',
  meta: {
    title: 'menus.system.title',
    icon: 'ri:settings-3-line',
    roles: [
      '*',
      '/system/user',
      '/system/group',
      '/system/role',
      '/system/action',
      '/system/whitelist',
      '/system/dictionary'
    ]
  },
  children: [
    {
      path: 'user',
      name: 'SystemUser',
      component: '/system/user',
      meta: {
        title: 'menus.system.user',
        icon: 'ri:user-line',
        roles: ['*', '/system/user'],
        keepAlive: true
      }
    },
    {
      path: 'role',
      name: 'SystemRole',
      component: '/system/role',
      meta: {
        title: 'menus.system.role',
        icon: 'ri:shield-user-line',
        roles: ['*', '/system/role'],
        keepAlive: true
      }
    },
    {
      path: 'user-group',
      name: 'SystemUserGroup',
      component: '/system/user-group',
      meta: {
        title: 'menus.system.userGroup',
        icon: 'ri:group-line',
        roles: ['*', '/system/group'],
        keepAlive: true
      }
    },
    {
      path: 'action',
      name: 'SystemAction',
      component: '/system/action',
      meta: {
        title: 'menus.system.action',
        icon: 'ri:key-2-line',
        roles: ['*', '/system/action'],
        keepAlive: true
      }
    },
    {
      path: 'dictionary',
      name: 'SystemDictionary',
      component: '/system/dictionary',
      meta: {
        title: 'menus.system.dictionary',
        icon: 'ri:book-2-line',
        roles: ['*', '/system/dictionary'],
        keepAlive: true
      }
    },
    {
      path: 'whitelist',
      name: 'SystemWhitelist',
      component: '/system/whitelist',
      meta: {
        title: 'menus.system.whitelist',
        icon: 'ri:list-check-3',
        roles: ['*', '/system/whitelist'],
        keepAlive: true
      }
    }
  ]
}
