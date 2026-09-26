import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      authority: ['*', '/dashboard/overview'],
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: 'page.dashboard.title',
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
          authority: ['*', '/dashboard/overview'],
          icon: 'lucide:area-chart',
          title: 'page.dashboard.overview',
        },
      },
      {
        name: 'Workspace',
        path: 'workspace',
        component: () => import('#/views/dashboard/workspace/index.vue'),
        meta: {
          authority: ['*'],
          icon: 'carbon:workspace',
          title: 'page.dashboard.workspace',
        },
      },
    ],
  },
];

export default routes;
