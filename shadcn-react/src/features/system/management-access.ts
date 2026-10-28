import type { UserInfo } from '../auth/api';
import type { ResourceKind } from './types';

export function hasManagementPage(user: UserInfo | null | undefined, resource: ResourceKind) {
  return !!user && user.scope === 'admin' && user.permission.menus.includes(`/system/${resource}`);
}

/** A page entry grants the initial read, never every control on that page. */
export function hasManagementControl(user: UserInfo | null | undefined, resource: ResourceKind, control: string) {
  if (!hasManagementPage(user, resource) || !user) return false;
  const operation = ({ create: 'create', edit: 'update', delete: 'delete', 'delete-selected': 'delete' } as Record<string, string>)[control];
  if (resource === 'action' && operation && user.permission.permission_scope !== '*' &&
    !user.permission.permission_scopes?.includes(`action:${operation}`)) return false;
  return user.permission.entries.some((entry) => entry.menu_path === `/system/${resource}` &&
    entry.btns.includes(`admin:btn:system:${resource}:${control}`));
}

/** Existing member deltas retain the editor's assignment requirement and independent controls. */
export function groupMemberAccess(user: UserInfo | null | undefined) {
  const canAssign = user?.permission.permission_scope === '*' ||
    user?.permission.permission_scopes?.includes('user-group:update') === true;
  return {
    view: hasManagementControl(user, 'user-group', 'view-members'),
    add: canAssign && hasManagementControl(user, 'user-group', 'add-members'),
    remove: canAssign && hasManagementControl(user, 'user-group', 'remove-members')
  };
}

export function authorizedGroupMemberDelta(user: UserInfo | null | undefined, added: number[], removed: number[]) {
  const access = groupMemberAccess(user);
  return {
    ...(access.add && added.length ? { add_user_ids: [...added] } : {}),
    ...(access.remove && removed.length ? { remove_user_ids: [...removed] } : {})
  };
}
