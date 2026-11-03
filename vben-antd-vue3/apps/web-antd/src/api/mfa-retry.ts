import type { MFARetryOptions } from './request-types';

/** Reissue one-time credentials after a potentially long human MFA interaction. */
export async function prepareMFARetry<
  T extends MFARetryOptions & { data?: unknown },
>(config: T) {
  if (!config.mfaRetryCredential) return { ...config, _mfaRetried: true };
  const body =
    typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  const credential = await config.mfaRetryCredential();
  return { ...config, data: { ...body, ...credential }, _mfaRetried: true };
}
