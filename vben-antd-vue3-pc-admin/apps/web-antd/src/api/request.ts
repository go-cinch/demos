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

import { $t } from '#/locales';
import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function createRequestClient(
  baseURL: string,
  options?: RequestClientOptions,
  enableReAuthentication: boolean = true,
  enableErrorMessage: boolean = true,
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
        // 这里可以根据业务进行定制,你可以拿到 error 内的信息进行定制化处理，根据不同的 code 做不同的提示，而不是直接使用 message.error 提示 msg
        // 当前mock接口返回的错误字段是 error 或者 message
        const responseData = error?.response?.data ?? {};
        const errorMessage = [
          responseData?.msg,
          responseData?.message,
          responseData?.error,
        ].find((value) => typeof value === 'string' && value.trim());
        // Backend business errors are localized using the request language.
        message.error(errorMessage || msg || $t('app.errors.failed'));
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

export const authSessionRequestClient = authSilentPublicRequestClient;

export const baseRequestClient = new RequestClient({ baseURL: apiURL });
