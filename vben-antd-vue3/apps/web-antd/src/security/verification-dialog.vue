<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

import { ChevronDown, Mail, ShieldCheck } from '@vben/icons';

import { Button, ConfigProvider, Form, Modal, theme } from 'ant-design-vue';

import {
  getMailboxCooldownApi,
  getSensitiveOptionsApi,
  sendSensitiveEmailApi,
  testTOTPApi,
} from '#/api/core/auth';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

import { emailBrowserUUID, useEmailCode } from './email-code';
import SecurityMethodCard from './security-method-card.vue';
import TOTPEnrollment from './totp-enrollment.vue';
import VerificationCodeInput from './verification-code-input.vue';
import { useVerificationError } from './verification-error';
import {
  cancelVerification,
  completeVerification,
  verificationPrompt,
} from './verification-prompt';
import {
  useVerificationTip,
  verificationModalTipTheme,
} from './verification-tip';

type Feedback = 'failure' | 'idle' | 'success';

const { token } = theme.useToken();
// Ant Modal renders through its own portal. Bind theme variables on the actual
// form so they do not depend on SFC CSS-variable injection across that portal.
const sensitiveStyles = computed(() => ({
  '--sensitive-text': token.value.colorText,
  '--sensitive-text-secondary': token.value.colorTextSecondary,
  '--sensitive-primary': token.value.colorPrimary,
  '--sensitive-primary-bg': token.value.colorPrimaryBg,
  '--sensitive-border': token.value.colorBorder,
  '--sensitive-divider': token.value.colorBorderSecondary,
  '--sensitive-surface': token.value.colorBgContainer,
  '--sensitive-success': token.value.colorSuccess,
  '--sensitive-success-bg': token.value.colorSuccessBg,
}));
const auth = useAuthStore();
const fieldId = useId();
const helpId = useId();
const codeInput = ref<{ focus: () => void }>();
const sendSummary = ref<HTMLElement>();
const sensitive = computed(
  () => verificationPrompt.value?.mode === 'sensitive',
);
const testing = computed(() => verificationPrompt.value?.mode === 'test');
const verification = computed(() => sensitive.value || testing.value);
const enrollmentBusy = ref(false);
const enrollmentStage = ref<'password' | 'recovery' | 'scan'>('password');
const modalBusy = computed(
  () => busy.value || sending.value || enrollmentBusy.value,
);
const titleKey = computed(() => {
  if (testing.value) {
    return 'verification.testTitle';
  }
  if (sensitive.value) {
    return 'verification.sensitiveTitle';
  }
  if (enrollmentStage.value === 'recovery') {
    return 'verification.recoveryTitle';
  }
  return 'verification.enrollTitle';
});
const code = ref('');
const busy = ref(false);
const feedback = ref<Feedback>('idle');
const animation = ref<Feedback>('idle');
const failure = useVerificationError();
const { showFailure, TipHolder } = useVerificationTip();
const helpOpen = ref(false);
const methods = ref<Awaited<ReturnType<typeof getSensitiveOptionsApi>>>();
const channel = ref<'email' | 'totp'>('totp');
const emailCode = useEmailCode();
const loadingMethods = ref(false);
const sending = ref(false);
const loadingEmail = ref(false);
const emailReady = ref(false);
let emailRequest = 0;
const confirmResend = ref(false);
const emailMode = computed(() => sensitive.value && channel.value === 'email');
const awaitingSend = computed(
  () =>
    emailMode.value &&
    (confirmResend.value || !emailCode.state.value?.verification_id),
);
const showCode = computed(
  () =>
    !loadingMethods.value &&
    !awaitingSend.value &&
    Boolean(testing.value || methods.value),
);
const submitLabel = computed(() => {
  if (testing.value)
    return $t(
      feedback.value === 'success' ? 'verification.done' : 'verification.test',
    );
  if (loadingMethods.value) return $t('verification.verify');
  if (!methods.value || (emailMode.value && !emailReady.value))
    return $t('verification.retry');
  if (!awaitingSend.value) return $t('verification.verify');
  return emailCode.remaining.value
    ? $t('verification.resendAfter', { seconds: emailCode.remaining.value })
    : $t('verification.confirmSend');
});
const codeLabel = computed(() =>
  $t(emailMode.value ? 'verification.emailCode' : 'verification.code'),
);
const busyWithRequest = computed(
  () => busy.value || sending.value || loadingEmail.value,
);

