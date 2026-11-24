<script setup lang="ts">
import type { EmailUnlinkStatus } from '#/api/core/auth';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { Info, LockKeyhole, Mail, ShieldCheck, Unlink2 } from '@vben/icons';

import { Alert, Button, Input, message, Modal, Skeleton } from 'ant-design-vue';

import {
  getEmailUnlinkProgressApi,
  getEmailUnlinkStatusApi,
  requestEmailUnlinkApi,
  verifyEmailUnlinkApi,
} from '#/api/core/auth';
import { requestErrorMessage } from '#/api/request-error';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import { emailBrowserUUID, useEmailCode } from '#/security/email-code';
import SecurityMethodCard from '#/security/security-method-card.vue';
import VerificationCodeInput from '#/security/verification-code-input.vue';
import { useVerificationTip } from '#/security/verification-tip';
import { useAuthStore } from '#/store';

defineProps<{ masked: string }>();
const auth = useAuthStore();
const clock = useEmailCode();
const { hasProfileAction } = usePermissions();
const { showFailure, TipHolder } = useVerificationTip();
const state = ref<EmailUnlinkStatus>();
const canSendLink = computed(() => hasProfileAction('unlink_by_email'));
const canUseFallback = computed(() =>
  hasProfileAction(
    state.value?.fallback === 'password'
      ? 'unlink_by_password'
      : 'unlink_by_factor',
  ),
);
const open = ref(false);
const step = ref<'email' | 'identity' | 'method'>('method');
const emailHeading = ref<HTMLElement>();
const loading = ref(false);
const busy = ref(false);
const proof = ref('');
const failure = ref<unknown>();
const fieldError = ref('');
const codeFailures = ref(0);
watch(proof, () => {
  codeFailures.value = 0;
});
watch([canSendLink, canUseFallback], ([mail, fallback]) => {
  if (
    open.value &&
    ((step.value === 'email' && !mail) ||
      (step.value === 'identity' && !fallback))
  )
    close();
});
const showingProof = computed(
  () =>
    !loading.value &&
    step.value === 'identity' &&
    (state.value?.fallback === 'totp' || state.value?.fallback === 'password'),
);
const justUnlinked = ref(false);
const statusError = computed(() =>
  failure.value
    ? requestErrorMessage(failure.value, $t('email-auth.requestFailed'))
    : '',
);
const pending = computed(
  () => !!clock.state.value?.verification_id && !clock.expired.value,
);
const passwordInput = ref<{ focus: () => void }>();
const codeInput = ref<{ focus: () => void }>();
let alive = true;
let sequence = 0;
let progressFailed = false;
let poll: ReturnType<typeof setInterval>;
function captureOperation() {
  const sameSession = auth.captureSession();
  return () => alive && sameSession();
}

