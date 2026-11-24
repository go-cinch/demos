import { message } from 'ant-design-vue';

import { $t } from '#/locales';
import { VerificationCancelled } from '#/security/verification-prompt';

import { requestErrorMessage } from './request-error';

// Share the window across clients so concurrent page requests produce one toast.
const recentErrorMessages = new Map<string, number>();
const reportedRequestErrors = new WeakSet<object>();
const errorMessageWindowMs = 500;

/** Multiple handlers can receive the same rejection after a verification or session retry. */
export function markRequestErrorReported(error: unknown) {
  if (
    error instanceof VerificationCancelled ||
    (error as { code?: string })?.code === 'ERR_CANCELED'
  )
    return false;
  if (error && typeof error === 'object') {
    if (reportedRequestErrors.has(error)) return false;
    reportedRequestErrors.add(error);
  }
  return true;
}

export function reportExpiredSession(error: unknown, notify: boolean) {
  markRequestErrorReported(error);
  if (notify) {
    message.info({
      key: 'session-expired',
      content: $t('verification.loginExpired'),
      duration: 3,
    });
  }
}

export function showRequestErrorToast(error: unknown) {
  if (!markRequestErrorReported(error)) return;
  const content = requestErrorMessage(error);
  const now = performance.now();
  for (const [text, shownAt] of recentErrorMessages) {
    if (now - shownAt >= errorMessageWindowMs) recentErrorMessages.delete(text);
  }
  if (recentErrorMessages.has(content)) return;
  recentErrorMessages.set(content, now);
  message.error(content);
}
