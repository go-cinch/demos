import type { TOTPEnrollment, TOTPSetup } from '#/api/core/auth';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  beginTOTPEnrollmentApi,
  confirmTOTPEnrollmentApi,
  getTOTPStatusApi,
} from '#/api/core/auth';
import { useAuthStore } from '#/store';

import { enrollmentFromPasswordLogin } from './totp-enrollment-context';
import {
  isVerificationCodeError,
  isVerificationPasswordError,
  useVerificationError,
} from './verification-error';
import { VerificationCancelled } from './verification-prompt';

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
export function useTOTPEnrollment(
  props: { mandatory?: boolean; completing?: boolean },
  onSetupFailure: (cause: unknown) => void,
) {
  const auth = useAuthStore();
  const phase = ref<EnrollmentPhase>(
    props.mandatory ? 'initializing' : 'password',
  );
  const directEnrollment = ref(false);
  const passwordStepRequired = ref(false);
  // Keep completed steps stable while the final acknowledgment navigates away.
  const passwordLoginCompleted = enrollmentFromPasswordLogin.value;
  const showPasswordStep = computed(
    () => passwordStepRequired.value || passwordLoginCompleted,
  );
  const setupExpired = ref(false);
  const password = ref('');
  const code = ref('');
  const codeFailures = ref(0);
  const setup = ref<TOTPSetup>();
  const result = ref<TOTPEnrollment>();
  const fieldError = useVerificationError();
  const setupFailed = ref(false);
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
  const stage = computed(() => {
    if (result.value) {
      return 'recovery';
    }
    if (needsPassword.value) {
      return 'password';
    }
    return 'scan';
  });
  let active = true;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function clearFieldFeedback() {
    codeFailures.value = 0;
    fieldError.clear();
  }
  watch([code, password], clearFieldFeedback);
  onBeforeUnmount(() => {
    active = false;
    clearTimeout(expiryTimer);
  });
  onMounted(() => {
    if (props.mandatory) void initialize();
  });

  async function initialize() {
    phase.value = 'initializing';
    setupFailed.value = false;
    const isCurrentSession = auth.captureSession();
    try {
      const status = await getTOTPStatusApi();
      if (!active || !isCurrentSession()) return;
      if (status.totp_skip_allowed !== undefined) {
        auth.totpSkipAllowed = status.totp_skip_allowed === true;
      }
      passwordStepRequired.value = status.password_required;
      directEnrollment.value = !status.password_required;
      phase.value = 'password';
      if (directEnrollment.value) await loadSetup();
    } catch (error) {
      if (!active || !isCurrentSession()) return;
      auth.totpSkipAllowed = false;
      phase.value = 'initialization-error';
      setupFailed.value = true;
      onSetupFailure(error);
    }
  }

  async function loadSetup() {
    if (busy.value) return;
    const isCurrentSession = auth.captureSession();
    phase.value = 'loading';
    setupFailed.value = false;
    clearFieldFeedback();
    clearTimeout(expiryTimer);
    try {
      const pending = await beginTOTPEnrollmentApi(
        directEnrollment.value ? undefined : password.value,
        () => active && isCurrentSession(),
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
    } catch (error) {
      if (!active || !isCurrentSession()) return;
      setupExpired.value = Boolean(setup.value);
      const setupPhase = setup.value ? 'reauthenticate' : 'password';
      phase.value = directEnrollment.value ? 'scan' : setupPhase;
      if (!directEnrollment.value && isVerificationPasswordError(error))
        fieldError.setCause(error);
      else if (!(error instanceof VerificationCancelled)) {
        setupFailed.value = true;
        onSetupFailure(error);
      }
    }
  }

  async function refreshSetup() {
    if (operationBusy.value) return;
    clearTimeout(expiryTimer);
    setupExpired.value = true;
    code.value = '';
    clearFieldFeedback();
    if (directEnrollment.value) await loadSetup();
    else phase.value = 'reauthenticate';
  }

  async function submit() {
    if (operationBusy.value || initializationFailed.value) return;
    fieldError.clear();
    if (needsPassword.value || !setup.value) {
      if (!directEnrollment.value && !password.value.trim()) {
        fieldError.setKey('verification.required');
        return;
      }
      await loadSetup();
      return;
    }
    if (setupExpired.value) return;
    if (!/^\d{6}$/.test(code.value.trim())) {
      codeFailures.value++;
      return;
    }
    codeFailures.value = 0;
    const isCurrentSession = auth.captureSession();
    phase.value = 'confirming';
    try {
      const confirmed = await confirmTOTPEnrollmentApi(code.value.trim());
      if (!active || !isCurrentSession()) return;
      result.value = confirmed;
      try {
        await auth.acceptSession(confirmed);
      } finally {
        // Binding already committed. Always preserve one-time recovery codes;
        // a status outage must never invite a second confirmation attempt.
        clearTimeout(expiryTimer);
        setupExpired.value = false;
        code.value = '';
        setup.value = undefined;
        phase.value = 'recovery';
      }
    } catch (error) {
      if (!active) return;
      if (result.value) {
        fieldError.setCause(error);
        return;
      }
      if (!isCurrentSession()) return;
      phase.value = 'scan';
      if (error instanceof VerificationCancelled) return;
      if (isVerificationCodeError(error)) {
        codeFailures.value++;
      } else {
        fieldError.setCause(error);
      }
    }
  }

  return {
    busy,
    code,
    codeFailures,
    error: fieldError.message,
    initializationFailed,
    initialize,
    loadingSetup,
    needsPassword,
    operationBusy,
    password,
    showPasswordStep,
    refreshSetup,
    result,
    setup,
    setupFailed,
    setupExpired,
    setupLoading,
    showSetup,
    stage,
    submit,
  };
}
