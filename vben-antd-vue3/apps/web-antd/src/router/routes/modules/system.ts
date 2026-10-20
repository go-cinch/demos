import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      authority: [
        '/system/user',
        '/system/user-group',
        '/system/role',
        '/system/action',

        '/system/dictionary',
        '/system/developer',
        '/system/msg',
      ],
      icon: 'lucide:settings',
      order: 100,
      title: 'menus.admin:menu:system',
    },
    name: 'SystemManagement',
    path: '/system',
    children: [


      {
        component: () => import('#/views/system/user/index.vue'),
        meta: {
          authority: ['/system/user'],
          fullPathKey: false,
          icon: 'lucide:users',
          title: 'menus.admin:menu:system:user',
        },
        name: 'SystemUser',
        path: 'user',
      },
      {
        component: () => import('#/views/system/role/index.vue'),
        meta: {
          authority: ['/system/role'],
          fullPathKey: false,
          icon: 'lucide:shield-check',
          title: 'menus.admin:menu:system:role',
        },
        name: 'SystemRole',
        path: 'role',
      },
      {
        component: () => import('#/views/system/user-group/index.vue'),
        meta: {
          authority: ['/system/user-group'],
          icon: 'lucide:users-round',
          title: 'menus.admin:menu:system:user-group',
        },
        name: 'SystemUserGroup',
        path: 'user-group',
      },
      {
        component: () => import('#/views/system/action/index.vue'),
        meta: {
          authority: ['/system/action'],
          fullPathKey: false,
          icon: 'lucide:key-round',
          title: 'menus.admin:menu:system:action',
        },
        name: 'SystemAction',
        path: 'action',
      },
      {
        component: () => import('#/views/system/dictionary/index.vue'),
        meta: {
          authority: ['/system/dictionary'],
          icon: 'lucide:book-key',
          title: 'menus.admin:menu:system:dictionary',
        },
        name: 'SystemDictionary',
        path: 'dictionary',
      },

      {
        path: 'msg',
        name: 'SystemMsg',
        component: () => import('#/views/msg/index.vue'),
        meta: { authority: ['/system/msg'], icon: 'lucide:mail', title: 'menus.admin:menu:system:msg' },
      },
      {
        component: () => import('#/views/system/developer/index.vue'),
        meta: { authority: ['/system/developer'], icon: 'lucide:code-xml', title: 'developer.title' },
        name: 'SystemDeveloper',
        path: 'developer',
      },
    ],
  },
];

export default routes;
