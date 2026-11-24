import type { UserInfo } from '@vben/types';

import type {
  RequestErrorFeedback,
  ServiceRequestConfig,
} from '#/api/request-types';
import type {
  UIPreferencePatch,
  UIPreferences,
} from '#/store/ui-preferences-contract';

import { authRequestClient } from '#/api/request';
import { firstAuthorizedMenu } from '#/store/login-destination';
import { loadSystemProperties } from '#/store/system-properties';

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
export type ProfileAction =
  | 'bind_email'
  | 'change_password'
  | 'enroll_totp'
  | 'recover_totp'
  | 'recover_totp_by_email'
  | 'test_totp'
  | 'unlink_by_email'
  | 'unlink_by_factor'
  | 'unlink_by_password';
export interface AuthPermission {
  profile_actions?: ProfileAction[];
  permission_scopes?: string[];
  permission_scope?: '*';
  words: string[];
  menus: PermissionMenu[];
  navigation?: PermissionNavigation[];
}
interface AuthRole {
  id: number;
  name: string;
  word: string;
}
interface AuthUserInfo {
  ui_preferences?: { vben_pc: UIPreferences };
  code: string;
  id: number;
  permission: AuthPermission;
  role?: AuthRole | null;
  scope: string;
  username: string;
  email?: string;
  email_verified_at?: null | number;
  email_binding_required?: boolean;
  metadata?: {
    timezone?: string;
    language?: string;
    email_binding_skipped?: boolean;
    totp_enrollment_skipped?: boolean;
    password_reset_skipped?: boolean;
  };
}
export interface UserInfoWithPermissions extends UserInfo {
  language?: string;
  timezone?: string;
  uiPreferences?: UIPreferences;
  permission: AuthPermission;
  role?: AuthRole;
  roleName: string;
  scope: string;
  email: string;
  emailVerifiedAt?: number;
  emailBindingRequired: boolean;
  emailBindingSkipped: boolean;
  totpEnrollmentSkipped: boolean;
  passwordResetSkipped: boolean;
}
const distinct = (values: unknown): string[] =>
  Array.isArray(values)
    ? [
        ...new Set(
          values
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ]
    : [];

/** Fail closed: words, menu identifiers and control identifiers have separate meanings. */
export async function getUserInfoApi(
  feedback?: RequestErrorFeedback,
): Promise<UserInfoWithPermissions> {
  const properties = await loadSystemProperties();
  const emailEnabled = properties?.email_enabled === true;
  const fields = 'id,username,code,role,scope,permission';
  const config: ServiceRequestConfig = {
    params: {
      ui: 'vben_pc',
      f: emailEnabled
        ? `${fields},email,email_verified_at,email_binding_required,metadata,ui_preferences`
        : `${fields},metadata,ui_preferences`,
    },
    ...feedback,
  };
  const user = await authRequestClient.get<AuthUserInfo>('/info', config);
  if (user.scope !== AUTH_SCOPE) throw new Error('Invalid permission scope');
  const menus = new Map<string, PermissionMenu>();
  for (const menu of user.permission?.menus ?? []) {
    if (
      !menu.menu_key?.startsWith(`${AUTH_SCOPE}:menu:`) ||
      !menu.menu_path?.startsWith('/') ||
      menu.menu_path.startsWith('//')
    )
      continue;
    const current = menus.get(menu.menu_key);
    if (current && current.menu_path !== menu.menu_path) continue;
    menus.set(menu.menu_key, {
      menu_key: menu.menu_key,
      menu_path: menu.menu_path,
      parent_menu_key: menu.parent_menu_key,
      btns: distinct([...(current?.btns ?? []), ...distinct(menu.btns)]).filter(
        (key) => key.startsWith(`${menu.menu_key.replace(':menu:', ':btn:')}:`),
      ),
    });
  }
  const permissionScopes = distinct(user.permission?.permission_scopes).filter(
    (scope) => /^[a-z][a-z0-9_-]*:(read|create|update|delete)$/.test(scope),
  );
  const permission: AuthPermission = {
    ...(Array.isArray(user.permission?.profile_actions)
      ? { profile_actions: user.permission.profile_actions }
      : {}),
    ...(permissionScopes.length > 0
      ? { permission_scopes: permissionScopes }
      : {}),
    ...(user.permission?.permission_scope === '*'
      ? { permission_scope: '*' as const }
      : {}),
    words: distinct(user.permission?.words).filter((key) =>
      key.startsWith(`${AUTH_SCOPE}:`),
    ),
    menus: [...menus.values()],
  };
  const paths = permission.menus.map((menu) => menu.menu_path);
  if (Array.isArray(user.permission?.navigation)) {
    const allowed = new Map(
      permission.menus.map((menu) => [menu.menu_key, menu.menu_path]),
    );
    const sanitize = (nodes: PermissionNavigation[]): PermissionNavigation[] =>
      nodes.flatMap<PermissionNavigation>((node) => {
        if (!node?.resource_key?.startsWith(`${AUTH_SCOPE}:`)) return [];
        if (node.menu_key || node.menu_path)
          return node.menu_key && allowed.get(node.menu_key) === node.menu_path
            ? [
                {
                  resource_key: node.resource_key,
                  menu_key: node.menu_key,
                  menu_path: node.menu_path,
                },
              ]
            : [];
        const children = sanitize(
          Array.isArray(node.children) ? node.children : [],
        );
        return children.length > 0
          ? [{ resource_key: node.resource_key, children }]
          : [];
      });
    permission.navigation = sanitize(user.permission.navigation);
  }
  const homePath = firstAuthorizedMenu(permission);
  return {
    language: user.metadata?.language ?? '',
    timezone: user.metadata?.timezone ?? '',
    uiPreferences: user.ui_preferences?.vben_pc,
    avatar: '',
    code: user.code,
    desc: '',
    homePath,
    permission,
    emailBindingSkipped: user.metadata?.email_binding_skipped === true,
    totpEnrollmentSkipped: user.metadata?.totp_enrollment_skipped === true,
    passwordResetSkipped: user.metadata?.password_reset_skipped === true,
    emailVerifiedAt: emailEnabled
      ? (user.email_verified_at ?? undefined)
      : undefined,
    email: emailEnabled ? (user.email ?? '') : '',
    emailBindingRequired: emailEnabled && user.email_binding_required === true,
    realName: user.username,
    role: user.role ?? undefined,
    roleName: user.role?.name ?? '',
    roles: paths,
    scope: user.scope,
    token: '',
    userId: String(user.id),
    username: user.username,
  };
}

export function skipEmailBindingApi() {
  return authRequestClient.request<undefined>('/info', {
    method: 'PATCH',
    data: { metadata: { email_binding_skipped: true } },
  });
}

export function updateUserLanguageApi(language: string) {
  return authRequestClient.request<undefined>('/info', {
    method: 'PATCH',
    data: { metadata: { language } },
  });
}

export function updateUIPreferencesApi(value: null | UIPreferencePatch) {
  return authRequestClient.request<{
    ui_preferences: { vben_pc: UIPreferences };
  }>('/info', {
    method: 'PATCH',
    data: { metadata: { ui_preferences: { vben_pc: value } } },
  });
}

export function updateUserTimezoneApi(timezone: string) {
  return authRequestClient.request<undefined>('/info', {
    method: 'PATCH',
    data: { metadata: { timezone } },
  });
}
