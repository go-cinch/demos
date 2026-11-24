import type { VerificationRetryOptions } from './request-types';

/** Reissue one-time credentials after a potentially long human verification interaction. */
export async function prepareVerificationRetry<
  T extends VerificationRetryOptions & { data?: unknown },
>(config: T) {
  if (!config.verificationRetryCredential)
    return { ...config, _verificationRetried: true };
  const body =
    typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  const credential = await config.verificationRetryCredential();
  return {
    ...config,
    data: { ...body, ...credential },
    _verificationRetried: true,
  };
}
