import type { MFAEnrollment, MFASetup } from '#/api/core/auth';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  beginMFAEnrollmentApi,
  confirmMFAEnrollmentApi,
  getMFAStatusApi,
} from '#/api/core/auth';
import { useAuthStore } from '#/store';

import { isMFAPasswordError, useMFAError } from './mfa-error';

type EnrollmentPhase =
  | 'confirming'
  | 'initialization-error'
  | 'initializing'
  | 'loading'
  | 'password'
  | 'reauthenticate'
  | 'recovery'
  | 'scan';

/** Owns the enrollment lifecycle; presentation and copying stay in the component. */
export function useMFAEnrollment(props: {
  mandatory?: boolean;
  completing?: boolean;
}) {
  const auth = useAuthStore();
  const phase = ref<EnrollmentPhase>(
    props.mandatory ? 'initializing' : 'password',
  );
  const directEnrollment = ref(false);
  const setupExpired = ref(false);
  const password = ref('');
  const code = ref('');
  const setup = ref<MFASetup>();
  const result = ref<MFAEnrollment>();
  const fieldError = useMFAError();
  const setupFailure = useMFAError();
  const initializing = computed(() => phase.value === 'initializing');
  const initializationFailed = computed(
    () => phase.value === 'initialization-error',
  );
  const setupLoading = computed(() => phase.value === 'loading');
  const loadingSetup = computed(() => initializing.value || setupLoading.value);
  const busy = computed(
    () => setupLoading.value || phase.value === 'confirming',
  );
  const showSetup = computed(
    () =>
      Boolean(setup.value) ||
      loadingSetup.value ||
      directEnrollment.value ||
      initializationFailed.value,
  );
  const needsPassword = computed(
    () => phase.value === 'password' || phase.value === 'reauthenticate',
  );
  const operationBusy = computed(
    () => busy.value || loadingSetup.value || Boolean(props.completing),
  );
  const stage = computed(() =>
    result.value ? 'recovery' : needsPassword.value ? 'password' : 'scan',
  );
  let active = true;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  watch([code, password], fieldError.clear);
  onBeforeUnmount(() => {
    active = false;
    clearTimeout(expiryTimer);
  });
  onMounted(() => {
    if (props.mandatory) void initialize();
  });

  async function initialize() {
    phase.value = 'initializing';
    setupFailure.clear();
    const isCurrentSession = auth.captureSession();
    try {
      const status = await getMFAStatusApi();
      if (!active || !isCurrentSession()) return;
      directEnrollment.value = !status.password_required;
      phase.value = 'password';
      if (directEnrollment.value) await loadSetup();
    } catch (cause) {
      if (!active || !isCurrentSession()) return;
      phase.value = 'initialization-error';
      setupFailure.setCause(cause);
    }
  }

  async function loadSetup() {
    if (busy.value) return;
    const isCurrentSession = auth.captureSession();
    phase.value = 'loading';
    setupFailure.clear();
    fieldError.clear();
    clearTimeout(expiryTimer);
    try {
      const pending = await beginMFAEnrollmentApi(
        directEnrollment.value ? undefined : password.value,
      );
      password.value = '';
      if (!active || !isCurrentSession()) return;
      setup.value = pending;
      setupExpired.value = false;
      code.value = '';
      phase.value = 'scan';
      if (Number.isFinite(pending.expired_at)) {
        expiryTimer = setTimeout(
          () => {
            setupExpired.value = true;
          },
          Math.max(0, pending.expired_at - Date.now()),
        );
      }
    } catch (cause) {
      if (!active || !isCurrentSession()) return;
      setupExpired.value = Boolean(setup.value);
      phase.value = directEnrollment.value
        ? 'scan'
        : setup.value
          ? 'reauthenticate'
          : 'password';
      if (!directEnrollment.value && isMFAPasswordError(cause))
        fieldError.setCause(cause);
      else setupFailure.setCause(cause);
    }
  }

  async function refreshSetup() {
    if (operationBusy.value) return;
    clearTimeout(expiryTimer);
    setupExpired.value = true;
    code.value = '';
    fieldError.clear();
    if (directEnrollment.value) await loadSetup();
    else phase.value = 'reauthenticate';
  }

  async function submit() {
    if (operationBusy.value || initializationFailed.value) return;
    fieldError.clear();
    if (needsPassword.value || !setup.value) {
      if (!directEnrollment.value && !password.value.trim()) {
        fieldError.setKey('mfa.required');
        return;
      }
      await loadSetup();
      return;
    }
    if (setupExpired.value) return;
    if (!/^\d{6}$/.test(code.value.trim())) {
      fieldError.setKey('mfa.codeRequired');
      return;
    }
    const isCurrentSession = auth.captureSession();
    phase.value = 'confirming';
    try {
      const confirmed = await confirmMFAEnrollmentApi(code.value.trim());
      if (!active || !isCurrentSession()) return;
      result.value = confirmed;
      auth.acceptSession(confirmed);
      clearTimeout(expiryTimer);
      setupExpired.value = false;
      code.value = '';
      setup.value = undefined;
      phase.value = 'recovery';
    } catch (cause) {
      if (!active || !isCurrentSession()) return;
      phase.value = 'scan';
      fieldError.setCause(cause);
    }
  }

  return {
    busy,
    code,
    error: fieldError.message,
    initializationFailed,
    initialize,
    loadingSetup,
    needsPassword,
    operationBusy,
    password,
    phase,
    refreshSetup,
    result,
    setup,
    setupError: setupFailure.message,
    setupExpired,
    setupLoading,
    showSetup,
    stage,
    submit,
  };
}
