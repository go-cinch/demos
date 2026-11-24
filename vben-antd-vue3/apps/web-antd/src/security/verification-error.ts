import { computed, shallowRef } from 'vue';

import { i18n } from '@vben/locales';

import { requestFailureKey, responseMessage } from '#/api/request-error';
import { $t } from '#/locales';

const errorKeys: Record<string, string> = {
  AUTH_INCORRECT_PASSWORD: 'verification.errors.password',
  AUTH_INVALID_CREDENTIAL: 'verification.errors.credential',
  AUTH_TOTP_ALREADY_BOUND: 'verification.errors.alreadyEnabled',
  AUTH_TOTP_ENROLLMENT_REQUIRED: 'verification.errors.enrollmentRequired',
  AUTH_VERIFICATION_INVALID: 'verification.errors.invalidCode',
  AUTH_VERIFICATION_RATE_LIMITED: 'verification.errors.rateLimited',
  AUTH_VERIFICATION_UNAVAILABLE: 'verification.errors.unavailable',
  AUTH_TOTP_USER_NOT_FOUND: 'verification.errors.userNotFound',
  AUTH_STEP_UP_REQUIRED: 'verification.errors.invalidCode',
};

export function verificationErrorData(cause: unknown) {
  return (
    cause as { response?: { data?: { error_code?: string; msg?: string } } }
  )?.response?.data;
}

export function isVerificationCodeError(cause: unknown) {
  return ['AUTH_STEP_UP_REQUIRED', 'AUTH_VERIFICATION_INVALID'].includes(
    verificationErrorData(cause)?.error_code ?? '',
  );
}

export function isVerificationPasswordError(cause: unknown) {
  return ['AUTH_INCORRECT_PASSWORD', 'AUTH_INVALID_CREDENTIAL'].includes(
    verificationErrorData(cause)?.error_code ?? '',
  );
}

/** Retain translation keys so visible validation follows the selected language. */
export function useVerificationError(fallback = 'verification.failed') {
  const state = shallowRef<
    { key: string } | { locale: string; message: string }
  >();
  const message = computed(() => {
    if (state.value) {
      if ('key' in state.value) {
        return $t(state.value.key);
      }
      if (state.value.locale === String(i18n.global.locale.value)) {
        return state.value.message;
      }
      return $t(fallback);
    }
    return '';
  });
  const clear = () => {
    state.value = undefined;
  };
  const setKey = (key = fallback) => {
    state.value = { key };
  };
  function setCause(cause: unknown) {
    const data = verificationErrorData(cause);
    const key = data?.error_code && errorKeys[data.error_code];
    if (key) {
      state.value = { key };
      return;
    }
    const message = responseMessage(cause);
    state.value = message
      ? { locale: String(i18n.global.locale.value), message }
      : { key: requestFailureKey(cause) ?? fallback };
  }
  return { message, clear, setKey, setCause };
}
