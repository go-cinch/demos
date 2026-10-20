import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Profile',
    path: '/profile',
    component: () => import('#/views/_core/profile/index.vue'),
    meta: {
      authority: ['/profile'],
      icon: 'lucide:user',
      hideInMenu: true,
      title: 'menus.admin:menu:account:profile',
    },
  },
];

export default routes;
