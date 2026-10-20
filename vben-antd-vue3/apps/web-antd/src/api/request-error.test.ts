import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authPublicRequestClient, authRequestClient, authSilentPublicRequestClient, authVerificationRequestClient, createServiceRequestClient, orderRequestClient, requestClient } from './request';
import { isBadGatewayError } from './request-error';

const state = vi.hoisted(() => ({ locale: 'zh-CN' }));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({ preferences: { app: { locale: 'zh-CN', enableRefreshToken: false } } }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => ({ accessToken: null }) }));
vi.mock('#/store', () => ({ useAuthStore: () => ({}) }));
vi.mock('./core', () => ({ refreshTokenApi: vi.fn() }));
vi.mock('ant-design-vue', () => ({ message: { error: vi.fn() } }));
vi.mock('#/locales', () => ({ $t: (key: string) => key === 'app.errors.serverLost' ? state.locale === 'zh-CN' ? '服务器迷路啦~' : 'The server seems to be lost~' : key }));

let now = 0;
beforeEach(() => {
  vi.clearAllMocks();
  state.locale = 'zh-CN';
  now += 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { vi.restoreAllMocks(); });
function rejectWith(client: typeof authRequestClient, status: number, data: unknown) {
  const error = Object.assign(new Error('Request failed'), { response: { status, data } });
  return { error, request: client.get('/gateway-test', { adapter: async () => { throw error; } }) };
}

describe('service request routing', () => {
  it('joins service-internal paths with independent configured base URLs', async () => {
    expect(authRequestClient.instance.getUri({ url: '/info' })).toBe(
      `${import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth'}/info`,
    );
    expect(orderRequestClient.instance.getUri({ url: '/list' })).toBe(
      `${import.meta.env.VITE_GLOB_ORDER_API_URL || '/api/order'}/list`,
    );
    const client = createServiceRequestClient('https://orders.example.test/v2');
    const adapter = vi.fn(async (config) => ({
      config, data: { items: [{ id: 1 }] }, headers: {}, status: 200, statusText: 'OK',
    }));
    await expect(client.get('/list', { adapter })).resolves.toEqual({ items: [{ id: 1 }] });
    expect(adapter.mock.calls[0]![0]).toMatchObject({
      baseURL: 'https://orders.example.test/v2', url: '/list',
      headers: { 'Accept-Language': 'zh-CN', 'X-Auth-Scope': 'admin' },
    });
  });

  it('does not retry permission loading for Auth info failures, including query strings', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    for (const url of ['/info', '/info?scope=admin']) {
      await expect(authRequestClient.get(url, {
        adapter: async (config) => { throw { config, response: { status: 403, data: {} } }; },
      })).rejects.toBeDefined();
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still reloads permissions for other Auth resources and another service info endpoint', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    for (const [client, url] of [[authRequestClient, '/user'], [orderRequestClient, '/info']] as const) {
      await expect(client.get(url, {
        adapter: async (config) => { throw { config, response: { status: 403, data: {} } }; },
      })).rejects.toBeDefined();
    }
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.every(([event]) => event.type === 'auth-permissions-changed')).toBe(true);
  });
});

describe('gateway error handling through application clients', () => {
  it.each([authRequestClient, authPublicRequestClient])('overrides a 502 body and preserves status for page handlers', async (client) => {
    const { error, request } = rejectWith(client, 502, { msg: '服务器内部错误' });
    await expect(request).rejects.toBe(error);
    expect(error.message).toBe('服务器迷路啦~');
    expect(error.response.status).toBe(502);
    expect(message.error).toHaveBeenCalledWith('服务器迷路啦~');
  });
  it('handles proxy HTML and silent captcha clients without a toast', async () => {
    const { request } = rejectWith(authSilentPublicRequestClient, 502, '<html>Bad Gateway</html>');
    await expect(request).rejects.toMatchObject({ message: '服务器迷路啦~' });
    expect(message.error).not.toHaveBeenCalled();
  });
  it('reports verification gateway outages but keeps ordinary validation inline', async () => {
    const { error, request } = rejectWith(authVerificationRequestClient, 502, '');
    await expect(request).rejects.toBe(error);
    expect(message.error).toHaveBeenCalledExactlyOnceWith('服务器迷路啦~');
    vi.clearAllMocks();
    const validation = rejectWith(authVerificationRequestClient, 400, { msg: 'Incorrect captcha' });
    await expect(validation.request).rejects.toBe(validation.error);
    expect(message.error).not.toHaveBeenCalled();
  });
  it('localizes gateway failures using the current language', async () => {
    state.locale = 'en-US';
    const { request } = rejectWith(authVerificationRequestClient, 502, undefined);
    await expect(request).rejects.toMatchObject({ message: 'The server seems to be lost~' });
    expect(message.error).toHaveBeenCalledWith('The server seems to be lost~');
  });
  it('preserves business validation and actual internal server errors', async () => {
    for (const status of [400, 500]) {
      const { error, request } = rejectWith(authPublicRequestClient, status, { msg: 'Original error' });
      await expect(request).rejects.toBe(error);
      expect(error.message).toBe('Request failed');
      expect(message.error).toHaveBeenLastCalledWith('Original error');
    }
    expect(isBadGatewayError(new Error('502 in an unrelated message'))).toBe(false);
  });
});

describe('request error toast deduplication', () => {
  it('immediately shows one toast for concurrent identical errors across clients', async () => {
    const failures = [requestClient, authRequestClient, authPublicRequestClient, authVerificationRequestClient]
      .map((client) => rejectWith(client, 502, ''));
    const results = await Promise.allSettled(failures.map(({ request }) => request));
    results.forEach((result, index) => {
      expect(result).toEqual({ status: 'rejected', reason: failures[index]!.error });
    });
    expect(message.error).toHaveBeenCalledExactlyOnceWith('服务器迷路啦~');
  });

  it('suppresses repeats before 500ms and allows them at 500ms without extending the window', async () => {
    await expect(rejectWith(authRequestClient, 502, '').request).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledTimes(1);
    now += 499;
    await expect(rejectWith(authPublicRequestClient, 502, '').request).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledTimes(1);
    now += 1;
    await expect(rejectWith(authVerificationRequestClient, 502, '').request).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledTimes(2);
  });

  it('keeps different messages independent and deduplicates interleaved business errors', async () => {
    for (const msg of ['First error', 'Second error', 'First error']) {
      await expect(rejectWith(authPublicRequestClient, 400, { msg }).request).rejects.toBeDefined();
    }
    expect(message.error).toHaveBeenCalledTimes(2);
    expect(message.error).toHaveBeenNthCalledWith(1, 'First error');
    expect(message.error).toHaveBeenNthCalledWith(2, 'Second error');
  });

  it('does not let a silent request suppress the next visible error', async () => {
    await expect(rejectWith(authSilentPublicRequestClient, 502, '').request).rejects.toBeDefined();
    await expect(rejectWith(authRequestClient, 502, '').request).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledExactlyOnceWith('服务器迷路啦~');
  });
});
