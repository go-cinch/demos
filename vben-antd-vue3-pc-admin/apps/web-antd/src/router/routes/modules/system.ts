import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      authority: [
        '*',
        '/system/user',
        '/system/group',
        '/system/role',
        '/system/action',
        '/system/whitelist',
        '/system/dictionary',
      ],
      icon: 'lucide:settings',
      order: 100,
      title: 'system.menu.system',
    },
    name: 'SystemManagement',
    path: '/system',
    children: [
      {
        component: () => import('#/views/system/user/index.vue'),
        meta: {
          authority: ['*', '/system/user'],
          fullPathKey: false,
          icon: 'lucide:users',
          title: 'system.menu.users',
        },
        name: 'SystemUser',
        path: 'user',
      },
      {
        component: () => import('#/views/system/role/index.vue'),
        meta: {
          authority: ['*', '/system/role'],
          fullPathKey: false,
          icon: 'lucide:shield-check',
          title: 'system.menu.roles',
        },
        name: 'SystemRole',
        path: 'role',
      },
      {
        component: () => import('#/views/system/user-group/index.vue'),
        meta: {
          authority: ['*', '/system/group'],
          icon: 'lucide:users-round',
          title: 'system.menu.groups',
        },
        name: 'SystemUserGroup',
        path: 'user-group',
      },
      {
        component: () => import('#/views/system/action/index.vue'),
        meta: {
          authority: ['*', '/system/action'],
          fullPathKey: false,
          icon: 'lucide:key-round',
          title: 'system.menu.actions',
        },
        name: 'SystemAction',
        path: 'action',
      },
      {
        component: () => import('#/views/system/dictionary/index.vue'),
        meta: {
          authority: ['*', '/system/dictionary'],
          icon: 'lucide:book-key',
          title: 'system.menu.dictionary',
        },
        name: 'SystemDictionary',
        path: 'dictionary',
      },
      {
        component: () => import('#/views/system/whitelist/index.vue'),
        meta: {
          authority: ['*', '/system/whitelist'],
          icon: 'lucide:list-checks',
          title: 'system.menu.whitelist',
        },
        name: 'SystemWhitelist',
        path: 'whitelist',
      },
    ],
  },
];

export default routes;
