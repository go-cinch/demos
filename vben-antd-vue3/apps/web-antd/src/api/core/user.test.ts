import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authRequestClient } from '#/api/request';

import {
  getUserInfoApi,
  skipEmailBindingApi,
  updateUserLanguageApi,
  updateUserTimezoneApi,
} from './user';
const properties = vi.hoisted(() => vi.fn());
vi.mock('#/store/system-properties', () => ({
  loadSystemProperties: properties,
}));
vi.mock('#/api/request', () => ({
  authRequestClient: { get: vi.fn(), request: vi.fn() },
}));
const user = { code: 'ABC12345', id: 1, scope: 'admin', username: 'operator' };
const menu = {
  menu_key: 'admin:menu:system:user',
  menu_path: '/system/user',
  btns: ['admin:btn:system:user:query'],
};
describe('scoped user permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    properties.mockResolvedValue({ email_enabled: true });
  });
  it('omits email fields and ignores an old binding when delivery is disabled', async () => {
    properties.mockResolvedValue({ email_enabled: false });
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      email: 'old@example.test',
      email_verified_at: 1,
      email_binding_required: true,
    });
    expect(await getUserInfoApi()).toMatchObject({
      email: '',
      emailVerifiedAt: undefined,
      emailBindingRequired: false,
    });
    expect(authRequestClient.get).toHaveBeenCalledWith('/info', {
      params: {
        ui: 'vben_pc',
        f: 'id,username,code,role,scope,permission,metadata,ui_preferences',
      },
    });
  });
  it.each([true, false])(
    'loads all saved onboarding preferences independently of email delivery (%s)',
    async (emailEnabled) => {
      properties.mockResolvedValue({ email_enabled: emailEnabled });
      vi.mocked(authRequestClient.get).mockResolvedValue({
        ...user,
        metadata: {
          totp_enrollment_skipped: true,
          password_reset_skipped: true,
          email_binding_skipped: true,
        },
      });
      expect(await getUserInfoApi()).toMatchObject({
        totpEnrollmentSkipped: true,
        passwordResetSkipped: true,
        emailBindingSkipped: true,
      });
      expect(
        vi.mocked(authRequestClient.get).mock.calls[0]?.[1]?.params?.f,
      ).toContain('metadata');
      vi.mocked(authRequestClient.get).mockResolvedValue(user);
      expect(await getUserInfoApi()).toMatchObject({
        totpEnrollmentSkipped: false,
        passwordResetSkipped: false,
        emailBindingSkipped: false,
      });
    },
  );
  it('writes only the self-service preference to info', async () => {
    await skipEmailBindingApi();
    expect(authRequestClient.request).toHaveBeenCalledWith('/info', {
      method: 'PATCH',
      data: { metadata: { email_binding_skipped: true } },
    });
  });
  it('uses the scoped request client without a scope query and keeps permission identities separate', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      metadata: { email_binding_skipped: true },
      role: { id: 3, name: 'Operator', word: 'operator' },
      permission: { words: ['admin:read:system:user'], menus: [menu] },
    });
    const result = await getUserInfoApi();
    expect(authRequestClient.get).toHaveBeenCalledWith('/info', {
      params: {
        ui: 'vben_pc',
        f: 'id,username,code,role,scope,permission,email,email_verified_at,email_binding_required,metadata,ui_preferences',
      },
    });
    expect(result.emailBindingSkipped).toBe(true);
    expect(result.roles).toEqual(['/system/user']);
    expect(result.permission.words).toEqual(['admin:read:system:user']);
    expect(result.permission.menus[0]?.btns).toEqual([
      'admin:btn:system:user:query',
    ]);
    expect(result.roleName).toBe('Operator');
    expect(result.homePath).toBe('/system/user');
  });
  it('does not promote a role, wildcard, wrong scope or business word to page/button access', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      role: { id: 1, name: 'Admin', word: 'admin' },
      permission: {
        words: ['*', 'mini:read:system:user'],
        menus: [{ ...menu, menu_key: 'mini:menu:system:user' }],
      },
    });
    const result = await getUserInfoApi();
    expect(result.roles).toEqual([]);
    expect(result.permission).toEqual({ words: [], menus: [] });
    expect(result.homePath).toBe('/profile');
  });
  it('deduplicates buttons within their page and rejects mismatched response scopes', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [
          menu,
          menu,
          {
            ...menu,
            menu_path: '/system/role',
            btns: ['admin:btn:system:role:delete'],
          },
        ],
      },
    });
    const receivedUser = await getUserInfoApi();
    expect(receivedUser.permission.menus).toHaveLength(1);
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      scope: 'mini',
    });
    await expect(getUserInfoApi()).rejects.toThrow('Invalid permission scope');
  });
  it('filters navigation through authorized pages and scope while preserving catalog order', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [menu],
        navigation: [
          {
            resource_key: 'admin:audit',
            children: [
              {
                resource_key: 'admin:audit:user',
                menu_key: menu.menu_key,
                menu_path: menu.menu_path,
              },
              {
                resource_key: 'admin:audit:role',
                menu_key: 'admin:menu:system:role',
                menu_path: '/system/role',
              },
            ],
          },
          {
            resource_key: 'mini:other',
            children: [
              {
                resource_key: 'mini:other:user',
                menu_key: menu.menu_key,
                menu_path: menu.menu_path,
              },
            ],
          },
        ],
      },
    });
    const receivedUser = await getUserInfoApi();
    expect(receivedUser.permission.navigation).toEqual([
      {
        resource_key: 'admin:audit',
        children: [
          {
            resource_key: 'admin:audit:user',
            menu_key: menu.menu_key,
            menu_path: menu.menu_path,
          },
        ],
      },
    ]);
  });
  it('retains explicitly granted developer menus, buttons and navigation without all permissions', async () => {
    const developerMenu = {
      menu_key: 'admin:menu:system:developer',
      menu_path: '/system/developer',
      btns: ['admin:btn:system:developer:publish'],
    };
    const navigation = [
      {
        resource_key: 'admin:system',
        children: [
          {
            resource_key: 'admin:system:developer',
            menu_key: developerMenu.menu_key,
            menu_path: developerMenu.menu_path,
          },
        ],
      },
    ];
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      username: 'developer',
      role: { id: 4, name: 'Developer', word: 'developer' },
      permission: {
        words: ['admin:update:system:developer'],
        menus: [developerMenu],
        navigation,
      },
    });
    const result = await getUserInfoApi();
    expect(result.permission.words).not.toContain('admin:all:system:all');
    expect(result.permission.menus).toEqual([developerMenu]);
    expect(result.permission.navigation).toEqual(navigation);
    expect(result.roles).toEqual(['/system/developer']);
  });
  it('does not grant the developer page from its word or role when the backend omits its page entry', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      role: { id: 4, name: 'Developer', word: 'developer' },
      permission: {
        words: ['admin:update:system:developer'],
        menus: [menu],
        navigation: [
          {
            resource_key: 'admin:system',
            children: [
              {
                resource_key: 'admin:system:developer',
                menu_key: 'admin:menu:system:developer',
                menu_path: '/system/developer',
              },
            ],
          },
        ],
      },
    });
    const result = await getUserInfoApi();
    expect(result.permission.menus).toEqual([menu]);
    expect(result.permission.navigation).toEqual([]);
    expect(result.roles).not.toContain('/system/developer');
  });
  it('normalizes assignment scopes separately from business words and wildcard authority', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        permission_scope: '*',
        permission_scopes: [
          ' user:update ',
          'user:update',
          'role:read',
          'user:*',
          'admin:user:update',
          1,
          '',
        ],
        words: [
          ' admin:read:system:user ',
          'admin:read:system:user',
          'mini:read:system:user',
          null,
        ],
        menus: [menu],
      },
    });
    const receivedUser = await getUserInfoApi();
    expect(receivedUser.permission).toMatchObject({
      permission_scope: '*',
      permission_scopes: ['user:update', 'role:read'],
      words: ['admin:read:system:user'],
    });
  });
  it('drops external and relative page paths and cross-page button identifiers', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [
          { ...menu, menu_path: '//outside.example' },
          { ...menu, menu_path: 'system/user' },
          {
            ...menu,
            btns: [
              menu.btns[0],
              'admin:btn:system:role:delete',
              'mini:btn:system:user:query',
              '*',
            ],
          },
        ],
      },
    });
    const receivedUser = await getUserInfoApi();
    expect(receivedUser.permission.menus).toEqual([menu]);
  });
  it('uses authorized menu order and falls back to profile when permission data is absent', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      ...user,
      permission: {
        words: [],
        menus: [
          menu,
          {
            menu_key: 'admin:menu:dashboard:overview',
            menu_path: '/dashboard/overview',
            btns: [],
          },
        ],
      },
    });
    const receivedUser = await getUserInfoApi();
    expect(receivedUser.homePath).toBe('/system/user');
    vi.mocked(authRequestClient.get).mockResolvedValue(user);
    expect(await getUserInfoApi()).toMatchObject({
      homePath: '/profile',
      roles: [],
      permission: { words: [], menus: [] },
    });
  });
});

it('reads and patches the current account language using metadata', async () => {
  vi.mocked(authRequestClient.get).mockResolvedValue({
    ...user,
    metadata: { language: 'fr-FR' },
  });
  const receivedUser = await getUserInfoApi();
  expect(receivedUser.language).toBe('fr-FR');
  await updateUserLanguageApi('zh-CN');
  expect(authRequestClient.request).toHaveBeenCalledWith('/info', {
    method: 'PATCH',
    data: { metadata: { language: 'zh-CN' } },
  });
});

it('reads and patches timezone globally beside language without writing per-client preferences', async () => {
  vi.mocked(authRequestClient.get).mockResolvedValue({
    ...user,
    metadata: { language: 'zh-CN', timezone: 'Asia/Tokyo' },
  });
  expect(await getUserInfoApi()).toMatchObject({
    language: 'zh-CN',
    timezone: 'Asia/Tokyo',
  });
  await updateUserTimezoneApi('America/New_York');
  expect(authRequestClient.request).toHaveBeenCalledWith('/info', {
    method: 'PATCH',
    data: { metadata: { timezone: 'America/New_York' } },
  });
});