async function loadMethods(id: number) {
  loadingMethods.value = true;
  clearFeedback();
  try {
    const result =
      verificationPrompt.value?.methods ?? (await getSensitiveOptionsApi());
    if (!active || verificationPrompt.value?.id !== id) return;
    if (!result.address && !result.totp) throw new Error('Test request failed');
    methods.value = result;
    channel.value = result.totp ? 'totp' : 'email';
  } catch (error) {
    await nextTick();
    if (active && verificationPrompt.value?.id === id) showFailure(error);
  } finally {
    if (active && verificationPrompt.value?.id === id) {
      loadingMethods.value = false;
      await nextTick();
      focusChannel();
    }
  }
}

function focusChannel() {
  if (awaitingSend.value) sendSummary.value?.focus();
  else codeInput.value?.focus();
}

function selectChannel(value: 'email' | 'totp') {
  channel.value = value;
  confirmResend.value = false;
  helpOpen.value = false;
  code.value = '';
  clearFeedback();
  void nextTick(focusChannel);
}

async function sendEmail() {
  const id = verificationPrompt.value?.id;
  if (
    !id ||
    !emailMode.value ||
    !methods.value?.address ||
    sending.value ||
    loadingEmail.value ||
    !emailReady.value ||
    emailCode.remaining.value > 0
  )
    return;
  sending.value = true;
  clearFeedback();
  try {
    const status = await sendSensitiveEmailApi(emailBrowserUUID());
    if (!active || verificationPrompt.value?.id !== id) return;
    emailCode.accept(status);
    confirmResend.value = false;
    code.value = '';
  } catch (error) {
    if (
      active &&
      verificationPrompt.value?.id === id &&
      !emailCode.acceptError(error)
    )
      showFailure(error);
  } finally {
    if (active && verificationPrompt.value?.id === id) {
      sending.value = false;
      await nextTick();
      focusChannel();
    }
  }
}
const announcement = computed(() => {
  if (feedback.value === 'success')
    return $t(
      testing.value ? 'verification.testSuccess' : 'verification.verified',
    );
  if (feedback.value === 'failure') return failure.message.value;
  return '';
});
let active = true;
let ownedPromptId: number | undefined;
let feedbackVersion = 0;
let animationTimer: ReturnType<typeof setTimeout> | undefined;
let completionTimer: ReturnType<typeof setTimeout> | undefined;

function clearFeedback() {
  feedbackVersion += 1;
  clearTimeout(animationTimer);
  clearTimeout(completionTimer);
  animation.value = 'idle';
  feedback.value = 'idle';
  failure.clear();
}

watch(
  () => verificationPrompt.value?.id,
  (id) => {
    clearFeedback();
    code.value = '';
    busy.value = false;
    helpOpen.value = false;
    emailCode.reset();
    emailRequest++;
    emailReady.value = false;
    loadingEmail.value = false;
    confirmResend.value = false;
    methods.value = undefined;
    loadingMethods.value = false;
    sending.value = false;
    channel.value = 'totp';
    if (sensitive.value && id !== undefined) void loadMethods(id);
    enrollmentBusy.value = false;
    enrollmentStage.value = 'password';
    ownedPromptId = verification.value ? id : undefined;
    if (ownedPromptId !== undefined) {
      void nextTick(() => {
        if (active && verificationPrompt.value?.id === id)
          codeInput.value?.focus();
      });
    }
  },
  { immediate: true, flush: 'sync' },
);

async function loadEmailCooldown() {
  const id = verificationPrompt.value?.id;
  const request = ++emailRequest;
  loadingEmail.value = true;
  emailReady.value = false;
  clearFeedback();
  try {
    const status = await getMailboxCooldownApi(emailBrowserUUID(), 'sensitive');
    if (
      !active ||
      verificationPrompt.value?.id !== id ||
      request !== emailRequest
    )
      return;
    // A cooldown-only read must retain this prompt's already issued code.
    emailCode.accept({ ...emailCode.state.value, ...status });
    emailReady.value = true;
  } catch (error) {
    if (
      active &&
      verificationPrompt.value?.id === id &&
      request === emailRequest
    )
      showFailure(error);
  } finally {
    if (
      active &&
      verificationPrompt.value?.id === id &&
      request === emailRequest
    )
      loadingEmail.value = false;
  }
}
watch(emailMode, (enabled) => {
  emailRequest++;
  loadingEmail.value = false;
  emailReady.value = false;
  if (enabled) void loadEmailCooldown();
});

