<script setup lang="ts">
import type { TOTPBinding } from '#/api/core/auth';

import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';

import { Alert, Button, Skeleton, Tag } from 'ant-design-vue';

import { getTOTPBindingApi } from '#/api/core/auth';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import AccountRecovery from '#/security/totp-account-recovery.vue';
import TOTPEnrollment from '#/security/totp-enrollment.vue';
import { useVerificationError } from '#/security/verification-error';
import {
  requestVerification,
  VerificationCancelled,
} from '#/security/verification-prompt';
import { useVerificationTip } from '#/security/verification-tip';
import { useAuthStore } from '#/store';

import SecuritySection from './security-section.vue';
const props = defineProps<{ recoveryRequested?: boolean }>();
const emit = defineEmits<{ recoveryOpened: [] }>();
const recoveryButton = ref<{ $el: HTMLButtonElement }>();
const recoveryCue = ref(false);
const status = ref<TOTPBinding>();
const loading = ref(false);
const recovering = ref(false);
const testing = ref(false);
const enrolling = ref(false);
const completionBusy = ref(false);
const enrollmentOpen = ref(false);
const enrollmentStarted = ref(false);
const enrollmentStage = ref('password');
const savingRecovery = computed(
  () => enrollmentStarted.value && enrollmentStage.value === 'recovery',
);
function updateEnrollmentStage(stage: 'password' | 'recovery' | 'scan') {
  enrollmentStage.value = stage;
  // Confirmation has already committed; acknowledgment only closes the recovery view.
  if (stage === 'recovery') status.value = { bound: true };
}
const auth = useAuthStore();
const { hasProfileAction } = usePermissions();
const { showFailure, TipHolder } = useVerificationTip();
watch(enrollmentOpen, (value) => {
  if (value) enrollmentStarted.value = true;
});
async function finishEnrollment() {
  if (completionBusy.value) return;
  completionBusy.value = true;
  try {
    await auth.fetchUserInfo({ fresh: true, suppressErrorMessage: true });
    enrollmentOpen.value = false;
    enrollmentStarted.value = false;
    await load();
  } catch (error) {
    // Keep the one-time recovery codes visible if refreshing the profile fails.
    if (active.value) showFailure(error);
  } finally {
    completionBusy.value = false;
  }
}
function cancelEnrollment() {
  enrollmentOpen.value = false;
  enrollmentStarted.value = false;
}

const failure = useVerificationError('verification.failed');
const error = failure.message;

