import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authRequestClient } from '#/api/request';

import { getUserInfoApi } from './user';

vi.mock('#/api/request', () => ({
  authRequestClient: {
    get: vi.fn(),
  },
}));

describe('getUserInfoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps menu permissions for route access and exposes the real role separately', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      code: 'ABC12345',
      id: 1,
      permission: {
        btns: ['*'],
        menus: [' /dashboard/overview ', '*', '/dashboard/overview'],
      },
      role: {
        id: 1,
        name: 'Admin',
        word: 'admin',
      },
      username: 'super',
    });

    const result = await getUserInfoApi();

    expect(result.roles).toEqual(['/dashboard/overview', '*']);
    expect(result.role).toEqual({ id: 1, name: 'Admin', word: 'admin' });
    expect(result.roleName).toBe('Admin');
    expect(result.homePath).toBe('/dashboard/overview');
  });

  it('uses the data dictionary as the home page when it is the first permitted menu', async () => {
    vi.mocked(authRequestClient.get).mockResolvedValue({
      code: 'ABC12345',
      id: 1,
      permission: {
        btns: ['system.dictionary.read'],
        menus: ['/system/dictionary'],
      },
      username: 'operator',
    });

    const result = await getUserInfoApi();

    expect(result.homePath).toBe('/system/dictionary');
  });
});