async function refreshProfile() {
  // Refreshing an unlinked address unmounts this row before the route handoff.
  const sameSession = auth.captureSession();
  const info = await auth.fetchUserInfo({ fresh: true });
  if (sameSession() && info.emailBindingRequired)
    await auth.requireEmailBinding();
}
async function load(progressOnly = false) {
  const current = captureOperation();
  const request = ++sequence;
  loading.value = true;
  try {
    const result =
      progressOnly && state.value
        ? {
            ...state.value,
            ...(await getEmailUnlinkProgressApi(emailBrowserUUID())),
          }
        : await getEmailUnlinkStatusApi(emailBrowserUUID());
    if (!current() || sequence !== request) return;
    state.value = result;
    clock.accept(result);
    progressFailed = false;
    failure.value = undefined;
    if (!result.bound) {
      justUnlinked.value = true;
      open.value = false;
      await refreshProfile();
    }
  } catch (error) {
    if (!current() || sequence !== request) return;
    if (justUnlinked.value) {
      failure.value = error;
    } else if (
      open.value ||
      (progressOnly && pending.value && !progressFailed)
    ) {
      // Surface a polling outage once until a status read succeeds.
      progressFailed = progressOnly;
      showFailure(error);
    }
  } finally {
    if (alive && sequence === request) loading.value = false;
  }
}
function syncOnFocus() {
  if (!document.hidden && !busy.value && !open.value && !loading.value)
    void load(true);
}
onMounted(() => {
  void load();
  window.addEventListener('focus', syncOnFocus);
  document.addEventListener('visibilitychange', syncOnFocus);
  poll = setInterval(() => {
    if (clock.state.value?.verification_id) syncOnFocus();
  }, 5000);
});
onBeforeUnmount(() => {
  alive = false;
  clearInterval(poll);
  window.removeEventListener('focus', syncOnFocus);
  document.removeEventListener('visibilitychange', syncOnFocus);
});
function close() {
  if (busy.value) return;
  open.value = false;
  proof.value = '';
  fieldError.value = '';
  failure.value = undefined;
}
async function start(initial: 'identity' | 'method' = 'method') {
  open.value = true;
  step.value = initial;
  fieldError.value = '';
  failure.value = undefined;
  proof.value = '';
  state.value = undefined;
  await load();
  if (open.value && initial === 'identity') await focusField();
}
async function focusField() {
  await nextTick();
  (state.value?.fallback === 'totp' ? codeInput : passwordInput).value?.focus();
}
async function chooseEmail() {
  failure.value = undefined;
  step.value = 'email';
  await nextTick();
  emailHeading.value?.focus({ preventScroll: true });
}
async function chooseFallback() {
  failure.value = undefined;
  step.value = 'identity';
  await focusField();
}
async function send() {
  const current = captureOperation();
  if (
    !canSendLink.value ||
    busy.value ||
    !current() ||
    !state.value?.can_send ||
    clock.remaining.value > 0
  )
    return;
  busy.value = true;
  sequence++;
  loading.value = false;
  failure.value = undefined;
  try {
    const result = await requestEmailUnlinkApi(emailBrowserUUID());
    if (current()) {
      clock.accept(result);
      open.value = false;
    }
  } catch (error) {
    if (current() && !clock.acceptError(error)) showFailure(error);
  } finally {
    if (alive) busy.value = false;
  }
}
async function confirm() {
  const current = captureOperation();
  const method = state.value?.fallback;
  if (
    !canUseFallback.value ||
    busy.value ||
    !current() ||
    (method !== 'totp' && method !== 'password')
  )
    return;
  const value = proof.value.trim();
  if (method === 'totp' && !/^\d{6}$/.test(value)) {
    fieldError.value = 'verification.codeRequired';
    codeFailures.value++;
    return;
  }
  if (!value) {
    fieldError.value = 'email-auth.passwordRequired';
    return;
  }
  busy.value = true;
  failure.value = undefined;
  try {
    await verifyEmailUnlinkApi(
      method === 'totp' ? { verification_code: value } : { password: value },
      current,
    );
    if (!current()) return;
    justUnlinked.value = true;
    open.value = false;
    proof.value = '';
    clock.reset();
    message.success($t('email-auth.unlinkDone'));
    await refreshProfile();
  } catch (error) {
    if (current()) {
      failure.value = error;
      if (method === 'totp') codeFailures.value++;
    }
  } finally {
    if (alive) busy.value = false;
  }
}
function back() {
  proof.value = '';
  failure.value = undefined;
  fieldError.value = '';
  if (pending.value) close();
  else step.value = 'method';
}
const hint = computed(() => {
  if (state.value?.fallback === 'totp') {
    return 'email-auth.totpHint';
  }
  if (state.value?.fallback === 'password') {
    return 'email-auth.passwordHint';
  }
  return 'email-auth.enrollHint';
});
</script>
<template>
  <TipHolder />
  <Button
    v-if="!justUnlinked && !pending && (canSendLink || canUseFallback)"
    type="link"
    danger
    @click="start()"
  >
    <Unlink2 aria-hidden="true" :size="16" /> {{ $t('email-auth.unlink') }}
  </Button>
  <Alert
    v-if="justUnlinked"
    type="success"
    class="wide"
    show-icon
    :message="$t('email-auth.unlinkDone')"
  >
    <template v-if="statusError" #description>
      {{ $t('email-auth.refreshFailed') }}
      <Button type="link" @click="load()">
        {{ $t('email-auth.retryUnlink') }}
      </Button>
    </template>
  </Alert>
  <Alert
    v-else-if="pending"
    type="info"
    class="wide"
    show-icon
    :message="$t('email-auth.waitingLink')"
  >
    <template #description>
      {{ $t('email-auth.pendingHelp') }}
      <div class="links">
        <Button
          type="link"
          :loading="busy"
          v-if="canSendLink"
          :disabled="!state?.can_send || clock.remaining.value > 0"
          @click="send"
        >
          {{
            clock.remaining.value
              ? $t('email-auth.countdown', { seconds: clock.remaining.value })
              : $t('email-auth.resend')
          }}
        </Button>
        <Button
          v-if="canUseFallback"
          type="link"
          :disabled="busy"
          @click="start('identity')"
        >
          {{ $t('email-auth.otherMethod') }}
        </Button>
      </div>
    </template>
  </Alert>
  <Modal
    :open="open"
    wrap-class-name="profile-email-unlink-modal"
    :width="492"
    :closable="!busy"
    :keyboard="!busy"
    :mask-closable="!busy"
    destroy-on-close
    @cancel="close"
  >
    <template #title>
      <span class="flex items-center gap-3">
        <span class="unlink-icon"
          ><Unlink2 :size="20" aria-hidden="true"
        /></span>
        {{ $t('email-auth.unlink') }}
      </span>
    </template>
    <div
      v-if="loading || !state"
      class="unlink-recipient"
      data-testid="unlink-recipient-placeholder"
      :aria-busy="loading"
    >
      <span class="unlink-icon"><Mail :size="18" aria-hidden="true" /></span>
      <div>
        <div class="unlink-recipient-label">
          {{ $t('email-auth.unlinkRecipient') }}
        </div>
        <div v-if="masked" class="unlink-recipient-address">{{ masked }}</div>
        <Skeleton.Input
          v-else
          :active="loading"
          size="small"
          aria-hidden="true"
        />
      </div>
    </div>
    <template v-else>
      <div v-if="step === 'method'" class="choices">
        <p class="intro">{{ $t('email-auth.receiveQuestion') }}</p>
        <SecurityMethodCard
          action
          v-if="canSendLink"
          :title="$t('email-auth.canReceive')"
          :description="
            state.can_send
              ? $t('email-auth.sendLinkHint', { email: masked || '—' })
              : $t('email-auth.sendUnavailable')
          "
          :disabled="busy || !state.can_send"
          @click="chooseEmail"
        >
          <template #icon><Mail /></template>
        </SecurityMethodCard>
        <SecurityMethodCard
          action
          v-if="canUseFallback"
          :title="$t('email-auth.cantReceive')"
          :description="$t(hint)"
          :disabled="busy"
          @click="chooseFallback"
        >
          <template #icon
            ><LockKeyhole v-if="state.fallback === 'password'" /><ShieldCheck
              v-else
          /></template>
        </SecurityMethodCard>
      </div>
      <div
        v-else-if="step === 'email'"
        ref="emailHeading"
        tabindex="-1"
        class="unlink-confirmation"
      >
        <SecurityMethodCard
          :title="$t('email-auth.verifyByEmail')"
          :description="$t('verification.sendTo', { email: masked || '—' })"
        >
          <template #icon><Mail /></template>
        </SecurityMethodCard>
        <p class="unlink-note">
          <Info :size="15" aria-hidden="true" />{{
            $t('email-auth.unlinkMailHelp')
          }}
        </p>
      </div>
      <Alert
        v-else-if="state.fallback === 'enroll'"
        type="warning"
        show-icon
        :message="$t(hint)"
      />
      <form
        v-else
        id="email-unlink-verify"
        novalidate
        @submit.prevent="confirm"
      >
        <SecurityMethodCard
          :title="
            $t(
              state.fallback === 'password'
                ? 'email-auth.verifyPassword'
                : 'email-auth.verifyFactor',
            )
          "
          :description="$t('email-auth.unlinkEffect', { email: masked || '—' })"
        >
          <template #icon
            ><LockKeyhole v-if="state.fallback === 'password'" /><ShieldCheck
              v-else
          /></template>
        </SecurityMethodCard>
        <label for="unlink-proof">{{
          $t(
            state.fallback === 'totp'
              ? 'verification.code'
              : 'email-auth.currentPassword',
          )
        }}</label>
        <VerificationCodeInput
          v-if="state.fallback === 'totp'"
          id="unlink-proof"
          ref="codeInput"
          v-model="proof"
          :described-by="fieldError || statusError ? 'unlink-error' : undefined"
          :label="$t('verification.code')"
          :disabled="busy"
          :feedback="fieldError || statusError ? 'failure' : 'idle'"
          :animation="codeFailures ? 'failure' : 'idle'"
          :animation-attempt="codeFailures"
          @update:model-value="
            fieldError = '';
            failure = undefined;
          "
        />
        <Input.Password
          v-else
          id="unlink-proof"
          ref="passwordInput"
          v-model:value="proof"
          autocomplete="current-password"
          :aria-describedby="
            fieldError || statusError ? 'unlink-error' : undefined
          "
          :aria-invalid="!!(fieldError || statusError)"
          :status="fieldError || statusError ? 'error' : undefined"
          :disabled="busy"
          @input="
            fieldError = '';
            failure = undefined;
          "
        />
      </form>
    </template>
    <p
      v-if="showingProof && (fieldError || statusError)"
      id="unlink-error"
      class="sr-only"
      role="alert"
    >
      {{ fieldError ? $t(fieldError) : statusError }}
    </p>
    <template #footer>
      <Button v-if="step !== 'method' && state" :disabled="busy" @click="back">
        {{ $t('email-auth.backUnlink') }}
      </Button>
      <Button v-else :disabled="busy" @click="close">
        {{ $t('email-auth.cancelUnlink') }}
      </Button>
      <Button v-if="!state" type="primary" :loading="loading" @click="load()">
        {{ $t('email-auth.retryUnlink') }}
      </Button>
      <Button
        v-if="step === 'email' && state"
        type="primary"
        :disabled="!state.can_send || clock.remaining.value > 0"
        :loading="busy"
        @click="send"
      >
        {{
          clock.remaining.value
            ? $t('email-auth.countdown', { seconds: clock.remaining.value })
            : $t('email-auth.sendUnlinkMail')
        }}
      </Button>
      <Button
        v-if="step === 'identity' && state && state.fallback !== 'enroll'"
        danger
        type="primary"
        html-type="submit"
        form="email-unlink-verify"
        :loading="busy"
      >
        {{ $t('email-auth.confirmUnlink') }}
      </Button>
    </template>
  </Modal>
