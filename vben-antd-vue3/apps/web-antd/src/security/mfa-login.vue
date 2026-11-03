<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  ref,
  useId,
  watch,
} from 'vue';

import { ArrowLeft, Check } from '@vben/icons';

import { Button, Form, Input } from 'ant-design-vue';

import { completeMFALoginApi, recoverMFALoginApi } from '#/api/core/auth';
import { $t } from '#/locales';

import MFACodeInput from './mfa-code-input.vue';
import { useMFAError } from './mfa-error';
import { cancelMFA, completeMFA, mfaPrompt } from './mfa-prompt';

const props = defineProps<{ completing?: boolean }>();
const emit = defineEmits<{ verified: [] }>();
const titleId = useId();
const codeId = useId();
const prompt = computed(() =>
  mfaPrompt.value?.mode === 'login' ? mfaPrompt.value : undefined,
);
const code = ref('');
const failure = useMFAError();
const error = failure.message;
const busy = ref(false);
const verified = ref(false);
const expired = ref(false);
const useRecovery = ref(false);
const input = ref<{ focus: () => void }>();
let ownedPromptId: number | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => prompt.value?.id,
  (id) => {
    if (id === undefined) return;
    ownedPromptId = id;
    code.value = '';
    failure.clear();
    busy.value = false;
    verified.value = false;
    expired.value = false;
    useRecovery.value = false;
    clearTimeout(expiryTimer);
    const deadline = prompt.value?.expiresAt;
    if (deadline !== undefined && Number.isFinite(deadline)) {
      expiryTimer = setTimeout(
        () => {
          if (prompt.value?.id === id) expired.value = true;
        },
        Math.max(0, deadline - Date.now()),
      );
    }
  },
  { immediate: true },
);

function cancel() {
  clearTimeout(expiryTimer);
  if (prompt.value?.id === ownedPromptId) cancelMFA();
}
onBeforeUnmount(cancel);
onDeactivated(cancel);

async function switchMethod() {
  useRecovery.value = !useRecovery.value;
  code.value = '';
  failure.clear();
  verified.value = false;
  await nextTick();
  input.value?.focus();
}

function updateCode(value: string) {
  if (value !== code.value) failure.clear();
  code.value = value;
}

async function submit() {
  const current = prompt.value;
  if (!current?.ticket || busy.value || props.completing || expired.value)
    return;
  const value = code.value.trim();
  if (!value || (!useRecovery.value && !/^\d{6}$/.test(value))) {
    failure.setKey(useRecovery.value ? 'mfa.required' : 'mfa.codeRequired');
    return;
  }
  busy.value = true;
  failure.clear();
  try {
    const result = await (
      useRecovery.value ? recoverMFALoginApi : completeMFALoginApi
    )(current.ticket, value);
    if (prompt.value?.id !== current.id) return;
    clearTimeout(expiryTimer);
    verified.value = true;
    code.value = '';
    // Keep this inline step visible while the login store loads permissions
    // and plays the arrival animation; do not flash the password form again.
    emit('verified');
    completeMFA(current.id, result);
  } catch (cause: unknown) {
    if (prompt.value?.id === current.id) failure.setCause(cause);
  } finally {
    if (prompt.value?.id === current.id) busy.value = false;
  }
}
</script>

