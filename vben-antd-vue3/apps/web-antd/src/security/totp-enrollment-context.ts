import { computed, ref } from 'vue';

import { userCache } from '@vben/utils/cache';

type EnrollmentSource = 'email-login' | 'password-login' | 'recovery';
const storageKey = 'totp-enrollment-source';

function readSource(): EnrollmentSource | undefined {
  try {
    const cache = userCache.current('session');
    cache.migrate(storageKey, cache.key('cinch-totp-enrollment-source'));
    const value = cache.getItem(storageKey);
    if (
      value === 'password-login' ||
      value === 'email-login' ||
      value === 'recovery'
    )
      return value;
  } catch {
    /* Presentation still works when session storage is unavailable. */
  }
}

// Presentation only: never changes enrollment grants or password requirements.
// Store no credentials; keep the entry method across a reload in this tab.
const source = ref(readSource());
userCache.onChange(() => {
  source.value = readSource();
});
export const enrollmentFromPasswordLogin = computed(
  () => source.value === 'password-login',
);

export function setTOTPEnrollmentSource(value?: EnrollmentSource) {
  source.value = value;
  try {
    if (value) userCache.current('session').setItem(storageKey, value);
    else userCache.current('session').removeItem(storageKey);
  } catch {
    /* The in-memory value remains available for this navigation. */
  }
}