onBeforeUnmount(() => {
  active = false;
  // The retry already performed the mutation; release its callers even when
  // this host unmounts before the visual acknowledgement finishes.
  if (
    ownedPromptId !== undefined &&
    verificationPrompt.value?.id === ownedPromptId
  ) {
    if (feedback.value === 'success') completeVerification(ownedPromptId);
    else cancelVerification();
  }
  clearFeedback();
  code.value = '';
});

function updateCode(value: string) {
  if (value !== code.value) clearFeedback();
  code.value = value;
}

async function fail(key: string, cause?: unknown) {
  clearFeedback();
  feedback.value = 'failure';
  if (cause) failure.setCause(cause);
  else failure.setKey(key);
  const version = feedbackVersion;
  await nextTick();
  if (!active || feedbackVersion !== version) return;
  animation.value = 'failure';
  codeInput.value?.focus();
  // Keep the red state after the one-second animation finishes.
  animationTimer = setTimeout(() => {
    if (feedbackVersion === version) animation.value = 'idle';
  }, 1050);
}

function cancel() {
  if (modalBusy.value) return;
  const prompt = verificationPrompt.value;
  if (testing.value && feedback.value === 'success' && prompt)
    completeVerification(prompt.id);
  else cancelVerification();
}

async function openRecovery() {
  if (!busy.value) await auth.openTOTPRecovery();
}

async function submit() {
  const prompt = verificationPrompt.value;
  if (!prompt || !verification.value || busy.value) return;
  if (testing.value && feedback.value === 'success') {
    completeVerification(prompt.id);
    return;
  }
  if (sensitive.value) {
    if (
      !prompt.verify ||
      loadingMethods.value ||
      loadingEmail.value ||
      sending.value
    )
      return;
    if (emailMode.value && !emailReady.value) {
      await loadEmailCooldown();
      return;
    }
    if (!methods.value) {
      await loadMethods(prompt.id);
      return;
    }
    if (awaitingSend.value) {
      await sendEmail();
      return;
    }
    if (emailMode.value && emailCode.expired.value) {
      await fail('verification.emailExpired');
      return;
    }
  }
  if (!/^\d{6}$/.test(code.value)) {
    await fail('verification.codeRequired');
    return;
  }
  clearFeedback();
  busy.value = true;
  try {
    let verified: boolean | undefined;
    if (testing.value) {
      const test = await testTOTPApi(code.value);
      verified = test.verified;
    } else {
      if (!prompt.verify) return;
      const verificationId = emailCode.state.value?.verification_id;
      if (emailMode.value && !verificationId) {
        await fail('verification.emailExpired');
        return;
      }
      const proof =
        emailMode.value && verificationId
          ? {
              browser_uuid: emailBrowserUUID(),
              verification_id: verificationId,
            }
          : undefined;
      const outcome = await prompt.verify(code.value, proof);
      verified = typeof outcome === 'boolean' ? outcome : undefined;
    }
    if (!active || verificationPrompt.value?.id !== prompt.id) return;
    if (testing.value && verified !== true) {
      busy.value = false;
      await fail('verification.failed');
      return;
    }
    if (verified === false) {
      completeVerification(prompt.id);
      return;
    }
    feedback.value = 'success';
    animation.value = 'success';
    if (testing.value) busy.value = false;
    else
      completionTimer = setTimeout(() => {
        if (active && verificationPrompt.value?.id === prompt.id)
          completeVerification(prompt.id);
      }, 720);
  } catch (error: unknown) {
    if (!active || verificationPrompt.value?.id !== prompt.id) return;
    busy.value = false;
    await fail('verification.failed', error);
  } finally {
    if (
      active &&
      verificationPrompt.value?.id === prompt.id &&
      feedback.value !== 'success'
    )
      busy.value = false;
  }
}
</script>

