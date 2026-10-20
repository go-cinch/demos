import { expect, it, vi } from 'vitest';

import { refreshTokenApi } from './core';
import { createServiceRequestClient } from './request';

const session = vi.hoisted(() => ({
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  setAccessToken: vi.fn(),
}));

vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { locale: 'zh-CN', enableRefreshToken: true } },
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => session }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    logout: vi.fn(),
    acceptSession: (response: { access_token: string; refresh_token: string }) => {
      session.accessToken = response.access_token;
      session.refreshToken = response.refresh_token;
    },
  }),
}));
vi.mock('./core', () => ({ refreshTokenApi: vi.fn() }));
vi.mock('ant-design-vue', () => ({ message: { error: vi.fn() } }));

it('shares one Auth refresh when different services return 401 concurrently', async () => {
  let releaseRefresh!: () => void;
  const gate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  vi.mocked(refreshTokenApi).mockImplementation(async () => {
    await gate;
    return {
      access_token: 'new-access', refresh_token: 'new-refresh',
      expired_at: 123, password_reset_required: false,
    };
  });
  const clients = [
    createServiceRequestClient('/api/auth'),
    createServiceRequestClient('/api/order'),
  ];
  const results = Promise.allSettled(clients.map((client, index) =>
    client.get(index === 0 ? '/info' : '/list', {
      adapter: async (config) => {
        if (config.headers.Authorization === 'Bearer old-access') {
          throw { config, response: { status: 401, data: {} } };
        }
        expect(config.headers.Authorization).toBe('Bearer new-access');
        return { config, data: { ok: true }, headers: {}, status: 200, statusText: 'OK' };
      },
    }),
  ));
  try {
    await vi.waitFor(() => expect(refreshTokenApi).toHaveBeenCalled());
  } finally {
    releaseRefresh();
  }
  const settled = await results;
  expect(refreshTokenApi).toHaveBeenCalledExactlyOnceWith('old-refresh');
  expect(settled).toEqual([
    { status: 'fulfilled', value: { ok: true } },
    { status: 'fulfilled', value: { ok: true } },
  ]);
});
