import type { UserInfo } from '../auth/api';

/** Export is a page-bound control; neither scope-all nor legacy aliases replace it. */
export function hasAuditExport(user: UserInfo | null | undefined, kind: 'login' | 'operation') {
  if (!user || user.scope !== 'admin') return false;
  const path = `/audit/${kind}`;
  return user.permission.menus.includes(path) && user.permission.entries.some((entry) =>
    entry.menu_path === path && entry.btns.includes(`admin:btn:audit:${kind}:export-report`));
}
