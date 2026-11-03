import { computed, shallowRef } from 'vue';

import { i18n } from '@vben/locales';

import { $t } from '#/locales';

const errorKeys: Record<string, string> = {
  AUTH_INCORRECT_PASSWORD: 'mfa.errors.password',
  AUTH_INVALID_CREDENTIAL: 'mfa.errors.credential',
  AUTH_MFA_ALREADY_ENABLED: 'mfa.errors.alreadyEnabled',
  AUTH_MFA_ENROLLMENT_REQUIRED: 'mfa.errors.enrollmentRequired',
  AUTH_MFA_INVALID: 'mfa.errors.invalidCode',
  AUTH_MFA_RATE_LIMITED: 'mfa.errors.rateLimited',
  AUTH_MFA_UNAVAILABLE: 'mfa.errors.unavailable',
  AUTH_MFA_USER_NOT_FOUND: 'mfa.errors.userNotFound',
  AUTH_STEP_UP_REQUIRED: 'mfa.errors.invalidCode',
};

export function mfaErrorData(cause: unknown) {
  return (
    cause as { response?: { data?: { error_code?: string; msg?: string } } }
  )?.response?.data;
}

export function isMFAPasswordError(cause: unknown) {
  return ['AUTH_INCORRECT_PASSWORD', 'AUTH_INVALID_CREDENTIAL'].includes(
    mfaErrorData(cause)?.error_code ?? '',
  );
}

/** Retain translation keys so visible validation follows the selected language. */
export function useMFAError(fallback = 'mfa.failed') {
  const state = shallowRef<{ key: string } | { locale: string; message: string }>();
  const message = computed(() =>
    !state.value
      ? ''
      : 'key' in state.value
        ? $t(state.value.key)
        : state.value.locale === String(i18n.global.locale.value)
          ? state.value.message
          : $t(fallback),
  );
  const clear = () => {
    state.value = undefined;
  };
  const setKey = (key = fallback) => {
    state.value = { key };
  };
  function setCause(cause: unknown) {
    const data = mfaErrorData(cause);
    const key = data?.error_code && errorKeys[data.error_code];
    state.value = key
      ? { key }
      : data?.msg
        ? { locale: String(i18n.global.locale.value), message: data.msg }
        : { key: fallback };
  }
  return { message, clear, setKey, setCause };
}
