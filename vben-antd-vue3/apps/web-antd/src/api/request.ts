/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@vben/request';

import type {
  ServiceClientOptions,
  ServiceRequestConfig,
} from './request-types';

import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';
import { browserSession } from '@vben/stores/session';
import { userCache } from '@vben/utils/cache';

import {
  requestVerification,
  VerificationCancelled,
} from '#/security/verification-prompt';
import { useAuthStore } from '#/store';
import { releaseSessionCache } from '#/store/session-cache';

import { responseHeader } from './auth-headers';
import {
  encryptSensitiveEmailCode,
  getSensitiveStatusApi,
  refreshTokenApi,
} from './core';
import {
  isServiceUnavailableError,
  rejectResponseError,
} from './request-error';
import {
  markRequestErrorReported,
  reportExpiredSession,
  showRequestErrorToast,
} from './request-feedback';
import {
  isVerificationFailure,
  needsSensitivePreflight,
} from './verification-policy';
import { prepareVerificationRetry } from './verification-retry';

const sensitiveStatusFlights = new Map<
  boolean,
  {
    token: string;
    promise: ReturnType<typeof getSensitiveStatusApi>;
  }
>();
async function sensitivePreflight(suppressErrorMessage = false) {
  const token = useAccessStore().accessToken;
  if (!token) return undefined;
  const inFlight = sensitiveStatusFlights.get(suppressErrorMessage);
  if (inFlight?.token === token) return inFlight.promise;
  const pending = {
    token,
    promise: getSensitiveStatusApi(suppressErrorMessage),
  };
  sensitiveStatusFlights.set(suppressErrorMessage, pending);
  try {
    return await pending.promise;
  } finally {
    if (sensitiveStatusFlights.get(suppressErrorMessage) === pending)
      sensitiveStatusFlights.delete(suppressErrorMessage);
  }
}

const authApiURL = import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth';

type SessionRequestConfig = ServiceRequestConfig & {
  _isCurrentSession?: () => boolean;
};

function isCurrentRequest(config?: SessionRequestConfig) {
  return config?._isCurrentSession?.() !== false;
}

let pendingSessionRefresh:
  | undefined
  | { refreshToken: string; promise: Promise<string> };

