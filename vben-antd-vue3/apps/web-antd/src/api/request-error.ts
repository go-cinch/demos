import { $t } from '#/locales';

type RequestFailure = {
  message?: string;
  response?: { data?: { error?: unknown; message?: unknown; msg?: unknown }; status?: number };
};

function failure(error: unknown): RequestFailure | undefined {
  return error && typeof error === 'object' ? error as RequestFailure : undefined;
}

export function isBadGatewayError(error: unknown) {
  return failure(error)?.response?.status === 502;
}

/** Keep the original error/response for business handling while normalizing inline feedback. */
export function normalizeGatewayError<T>(error: T): T {
  if (isBadGatewayError(error)) failure(error)!.message = $t('app.errors.serverLost');
  return error;
}

export function requestErrorMessage(error: unknown, fallback: string) {
  if (isBadGatewayError(error)) return $t('app.errors.serverLost');
  const data = failure(error)?.response?.data;
  const message = [data?.msg, data?.message, data?.error].find(
    (value): value is string => typeof value === 'string' && Boolean(value.trim()),
  );
  return message || fallback || $t('app.errors.failed');
}