</template>
<style scoped>
.wide {
  grid-column: 1/-1;
}

.links,
.choices {
  display: flex;
  gap: 12px;
}

.links :deep(button) {
  padding-inline: 0;
}

.choices {
  flex-direction: column;
  gap: 9px;
}

.intro,
.unlink-note {
  margin: 0;
  font-size: 13px;
  line-height: 21px;
  color: hsl(var(--muted-foreground));
}

.unlink-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: var(--radius);
}

.unlink-recipient {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 68px;
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.unlink-recipient-label {
  font-weight: 600;
}

.unlink-recipient-address {
  margin-top: 2px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.unlink-recipient :deep(.ant-skeleton-input) {
  width: 120px;
  height: 14px;
  vertical-align: middle;
}

.unlink-note {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-top: 16px;
}

.unlink-note svg {
  flex: none;
  align-self: flex-start;
  margin-top: 3px;
}

label {
  display: block;
  margin: 16px 0 8px;
}

:global(.profile-email-unlink-modal .ant-modal-content) {
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius);
}

:global(.profile-email-unlink-modal .ant-modal-header) {
  padding: 21px 48px 20px 24px;
  margin: 0;
}

:global(.profile-email-unlink-modal .ant-modal-title) {
  font-size: 18px;
}

:global(.profile-email-unlink-modal .ant-modal-body) {
  padding: 0 24px 22px;
}

:global(.profile-email-unlink-modal .ant-modal-footer) {
  padding: 14px 24px;
  margin: 0;
  border-top: 1px solid hsl(var(--border));
}

:global(.profile-email-unlink-modal .ant-modal-footer .ant-btn) {
  min-height: 36px;
  border-radius: calc(var(--radius) * 0.75);
}
</style>
