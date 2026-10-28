import type { UserInfo } from '../auth/api';

/** Page entry, sent-message controls and personal-message controls are independent. */
export function messagePermissions(user: UserInfo | null | undefined) {
  const authenticated = !!user?.id && user.scope === 'admin';
  const all = authenticated && user.permission.permission_scope === '*';
  const control = (sent: boolean, key: string) => authenticated && (all || user.permission.entries.some(
    (entry) => entry.menu_path === (sent ? '/system/msg' : '/msg/inbox') &&
      entry.btns.includes(`admin:btn:${sent ? 'system:msg' : 'msg:inbox'}:${key}`)
  ));
  return {
    inbox: authenticated && (all || user.permission.menus.includes('/msg/inbox')),
    read: authenticated && (all || user.permission.menus.includes('/system/msg')),
    send: control(true, 'send'),
    delete: control(true, 'delete'),
    control
  };
}