<template>
  <ConfigProvider
    v-if="verification"
    :key="verificationPrompt?.id"
    :theme="verificationModalTipTheme"
  >
    <TipHolder />
  </ConfigProvider>
  <Modal
    :z-index="2000"
    :open="!!verificationPrompt && verificationPrompt.mode !== 'login'"
    :title="$t(titleKey)"
    :width="verification ? 448 : 640"
    :wrap-class-name="
      verification ? 'sensitive-modal' : 'totp-enrollment-modal'
    "
    :footer="null"
    :mask-closable="false"
    :closable="!modalBusy"
    :keyboard="!modalBusy"
    destroy-on-close
    @cancel="cancel"
  >
    <TOTPEnrollment
      v-if="verificationPrompt?.mode === 'enroll'"
      :key="verificationPrompt.id"
      @complete="completeVerification(verificationPrompt!.id, $event)"
      @cancel="cancel"
      @stage="enrollmentStage = $event"
      @busy="enrollmentBusy = $event"
    />
    <Form
      v-else-if="verification"
      class="sensitive-form"
      :style="sensitiveStyles"
      layout="vertical"
      :aria-busy="busy"
      @submit.prevent="submit"
    >
      <div class="sensitive-body">
        <div
          class="sensitive-shield"
          :class="{ 'is-success': feedback === 'success' }"
          aria-hidden="true"
        >
          <ShieldCheck aria-hidden="true" />
        </div>
        <p v-if="loadingMethods" role="status">
          {{ $t('verification.loadingMethods') }}
        </p>
        <div
          v-else-if="awaitingSend"
          ref="sendSummary"
          role="group"
          :aria-label="$t('verification.boundEmail')"
          tabindex="-1"
        >
          <SecurityMethodCard
            :title="$t('verification.boundEmail')"
            :description="methods?.address ?? ''"
          >
            <template #icon><Mail /></template>
          </SecurityMethodCard>
        </div>
        <template v-else-if="showCode">
          <label :for="fieldId" class="sensitive-label">{{ codeLabel }}</label>
          <VerificationCodeInput
            :id="fieldId"
            ref="codeInput"
            :model-value="code"
            class="sensitive-code"
            :label="codeLabel"
            :described-by="
              feedback === 'failure' ? `${fieldId}-error` : undefined
            "
            :feedback="feedback"
            :animation="animation"
            :disabled="busyWithRequest || feedback === 'success'"
            @update:model-value="updateCode"
          />
          <div v-if="emailMode" class="email-code-delivery">
            <span>{{
              $t('verification.sentTo', { email: methods?.address })
            }}</span>
            <Button
              type="link"
              :disabled="busyWithRequest || emailCode.remaining.value > 0"
              @click="
                confirmResend = true;
                clearFeedback();
                nextTick(focusChannel);
              "
            >
              {{
                emailCode.remaining.value
                  ? $t('verification.resendAfter', {
                      seconds: emailCode.remaining.value,
                    })
                  : $t('verification.resend')
              }}
            </Button>
          </div>
        </template>
        <span
          v-if="feedback === 'success'"
          class="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          >{{ announcement }}</span
        >
        <span
          v-if="showCode && feedback === 'failure'"
          :id="`${fieldId}-error`"
          class="sr-only"
          role="alert"
          >{{ announcement }}</span
        >
        <div v-if="helpOpen" :id="helpId" class="sensitive-recovery">
          <SecurityMethodCard
            v-if="methods?.address"
            action
            :title="$t('verification.useEmail')"
            :description="$t('verification.sendTo', { email: methods.address })"
            :disabled="busyWithRequest"
            @click="selectChannel('email')"
          >
            <template #icon><Mail /></template>
          </SecurityMethodCard>
          <SecurityMethodCard
            v-else
            action
            data-testid="totp-restart-recovery"
            :title="$t('verification.goToReset')"
            :description="$t('verification.goToResetHelp')"
            :disabled="busyWithRequest"
            @click="openRecovery"
          >
            <template #icon><ShieldCheck /></template>
          </SecurityMethodCard>
        </div>
      </div>
      <footer class="sensitive-footer">
        <button
          v-if="sensitive && methods?.totp && !emailMode"
          type="button"
          class="sensitive-help"
          data-testid="sensitive-help"
          :aria-expanded="helpOpen"
          :aria-controls="helpId"
          :disabled="busy"
          @click="helpOpen = !helpOpen"
        >
          <span>{{ $t('verification.authenticatorUnavailable') }}</span
          ><ChevronDown aria-hidden="true" :class="{ 'is-open': helpOpen }" />
        </button>
        <button
          v-if="emailMode && methods?.totp"
          type="button"
          class="sensitive-help"
          :disabled="busyWithRequest"
          @click="selectChannel('totp')"
        >
          {{ $t('verification.useAuthenticator') }}
        </button>
        <div class="sensitive-actions">
          <Button
            v-if="!(testing && feedback === 'success')"
            data-testid="sensitive-cancel"
            :disabled="busyWithRequest"
            @click="cancel"
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            type="primary"
            html-type="submit"
            class="sensitive-submit"
            data-testid="sensitive-submit"
            :loading="busyWithRequest && feedback !== 'success'"
            :disabled="
              busyWithRequest ||
              loadingMethods ||
              (awaitingSend && emailCode.remaining.value > 0)
            "
            :aria-busy="busyWithRequest"
          >
            {{ submitLabel }}
          </Button>
        </div>
      </footer>
    </Form>
  </Modal>
