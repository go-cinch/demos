import type { EmailCodeStatus } from '#/api/core/auth';

import { computed, onBeforeUnmount, ref } from 'vue';

import { userCache } from '@vben/utils/cache';

const browserKey = 'email-browser-uuid';
const legacyBrowserKey = 'cinch-email-browser-uuid';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** This durable identifier is a rate-limit dimension, never an authentication proof. */
export function emailBrowserUUID() {
  const cache = userCache.device();
  const validUUID = (raw: string) => uuidPattern.test(raw);
  cache.migrate(browserKey, cache.key(legacyBrowserKey), validUUID);
  cache.migrate(browserKey, legacyBrowserKey, validUUID);
  const stored = cache.getItem(browserKey);
  if (stored && uuidPattern.test(stored)) return stored;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0b0000_1111) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0b0011_1111) | 0x80;
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  cache.setItem(browserKey, value);
  return value;
}

export function useEmailCode() {
  const state = ref<EmailCodeStatus>();
  const elapsed = ref(0);
  let synchronizedAt = performance.now();
  const timer = setInterval(() => {
    elapsed.value = performance.now() - synchronizedAt;
  }, 250);
  onBeforeUnmount(() => clearInterval(timer));
  const remaining = computed(() =>
    state.value
      ? Math.max(
          0,
          Math.ceil(
            (state.value.retry_at - state.value.server_time - elapsed.value) /
              1000,
          ),
        )
      : 0,
  );
  const expired = computed(
    () =>
      !state.value?.expired_at ||
      state.value.expired_at <= state.value.server_time + elapsed.value,
  );
  function accept(value: EmailCodeStatus) {
    if (!Number.isFinite(value.server_time) || !Number.isFinite(value.retry_at))
      return;
    state.value = value;
    synchronizedAt = performance.now();
    elapsed.value = 0;
  }
  function clearVerification() {
    // Changing the address invalidates its code. The browser/IP resend budget still applies.
    if (state.value)
      state.value = {
        server_time: state.value.server_time,
        retry_at: state.value.retry_at,
      };
  }
  function reset() {
    state.value = undefined;
    elapsed.value = 0;
  }
  function acceptError(cause: unknown) {
    const data = (cause as { response?: { data?: EmailCodeStatus } })?.response
      ?.data;
    if (data) accept(data);
    return (
      (data as (EmailCodeStatus & { error_code?: string }) | undefined)
        ?.error_code === 'AUTH_EMAIL_COOLDOWN' &&
      Number.isFinite(data?.server_time) &&
      Number.isFinite(data?.retry_at)
    );
  }
  return {
    state,
    remaining,
    expired,
    accept,
    acceptError,
    clearVerification,
    reset,
  };
}
