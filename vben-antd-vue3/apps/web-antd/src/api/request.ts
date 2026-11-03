/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@vben/request';

import type { ServiceClientOptions } from './request-types';

import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { MFACancelled, requestMFA } from '#/security/mfa-prompt';
import { useAuthStore } from '#/store';

import { rememberAuthRequirements, responseHeader } from './auth-headers';
import { refreshTokenApi } from './core';
import { prepareMFARetry } from './mfa-retry';
import {
  isBadGatewayError,
  normalizeGatewayError,
  requestErrorMessage,
} from './request-error';

const authApiURL = import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth';

// Share the window across clients so concurrent page requests produce one toast.
const recentErrorMessages = new Map<string, number>();
const errorMessageWindowMs = 500;
let pendingSessionRefresh:
  | undefined
  | { refreshToken: string; promise: Promise<string> };

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
  settings: ServiceClientOptions = {},
) {
  const {
    authentication = 'refresh',
    errorMessage: enableErrorMessage = true,
    mfaChallenge: mfaChallengeMode = 'prompt',
    ...options
  } = settings;
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
    if (pendingSessionRefresh?.refreshToken === refreshToken) {
      return pendingSessionRefresh.promise;
    }
    const isCurrentSession = useAuthStore().captureSession();
    const promise = (async () => {
      const resp = await refreshTokenApi(refreshToken);
      if (!isCurrentSession() || accessStore.refreshToken !== refreshToken) {
        throw new Error('Refresh response belongs to an expired session');
      }
      useAuthStore().acceptSession(resp, true);
      return resp.access_token;
    })();
    const pending = { refreshToken, promise };
    pendingSessionRefresh = pending;
    try {
      return await promise;
    } finally {
      if (pendingSessionRefresh === pending) pendingSessionRefresh = undefined;
    }
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
      config.headers['X-Auth-Scope'] = 'admin';
      return config;
    },
  });

  client.addResponseInterceptor({
    fulfilled: (response) => {
      rememberAuthRequirements(response.data, response.headers);
      return response;
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
  if (authentication === 'refresh') {
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
      const headers = error?.response?.headers;
      if (responseHeader(headers, 'X-MFA-Enrollment-Required') === 'true') {
        await useAuthStore().requireMFAEnrollment();
        throw error;
      }
      if (responseHeader(headers, 'X-MFA-Required') === 'true') {
        if (
          error?.response?.status !== 403 ||
          mfaChallengeMode === 'inline' ||
          error?.config?._mfaRetried
        )
          throw error;
        const ticket = responseHeader(headers, 'X-MFA-Ticket');
        if (
          ticket &&
          baseURL === authApiURL &&
          error.config.url === '/pub/login'
        ) {
          return requestMFA(
            'login',
            ticket,
            Number(responseHeader(headers, 'X-MFA-Expires-At')),
          );
        }
        const isCurrentSession = useAuthStore().captureSession();
        let replayed = false;
        let result: unknown;
        let failure: unknown;
        await requestMFA('sensitive', undefined, undefined, async (code) => {
          if (!isCurrentSession()) throw new MFACancelled();
          const retry = await prepareMFARetry(error.config);
          if (!isCurrentSession()) throw new MFACancelled();
          retry.headers = { ...retry.headers, 'X-MFA-Code': code };
          let verified = true;
          try {
            result = await client.request(error.config.url, retry);
          } catch (cause: any) {
            if (
              responseHeader(cause?.response?.headers, 'X-MFA-Required') ===
              'true'
            )
              throw cause;
            // Return non-MFA failures to their caller without success feedback
            // or offering to submit the mutation again in the MFA dialog.
            failure = cause;
            verified = false;
          }
          replayed = true;
          return verified;
        });
        if (!isCurrentSession()) throw new MFACancelled();
        if (replayed) {
          if (failure) throw failure;
          return result;
        }
        // Concurrent callers share one prompt; the first retry established the
        // same-session fixed-window grant, so the others need no reusable code.
        const retry = await prepareMFARetry(error.config);
        if (!isCurrentSession()) throw new MFACancelled();
        return client.request(error.config.url, retry);
      }
      const isAuthInfoRequest =
        baseURL === authApiURL &&
        String(error?.config?.url ?? '').split(/[?#]/, 1)[0] === '/info';
      if (error?.response?.status === 403 && !isAuthInfoRequest) {
        window.dispatchEvent(new Event('auth-permissions-changed'));
      }
      if (
        (error?.response?.status === 403 &&
          responseHeader(headers, 'X-Password-Reset-Required') === 'true') ||
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
        if (error instanceof MFACancelled) return;
        if (
          responseHeader(error?.response?.headers, 'X-MFA-Required') === 'true'
        )
          return;
        if (enableErrorMessage === 'gateway' && !isBadGatewayError(error))
          return;
        showRequestErrorMessage(requestErrorMessage(error, msg));
      }),
    );
  }

  return client;
}

/** Service clients share session handling while keeping independent base URLs. */
export function createServiceRequestClient(
  baseURL: string,
  options?: RequestClientOptions,
) {
  return createRequestClient(baseURL, { responseReturn: 'body', ...options });
}

export const authRequestClient = createServiceRequestClient(authApiURL);

export const orderRequestClient = createServiceRequestClient(
  import.meta.env.VITE_GLOB_ORDER_API_URL || '/api/order',
);

/** Public calls must not recursively reauthenticate on a rejected password. */
export const authPublicRequestClient = createRequestClient(authApiURL, {
  responseReturn: 'body',
  authentication: 'none',
});

export const authSilentPublicRequestClient = createRequestClient(authApiURL, {
  responseReturn: 'body',
  authentication: 'none',
  errorMessage: false,
});

/** Field verification owns its error UI; gateway failures remain visible. */
export const authVerificationRequestClient = createRequestClient(authApiURL, {
  responseReturn: 'body',
  authentication: 'none',
  errorMessage: 'gateway',
});

export const authSessionRequestClient = authSilentPublicRequestClient;

export const authMFAVerificationRequestClient = createRequestClient(
  authApiURL,
  {
    responseReturn: 'body',
    errorMessage: 'gateway',
    mfaChallenge: 'inline',
  },
);
