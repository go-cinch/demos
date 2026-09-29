import { canMenu } from './api';
import { t } from '../locales';
export const modules = {
  get value() {
    return [
      { resource: 'user', label: t('system.menu.users'), icon: 'usergroup', path: '/system/user' },
      { resource: 'role', label: t('system.menu.roles'), icon: 'secured', path: '/system/role' },
      {
        resource: 'user-group',
        label: t('system.menu.groups'),
        icon: 'app',
        path: '/system/user-group',
      },
      { resource: 'action', label: t('system.menu.actions'), icon: 'key', path: '/system/action' },
      {
        resource: 'dictionary',
        label: t('system.menu.dictionary'),
        icon: 'book',
        path: '/system/dictionary',
      },
      {
        resource: 'whitelist',
        label: t('system.menu.whitelist'),
        icon: 'check-rectangle',
        path: '/system/whitelist',
      },
    ].filter((item) => canMenu(item.path));
  },
};
