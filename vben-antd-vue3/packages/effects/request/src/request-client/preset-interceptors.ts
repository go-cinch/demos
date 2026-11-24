import type { RequestClient } from './request-client';
import type {
  MakeErrorMessageFn,
  RequestClientConfig,
  ResponseInterceptorConfig,
} from './types';

import { $t } from '@vben/locales';
import { isFunction } from '@vben/utils';

import axios from 'axios';

export const defaultResponseInterceptor = ({
  codeField = 'code',
  dataField = 'data',
  successCode = 0,
}: {
  /** 响应数据中代表访问结果的字段名 */
  codeField: string;
  /** 响应数据中装载实际数据的字段名，或者提供一个函数从响应数据中解析需要返回的数据 */
  dataField: ((response: any) => any) | string;
  /** 当codeField所指定的字段值与successCode相同时，代表接口访问成功。如果提供一个函数，则返回true代表接口访问成功 */
  successCode: ((code: any) => boolean) | number | string;
}): ResponseInterceptorConfig => {
  return {
    fulfilled: (response) => {
      const { config, data: responseData, status } = response;

      if (config.responseReturn === 'raw') {
        return response;
      }

      if (status >= 200 && status < 400) {
        if (config.responseReturn === 'body') {
          return responseData;
        } else if (
          isFunction(successCode)
            ? successCode(responseData[codeField])
            : responseData[codeField] === successCode
        ) {
          return isFunction(dataField)
            ? dataField(responseData)
            : responseData[dataField];
        }
      }
      throw Object.assign({}, response, { response });
    },
  };
};

export const authenticateResponseInterceptor = ({
  client,
  doReAuthenticate,
  doRefreshToken,
  enableRefreshToken,
  formatToken,
  isCurrentRequest = () => true,
}: {
  client: RequestClient;
  doReAuthenticate: (cause: unknown) => Promise<void>;
  doRefreshToken: (unauthorized: unknown) => Promise<string>;
  enableRefreshToken: boolean;
  formatToken: (token: string) => null | string;
  /** A request must retain its original session across refreshes and retries. */
  isCurrentRequest?: (config: RequestClientConfig) => boolean;
}): ResponseInterceptorConfig => {
  let pendingRefresh:
    | undefined
    | {
        isCurrent: () => boolean;
        promise: Promise<string>;
      };
  return {
    rejected: async (error) => {
      const { config, response } = error;
      // 如果不是 401 错误，直接抛出异常
      if (response?.status !== 401) {
        throw error;
      }
      const isCurrent = () => isCurrentRequest(config);
      const assertCurrent = () => {
        if (!isCurrent()) {
          throw new axios.CanceledError(
            'Request belongs to an expired session',
          );
        }
      };
      assertCurrent();
      // 判断是否启用了 refreshToken 功能
      // 如果没有启用或者已经是重试请求了，直接跳转到重新登录
      if (!enableRefreshToken || config.__isRetryRequest) {
        await doReAuthenticate(error);
        throw error;
      }
      // All waiters retry at most once. A new session must not join an old flight.
      config.__isRetryRequest = true;
      if (!pendingRefresh?.isCurrent()) {
        pendingRefresh = {
          isCurrent,
          promise: (async () => {
            try {
              return await doRefreshToken(error);
            } catch (refreshError) {
              // Expired requests must neither sign out the current account nor replay.
              assertCurrent();
              if (
                (refreshError as null | { response?: { status?: number } })
                  ?.response?.status === 401
              ) {
                await doReAuthenticate(refreshError);
              }
              throw refreshError;
            }
          })(),
        };
      }
      const refresh = pendingRefresh;
      try {
        const newToken = await refresh.promise;
        assertCurrent();
        config.headers.Authorization = formatToken(newToken);
        return client.request(config.url, { ...config });
      } finally {
        if (pendingRefresh === refresh) pendingRefresh = undefined;
      }
    },
  };
};

export const errorMessageResponseInterceptor = (
  makeErrorMessage?: MakeErrorMessageFn,
): ResponseInterceptorConfig => {
  return {
    rejected: (error: any) => {
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      const err: string = error?.toString?.() ?? '';
      let errMsg = '';
      if (err?.includes('Network Error')) {
        errMsg = $t('ui.fallback.http.networkError');
      } else if (error?.message?.includes?.('timeout')) {
        errMsg = $t('ui.fallback.http.requestTimeout');
      }
      if (errMsg) {
        makeErrorMessage?.(errMsg, error);
        return Promise.reject(error);
      }

      let errorMessage: string;
      const status = error?.response?.status;

      switch (status) {
        case 400: {
          errorMessage = $t('ui.fallback.http.badRequest');
          break;
        }
        case 401: {
          errorMessage = $t('ui.fallback.http.unauthorized');
          break;
        }
        case 403: {
          errorMessage = $t('ui.fallback.http.forbidden');
          break;
        }
        case 404: {
          errorMessage = $t('ui.fallback.http.notFound');
          break;
        }
        case 408: {
          errorMessage = $t('ui.fallback.http.requestTimeout');
          break;
        }
        default: {
          errorMessage = $t('ui.fallback.http.internalServerError');
        }
      }
      makeErrorMessage?.(errorMessage, error);
      return Promise.reject(error);
    },
  };
};