<template>
  <section
    class="mfa-login-page"
    data-testid="mfa-login-step"
    :data-mode="useRecovery ? 'recovery' : 'totp'"
    :aria-labelledby="titleId"
  >
    <ol class="mfa-login-steps" :aria-label="$t('mfa.loginTitle')">
      <li class="is-complete">
        <span class="mfa-login-step-icon"><Check aria-hidden="true" /></span><span>{{ $t('mfa.loginPasswordStep') }}</span>
      </li>
      <li class="is-current" aria-current="step">
        <span class="mfa-login-step-icon">2</span><span>{{ $t('mfa.loginVerificationStep') }}</span>
      </li>
    </ol>
    <h1 :id="titleId">
      {{ $t(useRecovery ? 'mfa.recoverAuthenticator' : 'mfa.loginTitle') }}
    </h1>
    <p v-if="useRecovery" class="mfa-login-help">
      {{ $t('mfa.recoveryResetHelp') }}
    </p>
    <Form layout="vertical" @submit.prevent="submit">
      <Form.Item
        :html-for="codeId"
        :label="$t(useRecovery ? 'mfa.recoveryCode' : 'mfa.code')"
        :help="expired ? $t('mfa.loginExpired') : error || undefined"
        :validate-status="expired || error ? 'error' : undefined"
      >
        <Input
          v-if="useRecovery"
          :id="codeId"
          ref="input"
          :value="code"
          @update:value="updateCode"
          name="mfa_verification_code"
          class="mfa-login-input"
          :aria-label="$t('mfa.recoveryCode')"
          :aria-invalid="expired || !!error"
          autocomplete="off"
          inputmode="text"
          :maxlength="64"
          :disabled="busy || completing || expired || !prompt"
          autofocus
        />
        <MFACodeInput
          v-else
          :id="codeId"
          ref="input"
          :model-value="code"
          :label="$t('mfa.code')"
          :feedback="
            expired || error ? 'failure' : verified ? 'success' : 'idle'
          "
          :disabled="busy || completing || expired || !prompt"
          autofocus
          @update:model-value="updateCode"
        />
      </Form.Item>
      <Button
        type="primary"
        html-type="submit"
        block
        class="mfa-login-submit"
        :loading="busy || completing"
        :disabled="expired || !prompt"
        >
{{
          $t(useRecovery ? 'mfa.recoverAuthenticator' : 'mfa.verify')
        }}
</Button>
    </Form>
    <div class="mfa-login-actions">
      <Button type="text" :disabled="busy || completing" @click="cancel">
<span class="mfa-login-back"><ArrowLeft aria-hidden="true" />{{ $t('mfa.backToLogin') }}</span>
</Button>
      <Button
        type="link"
        :disabled="busy || completing || expired"
        @click="switchMethod"
        >
{{
          $t(useRecovery ? 'mfa.useAuthenticator' : 'mfa.useRecovery')
        }}
</Button>
    </div>
  </section>
</template>

<style scoped>
.mfa-login-page {
  width: 100%;
  max-width: 384px;
  margin: 0 auto;
  color: hsl(var(--foreground));
}
.mfa-login-steps {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0;
  margin: 0 0 30px;
  list-style: none;
  font-size: 12px;
}
.mfa-login-steps li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mfa-login-steps li:first-child {
  flex: 1;
}
.mfa-login-steps li:first-child::after {
  height: 1px;
  flex: 1;
  margin-left: 8px;
  background: hsl(var(--border));
  content: '';
}
.mfa-login-step-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.is-complete .mfa-login-step-icon {
  color: hsl(var(--success));
  background: hsl(var(--success) / 15%);
}
.is-current {
  color: hsl(var(--primary));
}
.is-current .mfa-login-step-icon {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
}
.mfa-login-step-icon :deep(svg) {
  display: block;
  width: 13px;
  height: 13px;
}
.mfa-login-page h1 {
  margin: 0 0 30px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.4px;
}
.mfa-login-help {
  margin: -16px 0 24px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.6;
}
.mfa-login-input {
  height: 49px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 14px;
}
.mfa-login-submit {
  height: 44px;
}
.mfa-login-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 18px;
}
.mfa-login-actions :deep(.ant-btn) {
  padding-inline: 0;
  font-size: 12px;
}
.mfa-login-actions :deep(.ant-btn-text) {
  color: hsl(var(--muted-foreground));
}
.mfa-login-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mfa-login-back :deep(svg) {
  display: block;
  width: 14px;
  height: 14px;
}
</style>
