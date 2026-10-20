import type { UserInfo } from '@vben/types';

import { authRequestClient } from '#/api/request';

export const AUTH_SCOPE = 'admin';
export interface PermissionMenu {
  menu_key: string;
  parent_menu_key?: string;
  menu_path: string;
  btns: string[];
}
export interface PermissionNavigation {
  resource_key: string;
  menu_key?: string;
  menu_path?: string;
  children?: PermissionNavigation[];
}
export interface AuthPermission { permission_scopes?: string[]; permission_scope?: '*'; words: string[]; menus: PermissionMenu[]; navigation?: PermissionNavigation[] }
interface AuthRole { id: number; name: string; word: string }
interface AuthUserInfo {
  code: string; id: number; permission: AuthPermission; role?: AuthRole | null;
  scope: string; username: string;
}
export interface UserInfoWithPermissions extends UserInfo {
  permission: AuthPermission; role?: AuthRole; roleName: string; scope: string;
}
const distinct = (values: unknown): string[] => Array.isArray(values)
  ? [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))] : [];

/** Fail closed: words, menu identifiers and control identifiers have separate meanings. */
export async function getUserInfoApi(): Promise<UserInfoWithPermissions> {
  const user = await authRequestClient.get<AuthUserInfo>('/info', {
    params: { f: 'id,username,code,role,scope,permission' },
  });
  if (user.scope !== AUTH_SCOPE) throw new Error('Invalid permission scope');
  const menus = new Map<string, PermissionMenu>();
  for (const menu of user.permission?.menus ?? []) {
    if (!menu.menu_key?.startsWith(`${AUTH_SCOPE}:menu:`) || !menu.menu_path?.startsWith('/') || menu.menu_path.startsWith('//')) continue;
    const current = menus.get(menu.menu_key);
    if (current && current.menu_path !== menu.menu_path) continue;
    menus.set(menu.menu_key, {
      menu_key: menu.menu_key,
      menu_path: menu.menu_path,
      parent_menu_key: menu.parent_menu_key,
      btns: distinct([...(current?.btns ?? []), ...distinct(menu.btns)]).filter((key) => key.startsWith(`${menu.menu_key.replace(':menu:', ':btn:')}:`)),
    });
  }
  const permissionScopes = distinct(user.permission?.permission_scopes).filter((scope) => /^[a-z][a-z0-9_-]*:(read|create|update|delete)$/.test(scope));
  const permission: AuthPermission = {
    ...(permissionScopes.length ? { permission_scopes: permissionScopes } : {}),
    ...(user.permission?.permission_scope === '*' ? { permission_scope: '*' as const } : {}),
    words: distinct(user.permission?.words).filter((key) => key.startsWith(`${AUTH_SCOPE}:`)),
    menus: [...menus.values()],
  };
  const paths = permission.menus.map((menu) => menu.menu_path);
  if (Array.isArray(user.permission?.navigation)) {
    const allowed = new Map(permission.menus.map((menu) => [menu.menu_key, menu.menu_path]));
    const sanitize = (nodes: PermissionNavigation[]): PermissionNavigation[] => nodes.flatMap<PermissionNavigation>((node) => {
      if (!node?.resource_key?.startsWith(`${AUTH_SCOPE}:`)) return [];
      if (node.menu_key || node.menu_path) return node.menu_key && allowed.get(node.menu_key) === node.menu_path ? [{ resource_key: node.resource_key, menu_key: node.menu_key, menu_path: node.menu_path }] : [];
      const children = sanitize(Array.isArray(node.children) ? node.children : []);
      return children.length ? [{ resource_key: node.resource_key, children }] : [];
    });
    permission.navigation = sanitize(user.permission.navigation);
  }
  const homePath = paths.includes('/dashboard/overview') ? '/dashboard/overview' : paths[0] ?? '/forbidden';
  return {
    avatar: '', code: user.code, desc: '', homePath, permission,
    realName: user.username, role: user.role ?? undefined, roleName: user.role?.name ?? '',
    roles: paths, scope: user.scope, token: '', userId: String(user.id), username: user.username,
  };
}
