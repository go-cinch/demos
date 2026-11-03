<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

import { ChevronDown, IconifyIcon } from '@vben/icons';

import { Button, Form, Modal, theme } from 'ant-design-vue';

import { testMFAApi } from '#/api/core/auth';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

import MFACodeInput from './mfa-code-input.vue';
import MFAEnrollment from './mfa-enrollment.vue';
import { useMFAError } from './mfa-error';
import { cancelMFA, completeMFA, mfaPrompt } from './mfa-prompt';

type Feedback = 'failure' | 'idle' | 'success';

const { token } = theme.useToken();
// Ant Modal renders through its own portal. Bind theme variables on the actual
// form so they do not depend on SFC CSS-variable injection across that portal.
const sensitiveStyles = computed(() => ({
  '--mfa-sensitive-text': token.value.colorText,
  '--mfa-sensitive-text-secondary': token.value.colorTextSecondary,
  '--mfa-sensitive-primary': token.value.colorPrimary,
  '--mfa-sensitive-primary-bg': token.value.colorPrimaryBg,
  '--mfa-sensitive-border': token.value.colorBorder,
  '--mfa-sensitive-divider': token.value.colorBorderSecondary,
  '--mfa-sensitive-surface': token.value.colorBgContainer,
  '--mfa-sensitive-success': token.value.colorSuccess,
  '--mfa-sensitive-success-text': token.value.colorSuccessText,
  '--mfa-sensitive-success-bg': token.value.colorSuccessBg,
  '--mfa-sensitive-error': token.value.colorError,
  '--mfa-sensitive-error-text': token.value.colorErrorText,
  '--mfa-sensitive-error-bg': token.value.colorErrorBg,
}));
const auth = useAuthStore();
const fieldId = useId();
const helpId = useId();
const codeInput = ref<{ focus: () => void }>();
const sensitive = computed(() => mfaPrompt.value?.mode === 'sensitive');
const testing = computed(() => mfaPrompt.value?.mode === 'test');
const verification = computed(() => sensitive.value || testing.value);
const enrollmentBusy = ref(false);
const enrollmentStage = ref<'password' | 'recovery' | 'scan'>('password');
const modalBusy = computed(() => busy.value || enrollmentBusy.value);
const titleKey = computed(() =>
  testing.value
    ? 'mfa.testTitle'
    : sensitive.value
      ? 'mfa.sensitiveTitle'
      : enrollmentStage.value === 'recovery'
        ? 'mfa.recoveryTitle'
        : 'mfa.enrollTitle',
);
const code = ref('');
const busy = ref(false);
const feedback = ref<Feedback>('idle');
const animation = ref<Feedback>('idle');
const failure = useMFAError();
const helpOpen = ref(false);
const announcement = computed(() => {
  if (feedback.value === 'success')
    return $t(testing.value ? 'mfa.testSuccess' : 'mfa.verified');
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
  () => mfaPrompt.value?.id,
  (id) => {
    clearFeedback();
    code.value = '';
    busy.value = false;
    helpOpen.value = false;
    enrollmentBusy.value = false;
    enrollmentStage.value = 'password';
    ownedPromptId = verification.value ? id : undefined;
    if (ownedPromptId !== undefined) {
      void nextTick(() => {
        if (active && mfaPrompt.value?.id === id) codeInput.value?.focus();
      });
    }
  },
  { immediate: true, flush: 'sync' },
);

onBeforeUnmount(() => {
  active = false;
  // The retry already performed the mutation; release its callers even when
  // this host unmounts before the visual acknowledgement finishes.
  if (ownedPromptId !== undefined && mfaPrompt.value?.id === ownedPromptId) {
    if (feedback.value === 'success') completeMFA(ownedPromptId);
    else cancelMFA();
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
  const prompt = mfaPrompt.value;
  if (testing.value && feedback.value === 'success' && prompt)
    completeMFA(prompt.id);
  else cancelMFA();
}

async function restartRecovery() {
  if (!busy.value) await auth.restartLoginForMFARecovery();
}

async function submit() {
  const prompt = mfaPrompt.value;
  if (!prompt || !verification.value || busy.value) return;
  if (testing.value && feedback.value === 'success') {
    completeMFA(prompt.id);
    return;
  }
  if (sensitive.value && !prompt.verify) return;
  if (!/^\d{6}$/.test(code.value)) {
    await fail('mfa.codeRequired');
    return;
  }
  clearFeedback();
  busy.value = true;
  try {
    const verified = testing.value
      ? (await testMFAApi(code.value)).verified
      : await prompt.verify!(code.value);
    if (!active || mfaPrompt.value?.id !== prompt.id) return;
    if (testing.value && verified !== true) {
      busy.value = false;
      await fail('mfa.failed');
      return;
    }
    if (verified === false) {
      completeMFA(prompt.id);
      return;
    }
    feedback.value = 'success';
    animation.value = 'success';
    if (testing.value) busy.value = false;
    else
      completionTimer = setTimeout(() => {
        if (active && mfaPrompt.value?.id === prompt.id) completeMFA(prompt.id);
      }, 720);
  } catch (cause: unknown) {
    if (!active || mfaPrompt.value?.id !== prompt.id) return;
    busy.value = false;
    await fail('mfa.failed', cause);
  } finally {
    if (
      active &&
      mfaPrompt.value?.id === prompt.id &&
      feedback.value !== 'success'
    )
      busy.value = false;
  }
}
</script>

<template>
  <Modal
    :z-index="2000"
    :open="!!mfaPrompt && mfaPrompt.mode !== 'login'"
    :title="$t(titleKey)"
    :width="verification ? 448 : 640"
    :wrap-class-name="
      verification ? 'mfa-sensitive-modal' : 'mfa-enrollment-modal'
    "
    :footer="null"
    :mask-closable="false"
    :closable="!modalBusy"
    :keyboard="!modalBusy"
    destroy-on-close
    @cancel="cancel"
  >
    <MFAEnrollment
      v-if="mfaPrompt?.mode === 'enroll'"
      :key="mfaPrompt.id"
      @complete="completeMFA(mfaPrompt!.id, $event)"
      @cancel="cancel"
      @stage="enrollmentStage = $event"
      @busy="enrollmentBusy = $event"
    />
    <Form
      v-else-if="verification"
      class="mfa-sensitive-form"
      :style="sensitiveStyles"
      layout="vertical"
      :aria-busy="busy"
      @submit.prevent="submit"
    >
      <div class="mfa-sensitive-body">
        <div
          class="mfa-sensitive-shield"
          :class="{ 'is-success': feedback === 'success' }"
          aria-hidden="true"
        >
          <IconifyIcon icon="lucide:shield-check" />
        </div>
        <label :for="fieldId" class="mfa-sensitive-label">{{
          $t('mfa.code')
        }}</label>
        <MFACodeInput
          :id="fieldId"
          ref="codeInput"
          :model-value="code"
          class="mfa-sensitive-code"
          :label="$t('mfa.code')"
          :feedback="feedback"
          :animation="animation"
          :disabled="busy || feedback === 'success'"
          @update:model-value="updateCode"
        />
        <p
          v-if="announcement"
          class="mfa-sensitive-feedback"
          :class="{
            'is-success': feedback === 'success',
            'is-error': feedback === 'failure',
          }"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <IconifyIcon
            :icon="
              feedback === 'success' ? 'lucide:check' : 'lucide:circle-alert'
            "
            aria-hidden="true"
          />{{ announcement }}
        </p>
        <div v-if="helpOpen" :id="helpId" class="mfa-sensitive-recovery">
          <p>{{ $t('mfa.sensitiveRecoveryHelp') }}</p>
          <Button
            type="link"
            data-testid="mfa-restart-recovery"
            :disabled="busy"
            @click="restartRecovery"
            >
{{ $t('mfa.restartRecovery') }}
</Button>
        </div>
      </div>
      <footer class="mfa-sensitive-footer">
        <Button
          v-if="sensitive"
          type="text"
          class="mfa-sensitive-help"
          data-testid="mfa-sensitive-help"
          :aria-expanded="helpOpen"
          :aria-controls="helpId"
          :disabled="busy"
          @click="helpOpen = !helpOpen"
        >
          <span>{{ $t('mfa.help') }}</span><ChevronDown aria-hidden="true" :class="{ 'is-open': helpOpen }" />
        </Button>
        <div class="mfa-sensitive-actions">
          <Button
            v-if="!(testing && feedback === 'success')"
            data-testid="mfa-sensitive-cancel"
            :disabled="busy"
            @click="cancel"
            >
{{ $t('common.cancel') }}
</Button>
          <Button
            type="primary"
            html-type="submit"
            class="mfa-sensitive-submit"
            data-testid="mfa-sensitive-submit"
            :loading="busy && feedback !== 'success'"
            :disabled="busy"
            :aria-busy="busy"
            >
{{
              $t(
                testing
                  ? feedback === 'success'
                    ? 'mfa.done'
                    : 'mfa.test'
                  : 'mfa.verify',
              )
            }}
</Button>
        </div>
      </footer>
    </Form>
  </Modal>
</template>

<style scoped>
:global(.mfa-enrollment-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border-radius: 12px;
}
:global(.mfa-enrollment-modal .ant-modal-header) {
  padding: 23px 28px;
  margin: 0;
  border-bottom: 1px solid hsl(var(--border));
}
:global(.mfa-enrollment-modal .ant-modal-title) {
  padding-right: 28px;
  font-size: 18px;
  font-weight: 600;
}
:global(.mfa-enrollment-modal .ant-modal-body) {
  padding: 0;
}
:global(.mfa-enrollment-modal .ant-modal-close) {
  top: 18px;
  inset-inline-end: 18px;
}

:global(.mfa-sensitive-modal .ant-modal-content) {
  padding: 0;
  overflow: hidden;
  border-radius: 12px;
}
:global(.mfa-sensitive-modal .ant-modal-header) {
  padding: 23px 24px 18px;
  margin: 0;
}
:global(.mfa-sensitive-modal .ant-modal-title) {
  padding-right: 28px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}
:global(.mfa-sensitive-modal .ant-modal-body) {
  padding: 0;
}
:global(.mfa-sensitive-modal .ant-modal-close) {
  top: 17px;
  inset-inline-end: 16px;
}
.mfa-sensitive-form {
  margin: 0;
  color: var(--mfa-sensitive-text);
}
.mfa-sensitive-body {
  padding: 0 32px 30px;
}
.mfa-sensitive-shield {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin: 8px auto 30px;
  border-radius: 50%;
  color: var(--mfa-sensitive-primary);
  background: var(--mfa-sensitive-primary-bg);
}
.mfa-sensitive-shield :deep(svg) {
  width: 36px;
  height: 36px;
}
.mfa-sensitive-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}
.mfa-sensitive-shield.is-success {
  color: var(--mfa-sensitive-success);
  background: var(--mfa-sensitive-success-bg);
}
.mfa-sensitive-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 20px;
}
.mfa-sensitive-feedback :deep(svg) {
  flex: none;
  width: 14px;
  height: 14px;
}
.mfa-sensitive-feedback.is-success {
  color: var(--mfa-sensitive-success-text);
}
.mfa-sensitive-feedback.is-error {
  color: var(--mfa-sensitive-error-text);
}
.mfa-sensitive-recovery {
  padding-top: 15px;
  margin-top: 20px;
  border-top: 1px solid var(--mfa-sensitive-divider);
  color: var(--mfa-sensitive-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.mfa-sensitive-recovery p {
  margin: 0 0 8px;
}
.mfa-sensitive-recovery :deep(.ant-btn) {
  height: auto;
  padding: 0;
  white-space: normal;
  text-align: start;
  font-size: 13px;
}
.mfa-sensitive-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 24px;
  border-top: 1px solid var(--mfa-sensitive-divider);
}
.mfa-sensitive-help {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0;
  color: var(--mfa-sensitive-text-secondary);
  font-size: 12px;
}
.mfa-sensitive-help :deep(svg) {
  width: 13px;
  height: 13px;
  transition: transform 150ms ease;
}
.mfa-sensitive-help :deep(svg.is-open) {
  transform: rotate(180deg);
}
.mfa-sensitive-actions {
  display: flex;
  gap: 10px;
  margin-inline-start: auto;
}
.mfa-sensitive-actions :deep(.ant-btn) {
  min-height: 37px;
  padding-inline: 17px;
  border-radius: 6px;
}
.mfa-sensitive-submit {
  min-width: 122px;
}
@media (max-width: 520px) {
  :global(.mfa-sensitive-modal .ant-modal-header) {
    padding: 22px 18px 18px;
  }
  .mfa-sensitive-body {
    padding: 0 18px 26px;
  }
  .mfa-sensitive-footer {
    gap: 10px;
    padding: 14px 18px;
  }
  .mfa-sensitive-actions :deep(.ant-btn) {
    padding-inline: 13px;
  }
}
@media (pointer: coarse) {
  .mfa-sensitive-footer :deep(.ant-btn) {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mfa-sensitive-help :deep(svg) {
    transition: none;
  }
}
</style>
