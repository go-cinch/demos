import type { RouteRecordRaw } from 'vue-router';
const routes: RouteRecordRaw[] = [
  {
    path: '/msg/inbox',
    name: 'MsgInbox',
    component: () => import('#/views/msg/inbox.vue'),
    meta: {
      hideInMenu: true,
      hideInTab: true,
      authority: ['*', '/msg/inbox'],
      icon: 'lucide:inbox',
      order: 90,
      title: 'msg.inbox',
    },
  },
];
export default routes;
