import type { RouteRecordRaw } from 'vue-router';
const routes: RouteRecordRaw[] = [
  {
    name: 'Audit',
    path: '/audit',
    meta: {
      title: 'menus.admin:menu:audit',
      icon: 'lucide:scan-search',
      order: 110,
      authority: ['/audit/login', '/audit/operation'],
    },
    children: [
      {
        name: 'AuditLogin',
        path: 'login',
        component: () => import('#/views/audit/login.vue'),
        meta: {
          title: 'menus.admin:menu:audit:login',
          icon: 'lucide:log-in',
          authority: ['/audit/login'],
        },
      },
      {
        name: 'AuditOperation',
        path: 'operation',
        component: () => import('#/views/audit/operation.vue'),
        meta: {
          title: 'menus.admin:menu:audit:operation',
          icon: 'lucide:activity',
          authority: ['/audit/operation'],
        },
      },
    ],
  },
];
export default routes;
