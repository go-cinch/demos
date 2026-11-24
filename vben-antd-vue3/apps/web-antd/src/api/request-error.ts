import { $t } from '#/locales';

type RequestFailure = {
  code?: string;
  message?: string;
  request?: unknown;
  response?: {
    data?: unknown;
    status?: number;
  };
};

function failure(error: unknown): RequestFailure | undefined {
  return error && typeof error === 'object'
    ? (error as RequestFailure)
    : undefined;
}

export function isUnauthorizedError(error: unknown) {
  return failure(error)?.response?.status === 401;
}

export function isForbiddenError(error: unknown) {
  return failure(error)?.response?.status === 403;
}

export function isServiceUnavailableError(error: unknown) {
  const status = failure(error)?.response?.status;
  return status === 502 || status === 503 || status === 504;
}

export function isTransportFailure(error: unknown) {
  const status = failure(error)?.response?.status;
  return !status || status === 408 || status >= 500;
}

const statusMessages: Partial<Record<number, string>> = {
  400: 'ui.fallback.http.badRequest',
  401: 'ui.fallback.http.unauthorized',
  403: 'ui.fallback.http.forbidden',
  404: 'ui.fallback.http.notFound',
  405: 'app.errors.methodNotAllowed',
  408: 'ui.fallback.http.requestTimeout',
  409: 'app.errors.conflict',
  422: 'ui.fallback.http.badRequest',
  429: 'app.errors.tooManyRequests',
};

export function responseMessage(error: unknown) {
  const data = failure(error)?.response?.data;
  const msg =
    data && typeof data === 'object' && 'msg' in data ? data.msg : undefined;
  if (typeof msg !== 'string') return;
  const text = msg.trim();
  // Proxies and debug handlers can wrap HTML or a stack trace in JSON.
  if (
    /^<(?:!doctype\s+html|html\b|head\b|body\b|title\b|h1\b|pre\b|script\b|div\b)/i.test(
      text,
    ) ||
    /(?:^Traceback \(most recent call last\)|^goroutine \d+ \[|\n\s*at .+:[0-9]+|\n\s*[^\n]+\.go:\d+|\n\s*File "[^"]+", line \d+)/m.test(
      text,
    )
  )
    return;
  return text || undefined;
}

export function requestFailureKey(error: unknown) {
  const request = failure(error);
  if (request?.response) {
    const status = request.response.status;
    if (isServiceUnavailableError(error)) return 'app.errors.serverLost';
    if (status)
      return (
        statusMessages[status] ??
        (status >= 500 ? 'ui.fallback.http.internalServerError' : undefined)
      );
    return;
  }
  if (
    request?.code === 'ETIMEDOUT' ||
    request?.code === 'ECONNABORTED' ||
    /\b(?:timeout|timed out)\b/i.test(request?.message ?? '')
  )
    return 'ui.fallback.http.requestTimeout';
  if (
    request?.code === 'ERR_NETWORK' ||
    request?.request ||
    /^(?:Network Error|Failed to fetch|Load failed|offline)$/i.test(
      request?.message ?? '',
    )
  )
    return 'ui.fallback.http.networkError';
}

export function requestErrorMessage(error: unknown, fallback?: string) {
  const message = responseMessage(error);
  if (message) return message;
  const key = requestFailureKey(error);
  return key ? $t(key) : fallback || $t('email-auth.requestFailed');
}

/** Download endpoints return the same public JSON errors as other requests.
 * Decode them before authentication and field handlers inspect error_code. */
export async function rejectResponseError(error: unknown): Promise<never> {
  const request = failure(error);
  const response = request?.response;
  if (response?.data instanceof Blob) {
    try {
      const data: unknown = JSON.parse(await response.data.text());
      if (data && typeof data === 'object') response.data = data;
    } catch {
      // Retain the HTTP status when a proxy returned a plain-text or HTML body.
    }
  }
  if (request && isServiceUnavailableError(error))
    request.message = requestErrorMessage(error);
  throw error;
}

/** A gateway outage is already reported by the request client's shared toast.
 * Keep it truthy so unavailable data cannot enable actions or look successful. */
export type LoadFailure = 'gateway' | boolean;

export function loadFailure(error: unknown): LoadFailure {
  return isServiceUnavailableError(error) ? 'gateway' : true;
}
