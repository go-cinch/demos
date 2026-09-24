import type { UserInfo } from '@vben/types';

import { authRequestClient } from '#/api/request';

interface AuthPermission {
  btns: string[];
  menus: string[];
}

interface AuthRole {
  id: number;
  name: string;
  word: string;
}

interface AuthUserInfo {
  code: string;
  id: number;
  permission: AuthPermission;
  role?: AuthRole;
  username: string;
}

export interface UserInfoWithPermissions extends UserInfo {
  permission: AuthPermission;
  role?: AuthRole;
  roleName: string;
}

const menuHomePaths: [menu: string, path: string][] = [
  ['/dashboard/overview', '/dashboard/overview'],
  ['/system/user', '/system/user'],
  ['/system/group', '/system/user-group'],
  ['/system/role', '/system/role'],
  ['/system/action', '/system/action'],
  ['/system/whitelist', '/system/whitelist'],
  ['/system/dictionary', '/system/dictionary'],
];

function normalizePermissions(values?: string[]) {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

function resolveHomePath(menus: string[]) {
  if (menus.includes('*')) return '/dashboard/overview';
  return (
    menuHomePaths.find(([menu]) => menus.includes(menu))?.[1] ?? '/profile'
  );
}

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  const user = await authRequestClient.get<AuthUserInfo>('/auth/info');
  const permission: AuthPermission = {
    btns: normalizePermissions(user.permission?.btns),
    menus: normalizePermissions(user.permission?.menus),
  };
  return {
    avatar: '',
    code: user.code,
    desc: '',
    homePath: resolveHomePath(permission.menus),
    permission,
    realName: user.username,
    role: user.role,
    roleName: user.role?.name ?? '',
    roles: permission.menus,
    token: '',
    userId: String(user.id),
    username: user.username,
  } satisfies UserInfoWithPermissions;
}
