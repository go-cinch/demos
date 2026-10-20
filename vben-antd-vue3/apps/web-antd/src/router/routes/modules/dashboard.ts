import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      authority: ['/dashboard/overview', '/dashboard/workspace'],
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: 'menus.admin:menu:dashboard',
    },
    name: 'Dashboard',
    path: '/dashboard',
    children: [
      {
        name: 'Overview',
        path: 'overview',
        component: () => import('#/views/dashboard/analytics/index.vue'),
        meta: {
          affixTab: true,
          authority: ['/dashboard/overview'],
          icon: 'lucide:area-chart',
          title: 'menus.admin:menu:dashboard:overview',
        },
      },
      {
        name: 'Workspace',
        path: 'workspace',
        component: () => import('#/views/dashboard/workspace/index.vue'),
        meta: {
          authority: ['/dashboard/workspace'],
          icon: 'carbon:workspace',
          title: 'menus.admin:menu:dashboard:workspace',
        },
      },
    ],
  },
];

export default routes;