function createRequestClient(
  baseURL: string,
  settings: ServiceClientOptions = {},
) {
  const {
    authentication = 'refresh',
    errorMessage: enableErrorMessage = true,
    verificationChallenge: verificationChallengeMode = 'prompt',
    ...options
  } = settings;
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate(cause: unknown) {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    reportExpiredSession(cause, Boolean(accessStore.accessToken));
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setRefreshToken(null);
      if (userCache.account) authStore.rememberExpiredPage();
      browserSession.end();
      releaseSessionCache();
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken(unauthorized?: unknown) {
    const accessStore = useAccessStore();
    const refreshToken = browserSession.latestToken(accessStore.refreshToken);
    if (refreshToken && refreshToken !== accessStore.refreshToken)
      accessStore.setRefreshToken(refreshToken);
    if (!refreshToken) {
      throw unauthorized ?? new Error('refresh token is unavailable');
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
      await useAuthStore().acceptSession(resp, true);
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
      const sessionConfig = config as SessionRequestConfig;
      // Axios preserves custom config functions on retry. Never recapture a new
      // account's session for a request that originally belonged to an old one.
      sessionConfig._isCurrentSession ??= useAuthStore().captureSession();
      if (!isCurrentRequest(sessionConfig)) throw new VerificationCancelled();
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] =
        responseHeader(config.headers, 'Accept-Language') ?? preferences.app.locale;
      config.headers['X-Auth-Scope'] = 'admin';
      if (
        authentication === 'refresh' &&
        verificationChallengeMode === 'prompt' &&
        !(config as { _verificationRetried?: boolean })._verificationRetried &&
        !responseHeader(config.headers, 'X-TOTP-Code') &&
        !responseHeader(config.headers, 'X-Step-Up-Credential') &&
        needsSensitivePreflight(
          config.method,
          config.url,
          baseURL === authApiURL,
        )
      ) {
        const isCurrent = useAuthStore().captureSession();
        const status = await sensitivePreflight(
          sessionConfig.suppressErrorMessage,
        );
        if (!isCurrent()) throw new VerificationCancelled();
        if (
          status &&
          (status.methods.totp || status.methods.email) &&
          status.grant.expired_at <= status.server_time
        ) {
          // Route through the shared verification/replay path before sending the mutation.
          throw Object.assign(new Error('Additional verification required'), {
            config,
            response: {
              status: 403,
              headers: {},
              data: { error_code: 'AUTH_STEP_UP_REQUIRED' },
            },
            verificationMethods: {
              totp: status.methods.totp,
              address: status.methods.email
                ? (status.methods.address ?? '')
                : '',
            },
          });
        }
      }
      return config;
    },
  });

  // Discard successful responses too, before the shared interceptor strips their config.
  client.addResponseInterceptor({
    fulfilled(response) {
      if (!isCurrentRequest(response.config)) throw new VerificationCancelled();
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

  // Normalize error responses before session, verification and feedback handlers.
  client.addResponseInterceptor({
    rejected: rejectResponseError,
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
        isCurrentRequest,
      }),
    );
  }

  client.addResponseInterceptor({
    rejected: async (error) => {
      if (!isCurrentRequest(error?.config)) throw new VerificationCancelled();
      const headers = error?.response?.headers;
      if (
        error?.response?.data?.error_code === 'AUTH_PASSWORD_RESET_REQUIRED'
      ) {
        markRequestErrorReported(error);
        await useAuthStore().requirePasswordReset();
        throw error;
      }
      if (error?.response?.data?.error_code === 'AUTH_EMAIL_BINDING_REQUIRED') {
        markRequestErrorReported(error);
        await useAuthStore().requireEmailBinding();
        throw error;
      }
      if (
        error?.response?.data?.error_code === 'AUTH_TOTP_ENROLLMENT_REQUIRED'
      ) {
        markRequestErrorReported(error);
        await useAuthStore().requireTOTPEnrollment();
        throw error;
      }
      const errorCode = error?.response?.data?.error_code;
      const loginTicket =
        baseURL === authApiURL &&
        error?.config?.url === '/pub/login' &&
        responseHeader(headers, 'X-MFA-Ticket');
      if (
        errorCode === 'AUTH_STEP_UP_REQUIRED' ||
        errorCode === 'AUTH_LOGIN_MFA_REQUIRED' ||
        loginTicket
      ) {
        if (
          (!loginTicket && error?.response?.status !== 403) ||
          verificationChallengeMode === 'inline' ||
          error?.config?._verificationRetried
        )
          throw error;
        const ticket = responseHeader(headers, 'X-MFA-Ticket');
        if (errorCode === 'AUTH_LOGIN_MFA_REQUIRED' && !loginTicket)
          throw error;
        if (
          ticket &&
          baseURL === authApiURL &&
          error.config.url === '/pub/login'
        ) {
          return requestVerification(
            'login',
            ticket,
            Number(responseHeader(headers, 'X-MFA-Expires-At')),
          );
        }
        const isCurrentSession = useAuthStore().captureSession();
        let replayed = false;
        let result: unknown;
        let failure: unknown;
        await requestVerification(
          'sensitive',
          undefined,
          undefined,
          async (code, email) => {
            if (!isCurrentSession()) throw new VerificationCancelled();
            const retry = await prepareVerificationRetry(error.config);
            if (!isCurrentSession()) throw new VerificationCancelled();
            if (email) {
              const proof = await encryptSensitiveEmailCode(code, email);
              if (!isCurrentSession()) throw new VerificationCancelled();
              retry.headers = {
                ...retry.headers,
                'X-Step-Up-Challenge': proof.challenge_id,
                'X-Step-Up-Credential': proof.credential,
              };
            } else {
              retry.headers = { ...retry.headers, 'X-TOTP-Code': code };
            }
            let verified = true;
            try {
              result = await client.request(error.config.url, retry);
            } catch (error: any) {
              if (isVerificationFailure(error?.response?.data?.error_code))
                throw error;
              // Return non-verification failures to their caller without success feedback
              // or offering to submit the mutation again in the verification dialog.
              failure = error;
              verified = false;
            }
            replayed = true;
            return verified;
          },
          error.verificationMethods,
        );
        if (!isCurrentSession()) throw new VerificationCancelled();
        if (replayed) {
          if (failure) throw failure;
          return result;
        }
        // Concurrent callers share one prompt; the first retry established the
        // same-session fixed-window grant, so the others need no reusable code.
        const retry = await prepareVerificationRetry(error.config);
        if (!isCurrentSession()) throw new VerificationCancelled();
        return client.request(error.config.url, retry);
      }
      const isAuthInfoRequest =
        baseURL === authApiURL &&
        String(error?.config?.url ?? '').split(/[?#]/, 1)[0] === '/info';
      if (error?.response?.status === 403 && !isAuthInfoRequest) {
        window.dispatchEvent(new Event('auth-permissions-changed'));
      }
      throw error;
    },
  });

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  if (enableErrorMessage) {
    client.addResponseInterceptor(
      errorMessageResponseInterceptor((_msg: string, error) => {
        if (error?.config?.suppressErrorMessage) return;
        if (
          isVerificationFailure(error?.response?.data?.error_code) ||
          [
            'AUTH_EMAIL_BINDING_REQUIRED',
            'AUTH_LOGIN_MFA_REQUIRED',
            'AUTH_PASSWORD_RESET_REQUIRED',
            'AUTH_TOTP_ENROLLMENT_REQUIRED',
          ].includes(error?.response?.data?.error_code)
        )
          return;
        if (
          enableErrorMessage === 'gateway' &&
          !isServiceUnavailableError(error)
        )
          return;
        showRequestErrorToast(error);
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

export { showRequestErrorToast } from './request-feedback';

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

export const authInlineVerificationRequestClient = createRequestClient(
  authApiURL,
  {
    responseReturn: 'body',
    errorMessage: 'gateway',
    verificationChallenge: 'inline',
  },
);

/** Bootstrap requirements with the newly accepted token; never recursively refresh. */
export const authStatusRequestClient = createRequestClient(authApiURL, {
  responseReturn: 'body',
  authentication: 'none',
  verificationChallenge: 'inline',
  errorMessage: 'gateway',
});
