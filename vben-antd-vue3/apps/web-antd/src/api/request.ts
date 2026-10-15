/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';
import {
  isBadGatewayError,
  normalizeGatewayError,
  requestErrorMessage,
} from './request-error';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

// Share the window across clients so concurrent page requests produce one toast.
const recentErrorMessages = new Map<string, number>();
const errorMessageWindowMs = 500;

function showRequestErrorMessage(content: string) {
  const now = performance.now();
  for (const [text, shownAt] of recentErrorMessages) {
    if (now - shownAt >= errorMessageWindowMs) recentErrorMessages.delete(text);
  }
  if (recentErrorMessages.has(content)) return;
  recentErrorMessages.set(content, now);
  message.error(content);
}

function createRequestClient(
  baseURL: string,
  options?: RequestClientOptions,
  enableReAuthentication: boolean = true,
  enableErrorMessage: boolean | 'gateway' = true,
) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate() {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const refreshToken = accessStore.refreshToken;
    if (!refreshToken) {
      throw new Error('refresh token is unavailable');
    }
    const resp = await refreshTokenApi(refreshToken);
    const newToken = resp.access_token;
    useAuthStore().acceptSession(resp);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // 处理返回的响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // Normalize gateway failures for both notifying and silent clients.
  client.addResponseInterceptor({
    rejected: (error) => Promise.reject(normalizeGatewayError(error)),
  });

  // token过期的处理
  if (enableReAuthentication) {
    client.addResponseInterceptor(
      authenticateResponseInterceptor({
        client,
        doReAuthenticate,
        doRefreshToken,
        enableRefreshToken: preferences.app.enableRefreshToken,
        formatToken,
      }),
    );
  }

  client.addResponseInterceptor({
    rejected: async (error) => {
      if (
        error?.response?.data?.error_code === 'AUTH_PASSWORD_RESET_REQUIRED'
      ) {
        await useAuthStore().requirePasswordReset();
      }
      throw error;
    },
  });

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  if (enableErrorMessage) {
    client.addResponseInterceptor(
      errorMessageResponseInterceptor((msg: string, error) => {
        if (enableErrorMessage === 'gateway' && !isBadGatewayError(error)) return;
        showRequestErrorMessage(requestErrorMessage(error, msg));
      }),
    );
  }

  return client;
}

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'data',
});

/** Direct REST client for the generated auth service. */
const authApiURL = import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth';

export const authRequestClient = createRequestClient(authApiURL, {
  responseReturn: 'body',
});

/** Auth client for login/logout, where a 401 must not recursively log out. */
export const authPublicRequestClient = createRequestClient(
  authApiURL,
  {
    responseReturn: 'body',
  },
  false,
);

/** Silent public client for background checks and token-backed session calls. */
export const authSilentPublicRequestClient = createRequestClient(
  authApiURL,
  {
    responseReturn: 'body',
  },
  false,
  false,
);

/** Verification failures stay inline; an unavailable gateway must remain visible. */
export const authVerificationRequestClient = createRequestClient(
  authApiURL,
  {
    responseReturn: 'body',
  },
  false,
  'gateway',
);

export const authSessionRequestClient = authSilentPublicRequestClient;

export const baseRequestClient = new RequestClient({ baseURL: apiURL });
