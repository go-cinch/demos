import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import {
  authPublicRequestClient,
  authRequestClient,
  authSilentPublicRequestClient,
  authVerificationRequestClient,
  createServiceRequestClient,
  orderRequestClient,
} from './request';
import { requestErrorMessage } from './request-error';
import { showRequestErrorToast } from './request-feedback';

const state = vi.hoisted(() => ({
  locale: 'zh-CN',
  requirePasswordReset: vi.fn(),
}));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { locale: 'zh-CN', enableRefreshToken: false } },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessToken: null }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    captureSession: () => () => true,
    requirePasswordReset: state.requirePasswordReset,
  }),
}));
vi.mock('./core', () => ({ refreshTokenApi: vi.fn() }));
vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), info: vi.fn() },
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => {
    if (key === 'app.errors.serverLost') {
      if (state.locale === 'zh-CN') {
        return '服务器迷路啦~';
      }
      return 'The server seems to be lost~';
    }
    return key;
  },
}));

let now = 0;
beforeEach(() => {
  vi.clearAllMocks();
  state.locale = 'zh-CN';
  now += 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
});
function rejectWith(
  client: typeof authRequestClient,
  status: number,
  data: unknown,
) {
  const error = Object.assign(new Error('Request failed'), {
    response: { status, data },
  });
  return {
    error,
    request: client.get('/gateway-test', {
      adapter: async () => {
        throw error;
      },
    }),
  };
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
      config,
      data: { items: [{ id: 1 }] },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    await expect(client.get('/list', { adapter })).resolves.toEqual({
      items: [{ id: 1 }],
    });
    expect(required(adapter.mock.calls[0])[0]).toMatchObject({
      baseURL: 'https://orders.example.test/v2',
      url: '/list',
      headers: { 'Accept-Language': 'zh-CN', 'X-Auth-Scope': 'admin' },
    });
  });

  it('does not retry permission loading for Auth info failures, including query strings', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    for (const url of ['/info', '/info?scope=admin']) {
      await expect(
        authRequestClient.get(url, {
          adapter: async (config) => {
            throw Object.assign(new Error('Request rejected by test adapter'), {
              config,
              response: { status: 403, data: {} },
            });
          },
        }),
      ).rejects.toBeDefined();
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still reloads permissions for other Auth resources and another service info endpoint', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    for (const [client, url] of [
      [authRequestClient, '/user'],
      [orderRequestClient, '/info'],
    ] as const) {
      await expect(
        client.get(url, {
          adapter: async (config) => {
            throw Object.assign(new Error('Request rejected by test adapter'), {
              config,
              response: { status: 403, data: {} },
            });
          },
        }),
      ).rejects.toBeDefined();
    }
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(
      dispatch.mock.calls.every(
        ([event]) => event.type === 'auth-permissions-changed',
      ),
    ).toBe(true);
  });
});

