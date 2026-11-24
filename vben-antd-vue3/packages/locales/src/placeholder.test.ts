import { describe, expect, it } from 'vitest';

import { normalizePlaceholder } from './placeholder';

describe('concise placeholders', () => {
  it.each([
    ['请输入用户名', '用户名'],
    ['输入用户名或已绑定邮箱', '用户名或已绑定邮箱'],
    ['请选择角色', '角色'],
    ['选择一个图标', '图标'],
    ['请再次输入新密码', '新密码（确认）'],
    ['Please enter your current password', 'Current password'],
    ['Enter username or linked email', 'Username or linked email'],
    ['Please select a role', 'Role'],
    ['Select an icon', 'Icon'],
    ['Choose a destination directory', 'Destination directory'],
    ['Please enter the new password again', 'New password (confirmation)'],
    ['请输入', ''],
    ['Please select', ''],
    ['name@example.com', 'name@example.com'],
    ['e.g. admin:read:system:user', 'e.g. admin:read:system:user'],
    ['Leave blank to keep the password', 'Leave blank to keep the password'],
    ['Search by role name or key', 'Search by role name or key'],
    ['', ''],
  ])('%s → %s', (original, expected) => {
    expect(normalizePlaceholder(original)).toBe(expected);
    expect(normalizePlaceholder(expected)).toBe(expected);
  });
});