const active = ref(true);
let cueTimer: ReturnType<typeof setTimeout> | undefined;
let cueFrame: number | undefined;
let cueVersion = 0;
function clearRecoveryCue() {
  cueVersion++;
  clearTimeout(cueTimer);
  if (cueFrame !== undefined) cancelAnimationFrame(cueFrame);
  recoveryCue.value = false;
}
function openRecovery() {
  clearRecoveryCue();
  recovering.value = true;
}
watch(
  [
    () => props.recoveryRequested,
    loading,
    () => status.value?.bound,
    error,
    active,
  ],
  async ([requested, pending, bound, failed, visible]) => {
    if (
      !hasProfileAction('recover_totp') ||
      !visible ||
      !requested ||
      pending ||
      failed ||
      !bound ||
      recovering.value ||
      recoveryCue.value
    )
      return;
    recoveryCue.value = true;
    const version = ++cueVersion;
    emit('recoveryOpened');
    await nextTick();
    if (!active.value || version !== cueVersion) return;
    // Locate the actual action before the modal locks the page's scrolling.
    cueFrame = requestAnimationFrame(() => {
      if (!active.value || version !== cueVersion) return;
      recoveryButton.value?.$el?.scrollIntoView?.({
        block: 'center',
        behavior: 'instant',
      });
      recoveryButton.value?.$el?.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      cueTimer = setTimeout(
        () => {
          if (active.value && version === cueVersion) openRecovery();
        },
        reducedMotion ? 0 : 900,
      );
    });
  },
  { flush: 'post' },
);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
  clearRecoveryCue();
  recovering.value = false;
  cancelEnrollment();
});
onBeforeUnmount(() => {
  active.value = false;
  clearRecoveryCue();
});
async function load() {
  if (loading.value) return;
  loading.value = true;
  failure.clear();
  try {
    status.value = await getTOTPBindingApi();
  } catch {
    status.value = undefined;
    failure.setKey('app.errors.dataLoad');
  } finally {
    loading.value = false;
  }
}
async function test() {
  if (testing.value) return;
  testing.value = true;
  try {
    await requestVerification('test');
  } catch (error) {
    if (active.value && !(error instanceof VerificationCancelled))
      failure.setKey();
  } finally {
    testing.value = false;
  }
}
onMounted(load);
</script>
<template>
  <TipHolder />
  <SecuritySection
    v-model:open="enrollmentOpen"
    icon="lucide:shield-check"
    :title="$t('verification.title')"
    :action="
      !loading &&
      !error &&
      status &&
      !status.bound &&
      hasProfileAction('enroll_totp')
        ? $t('verification.beginBinding')
        : undefined
    "
    :busy="enrolling || enrollmentStage === 'recovery'"
    class="totp-card"
  >
    <template #status
      ><Tag
        v-if="status && !loading && !error"
        :color="status.bound ? 'green' : 'orange'"
        >{{
          $t(status.bound ? 'verification.enabled' : 'verification.disabled')
        }}</Tag
      ></template
    >
    <template #summary>
      <Skeleton v-if="loading" active :title="false" :paragraph="{ rows: 1 }" />
      <Alert v-else-if="error" :message="error" type="error" show-icon
        ><template #action
          ><Button @click="load">{{
            $t('verification.retry')
          }}</Button></template
        ></Alert
      >
      <p v-else-if="status?.bound && !savingRecovery">
        {{ $t('verification.enabledHelp') }}
      </p>
    </template>
    <template
      v-if="status?.bound && !error && !loading && !savingRecovery"
      #actions
    >
      <div class="totp-card-actions">
        <Button
          v-if="hasProfileAction('test_totp')"
          data-testid="totp-test"
          :loading="testing"
          :disabled="recovering || recoveryCue"
          @click="test"
          >{{ $t('verification.test') }}</Button
        >
        <Button
          v-if="hasProfileAction('recover_totp')"
          ref="recoveryButton"
          data-testid="totp-restart-recovery"
          :class="{ 'totp-recovery-cue': recoveryCue }"
          :disabled="testing"
          @click="openRecovery"
          >{{ $t('verification.authenticatorUnavailable') }}</Button
        >
      </div>
    </template>
    <TOTPEnrollment
      v-if="enrollmentStarted && active && hasProfileAction('enroll_totp')"
      inline
      :completing="completionBusy"
      @busy="enrolling = $event"
      @stage="updateEnrollmentStage"
      @complete="finishEnrollment"
      @cancel="cancelEnrollment"
    />
  </SecuritySection>
  <AccountRecovery
    v-if="recovering && hasProfileAction('recover_totp')"
    :allow-email="hasProfileAction('recover_totp_by_email')"
    @close="recovering = false"
  />
</template>

<style scoped>
.totp-recovery-cue {
  position: relative;
  color: hsl(var(--primary));
  border-color: hsl(var(--primary));
  animation: totp-recovery-cue 450ms ease-out 2;
}

@keyframes totp-recovery-cue {
  0%,
  100% {
    box-shadow: 0 0 0 0 hsl(var(--primary) / 0%);
    transform: scale(1);
  }

  35% {
    box-shadow: 0 0 0 5px hsl(var(--primary) / 18%);
    transform: scale(1.025);
  }

  70% {
    box-shadow: 0 0 0 9px hsl(var(--primary) / 0%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .totp-recovery-cue {
    animation: none;
  }
}

.totp-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
</style>