describe('gateway error handling through application clients', () => {
  it.each([authRequestClient, authPublicRequestClient])(
    'preserves a public 502 message and status for page handlers',
    async (client) => {
      const { error, request } = rejectWith(client, 502, {
        msg: '服务器内部错误',
      });
      await expect(request).rejects.toBe(error);
      expect(error.message).toBe('服务器内部错误');
      expect(error.response.status).toBe(502);
      expect(message.error).toHaveBeenCalledWith('服务器内部错误');
    },
  );
  it.each([503, 504])(
    'classifies HTTP %s consistently across services and verification',
    async (status) => {
      for (const client of [
        orderRequestClient,
        authVerificationRequestClient,
      ]) {
        await expect(
          rejectWith(client, status, { msg: '邮件服务未启用' }).request,
        ).rejects.toMatchObject({ message: '邮件服务未启用' });
      }
      expect(message.error).toHaveBeenCalledExactlyOnceWith('邮件服务未启用');
    },
  );
  it('handles proxy HTML and silent captcha clients without a toast', async () => {
    const { request } = rejectWith(
      authSilentPublicRequestClient,
      502,
      '<html>Bad Gateway</html>',
    );
    await expect(request).rejects.toMatchObject({ message: '服务器迷路啦~' });
    expect(message.error).not.toHaveBeenCalled();
  });
  it('reports verification gateway outages but keeps ordinary validation inline', async () => {
    const { error, request } = rejectWith(
      authVerificationRequestClient,
      502,
      '',
    );
    await expect(request).rejects.toBe(error);
    expect(message.error).toHaveBeenCalledExactlyOnceWith('服务器迷路啦~');
    vi.clearAllMocks();
    const validation = rejectWith(authVerificationRequestClient, 400, {
      msg: 'Incorrect captcha',
    });
    await expect(validation.request).rejects.toBe(validation.error);
    expect(message.error).not.toHaveBeenCalled();
  });
  it('localizes gateway failures using the current language', async () => {
    state.locale = 'en-US';
    const { request } = rejectWith(
      authVerificationRequestClient,
      502,
      undefined,
    );
    await expect(request).rejects.toMatchObject({
      message: 'The server seems to be lost~',
    });
    expect(message.error).toHaveBeenCalledWith('The server seems to be lost~');
  });
  it.each([
    [
      400,
      { error_code: 'DICTIONARY_CATALOG_PROTECTED', msg: '无法更改该内容' },
    ],
    [403, { error_code: 'NEW_POLICY', msg: '请先获取授权' }],
    [409, { msg: '记录已变更' }],
    [500, { error_code: 'HTTP_INTERNAL', msg: '服务器内部错误，请稍后重试' }],
  ] as const)(
    'shows the public response message for HTTP %s',
    async (status, data) => {
      const { error, request } = rejectWith(authRequestClient, status, data);
      await expect(request).rejects.toBe(error);
      expect(message.error).toHaveBeenCalledExactlyOnceWith(data.msg);
    },
  );

  it.each([
    [400, { msg: '  ' }, 'ui.fallback.http.badRequest'],
    [403, { msg: null }, 'ui.fallback.http.forbidden'],
    [404, { message: 'debug detail' }, 'ui.fallback.http.notFound'],
    [429, {}, 'app.errors.tooManyRequests'],
    [
      500,
      { msg: 'Error: failed\n    at query (db.js:20:3)' },
      'ui.fallback.http.internalServerError',
    ],
    [503, '<html>Bad Gateway</html>', '服务器迷路啦~'],
    [
      504,
      { msg: '<!DOCTYPE html><html>Gateway Timeout</html>' },
      '服务器迷路啦~',
    ],
  ] as const)(
    'uses the HTTP %s fallback without public text',
    (status, data, expected) => {
      expect(requestErrorMessage({ response: { status, data } })).toBe(
        expected,
      );
    },
  );

  it.each([
    ['ECONNABORTED', 'ui.fallback.http.requestTimeout'],
    ['ETIMEDOUT', 'ui.fallback.http.requestTimeout'],
    ['ERR_NETWORK', 'ui.fallback.http.networkError'],
  ])('distinguishes transport failure %s', (code, expected) => {
    expect(requestErrorMessage({ code })).toBe(expected);
  });

  it.each([
    [
      400,
      '{"error_code":"AUDIT_FILTER_INVALID","msg":"筛选时间范围无效"}',
      '筛选时间范围无效',
    ],
    [503, '{"msg":"导出服务暂不可用"}', '导出服务暂不可用'],
    [503, '<html>Service Unavailable</html>', '服务器迷路啦~'],
  ] as const)(
    'decodes an HTTP %s export failure before feedback',
    async (status, body, expected) => {
      const { error, request } = rejectWith(
        authRequestClient,
        status,
        new Blob([body]),
      );
      await expect(request).rejects.toBe(error);
      expect(requestErrorMessage(error)).toBe(expected);
      expect(message.error).toHaveBeenCalledExactlyOnceWith(expected);
    },
  );

  it('lets the password-reset workflow handle a download error before any toast', async () => {
    const body = {
      error_code: 'AUTH_PASSWORD_RESET_REQUIRED',
      msg: '请先重置密码',
    };
    const { error, request } = rejectWith(
      authRequestClient,
      403,
      new Blob([JSON.stringify(body)]),
    );
    await expect(request).rejects.toBe(error);
    expect(state.requirePasswordReset).toHaveBeenCalledOnce();
    showRequestErrorToast(error);
    expect(message.error).not.toHaveBeenCalled();
  });

  it('leaves field validation to its form and suppresses cancelled requests', async () => {
    const { request } = rejectWith(authVerificationRequestClient, 400, {
      msg: '验证码错误',
    });
    await expect(request).rejects.toBeDefined();
    showRequestErrorToast({ code: 'ERR_CANCELED' });
    expect(message.error).not.toHaveBeenCalled();
  });
});

describe('request error toast deduplication', () => {
  it('reuses a request toast when the caller handles the same failure', async () => {
    const { error, request } = rejectWith(authRequestClient, 500, {});
    await expect(request).rejects.toBe(error);
    expect(message.error).toHaveBeenCalledTimes(1);
    showRequestErrorToast(error);
    expect(message.error).toHaveBeenCalledTimes(1);
  });

  it('immediately shows one toast for concurrent identical errors across clients', async () => {
    const failures = [
      orderRequestClient,
      authRequestClient,
      authPublicRequestClient,
      authVerificationRequestClient,
    ].map((client) => rejectWith(client, 502, ''));
    const results = await Promise.allSettled(
      failures.map(({ request }) => request),
    );
    results.forEach((result, index) => {
      expect(result).toEqual({
        status: 'rejected',
        reason: required(failures[index]).error,
      });
    });
    expect(message.error).toHaveBeenCalledExactlyOnceWith('服务器迷路啦~');
  });

  it('suppresses repeats before 500ms and allows them at 500ms without extending the window', async () => {
    await expect(
      rejectWith(authRequestClient, 502, '').request,
    ).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledTimes(1);
    now += 499;
    await expect(
      rejectWith(authPublicRequestClient, 502, '').request,
    ).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledTimes(1);
    now += 1;
    await expect(
      rejectWith(authVerificationRequestClient, 502, '').request,
    ).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledTimes(2);
  });

  it('keeps distinct server messages visible and deduplicates repeats', async () => {
    for (const msg of ['First error', 'Second error', 'First error']) {
      await expect(
        rejectWith(authPublicRequestClient, 400, { msg }).request,
      ).rejects.toBeDefined();
    }
    expect(vi.mocked(message.error).mock.calls).toEqual([
      ['First error'],
      ['Second error'],
    ]);
  });

  it('does not let a silent request suppress the next visible error', async () => {
    await expect(
      rejectWith(authSilentPublicRequestClient, 502, '').request,
    ).rejects.toBeDefined();
    await expect(
      rejectWith(authRequestClient, 502, '').request,
    ).rejects.toBeDefined();
    expect(message.error).toHaveBeenCalledExactlyOnceWith('服务器迷路啦~');
  });
});