</template>

<style scoped>
:global(.totp-enrollment-modal .ant-modal-content) {
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius);
}

:global(.totp-enrollment-modal .ant-modal-header) {
  padding: 23px 28px;
  margin: 0;
  border-bottom: 1px solid hsl(var(--border));
}

:global(.totp-enrollment-modal .ant-modal-title) {
  padding-right: 28px;
  font-size: 18px;
  font-weight: 600;
}

:global(.totp-enrollment-modal .ant-modal-body) {
  padding: 0;
}

:global(.totp-enrollment-modal .ant-modal-close) {
  inset-inline-end: 18px;
  top: 18px;
}

:global(.sensitive-modal .ant-modal-content) {
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius);
}

:global(.sensitive-modal .ant-modal-header) {
  padding: 23px 24px 18px;
  margin: 0;
}

:global(.sensitive-modal .ant-modal-title) {
  padding-right: 28px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}

:global(.sensitive-modal .ant-modal-body) {
  padding: 0;
}

:global(.sensitive-modal .ant-modal-close) {
  inset-inline-end: 16px;
  top: 17px;
}

.sensitive-form {
  margin: 0;
  color: var(--sensitive-text);
}

.sensitive-body {
  padding: 0 24px 22px;
}

.sensitive-shield {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin: 8px auto 30px;
  color: var(--sensitive-primary);
  background: var(--sensitive-primary-bg);
  border-radius: 50%;
}

.sensitive-shield :deep(svg) {
  width: 36px;
  height: 36px;
  font-size: 36px;
}

.sensitive-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}

.sensitive-shield.is-success {
  color: var(--sensitive-success);
  background: var(--sensitive-success-bg);
}

.sensitive-recovery {
  margin-top: 16px;
}

.sensitive-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--sensitive-divider);
}

.sensitive-help {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 32px;
  padding: 6px 0;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--sensitive-text-secondary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius) * 0.625);
  box-shadow: none;
}

.sensitive-help:enabled:hover,
.sensitive-help:enabled:active {
  color: var(--sensitive-primary);
}

.sensitive-help:focus-visible {
  outline: 2px solid var(--sensitive-primary);
  outline-offset: 2px;
}

.totp-email-delivery {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: var(--sensitive-text-secondary);
  overflow-wrap: anywhere;
}

.sensitive-help :deep(svg) {
  display: block;
  flex: none;
  width: 13px;
  height: 13px;
  transition: transform 150ms ease;
}

.sensitive-help :deep(svg.is-open) {
  transform: rotate(180deg);
}

.sensitive-actions {
  display: flex;
  gap: 10px;
  margin-inline-start: auto;
}

.sensitive-actions :deep(.ant-btn) {
  min-height: 37px;
  padding-inline: 17px;
  border-radius: calc(var(--radius) * 0.75);
}

.sensitive-submit {
  min-width: 122px;
}

@media (max-width: 520px) {
  :global(.sensitive-modal .ant-modal-header) {
    padding: 22px 18px 18px;
  }

  .sensitive-body {
    padding: 0 18px 26px;
  }

  .sensitive-footer {
    gap: 10px;
    padding: 14px 18px;
  }

  .sensitive-actions :deep(.ant-btn) {
    padding-inline: 13px;
  }
}

@media (pointer: coarse) {
  .sensitive-footer :deep(.ant-btn) {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sensitive-help :deep(svg) {
    transition: none;
  }
}
</style>
