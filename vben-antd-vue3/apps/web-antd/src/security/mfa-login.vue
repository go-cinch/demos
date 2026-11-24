<script setup lang="ts">
import type { AuthApi } from '#/api/core/auth';

import {
  computed,
  onBeforeUnmount,
  onDeactivated,
  ref,
  useId,
  watch,
} from 'vue';

import { Button, Form } from 'ant-design-vue';

import { completeTOTPLoginApi } from '#/api/core/auth';
import { $t } from '#/locales';

import AccountRecovery from './totp-account-recovery.vue';
import VerificationCodeInput from './verification-code-input.vue';
import { useVerificationError } from './verification-error';
import {
  cancelVerification,
  completeVerification,
  verificationPrompt,
} from './verification-prompt';

const props = defineProps<{
  completing?: boolean;
  identifier?: string;
  loginPassword?: string;
  emailLogin?: boolean;
  emailEnabled?: boolean;
}>();
const emit = defineEmits<{ verified: []; expired: [] }>();
const titleId = useId();
const codeId = useId();
const prompt = computed(() =>
  verificationPrompt.value?.mode === 'login'
    ? verificationPrompt.value
    : undefined,
);
const code = ref('');
const failure = useVerificationError();
const error = failure.message;
const codeFailures = ref(0);
const busy = ref(false);
const verified = ref(false);
const expired = ref(false);
const recoveryOpen = ref(false);
let submitTimer: ReturnType<typeof setTimeout> | undefined;
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
    recoveryOpen.value = false;
    clearTimeout(submitTimer);
    clearTimeout(expiryTimer);
    const deadline = prompt.value?.expiresAt;
    if (deadline !== undefined && Number.isFinite(deadline)) {
      expiryTimer = setTimeout(
        () => {
          if (prompt.value?.id === id) {
            expired.value = true;
            emit('expired');
          }
        },
        Math.max(0, deadline - Date.now()),
      );
    }
  },
  { immediate: true },
);

function cancel() {
  clearTimeout(submitTimer);
  clearTimeout(expiryTimer);
  if (prompt.value?.id === ownedPromptId) cancelVerification();
}
onBeforeUnmount(cancel);
onDeactivated(cancel);

function openRecovery() {
  clearTimeout(submitTimer);
  code.value = '';
  failure.clear();
  recoveryOpen.value = true;
}

function finishRecovery(id: number, session: AuthApi.LoginResult) {
  if (prompt.value?.id !== id) return;
  clearTimeout(expiryTimer);
  recoveryOpen.value = false;
  emit('verified');
  completeVerification(id, session);
}

function updateCode(value: string) {
  if (value !== code.value) failure.clear();
  code.value = value;
  clearTimeout(submitTimer);
  if (value.length === 6) submitTimer = setTimeout(() => void submit(), 100);
}

async function submit() {
  clearTimeout(submitTimer);
  const current = prompt.value;
  if (
    !current?.ticket ||
    recoveryOpen.value ||
    busy.value ||
    props.completing ||
    expired.value
  )
    return;
  const value = code.value.trim();
  if (!/^\d{6}$/.test(value)) {
    failure.setKey('verification.codeRequired');
    codeFailures.value++;
    return;
  }
  busy.value = true;
  failure.clear();
  try {
    const result = await completeTOTPLoginApi(current.ticket, value);
    if (prompt.value?.id !== current.id) return;
    clearTimeout(expiryTimer);
    verified.value = true;
    // Keep this inline step visible while the login store loads permissions
    // and plays the arrival animation; do not flash the password form again.
    emit('verified');
    completeVerification(current.id, result);
  } catch (error: unknown) {
    if (prompt.value?.id === current.id) {
      failure.setCause(error);
      codeFailures.value++;
    }
  } finally {
    if (prompt.value?.id === current.id) busy.value = false;
  }
}
</script>

<template>
  <section
    class="mfa-login-page"
    data-testid="mfa-login-step"
    data-mode="totp"
    :aria-labelledby="titleId"
  >
    <Button
      type="text"
      class="mfa-top-back"
      :disabled="busy || completing"
      @click="cancel"
      >‹ {{ $t('verification.backToLogin') }}</Button
    >
    <h1 :id="titleId">{{ $t('verification.loginTitle') }}</h1>
    <Form layout="vertical" @submit.prevent="submit">
      <Form.Item
        :html-for="codeId"
        :validate-status="expired || error ? 'error' : undefined"
      >
        <template #label
          ><span class="mfa-account-label"
            ><span>{{ $t('verification.code') }}</span
            ><span v-if="identifier" class="mfa-account-identity"
              >{{ $t('email-auth.account') }} <b>{{ identifier }}</b></span
            ></span
          ></template
        >
        <VerificationCodeInput
          :id="codeId"
          :model-value="code"
          :label="$t('verification.code')"
          :described-by="expired || error ? `${codeId}-error` : undefined"
          :animation="error ? 'failure' : 'idle'"
          :animation-attempt="codeFailures"
          :feedback="
            expired || error ? 'failure' : verified ? 'success' : 'idle'
          "
          :disabled="busy || completing || expired || !prompt"
          autofocus
          @update:model-value="updateCode"
        />
        <span
          v-if="expired || error"
          :id="`${codeId}-error`"
          class="sr-only"
          role="alert"
          >{{ expired ? $t('verification.loginExpired') : error }}</span
        >
      </Form.Item>
      <Button
        type="primary"
        html-type="submit"
        block
        class="mfa-login-submit"
        :loading="busy || completing"
        :disabled="expired || !prompt"
      >
        {{ $t('verification.verify') }}
      </Button>
    </Form>
    <div class="mfa-login-actions">
      <Button
        type="text"
        aria-haspopup="dialog"
        :disabled="busy || completing || expired || !prompt"
        @click="openRecovery"
      >
        {{ $t('verification.authenticatorUnavailable') }}
      </Button>
    </div>
    <AccountRecovery
      v-if="recoveryOpen && prompt?.ticket"
      :key="prompt.id"
      :expired="expired"
      :login="{
        id: prompt.id,
        ticket: prompt.ticket,
        identifier: identifier || '',
        emailLogin: !!emailLogin,
        password: loginPassword,
      }"
      @close="recoveryOpen = false"
      @restart-login="cancel"
      @verified="finishRecovery"
    />
  </section>
</template>

<style scoped>
.mfa-top-back {
  padding: 0;
  margin-bottom: 22px;
  color: hsl(var(--muted-foreground));
}

.mfa-account-label {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
}

.mfa-account-identity {
  margin-left: auto;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.mfa-account-identity b {
  font-weight: 500;
  color: hsl(var(--foreground));
}

.mfa-login-page :deep(.ant-form-item-label > label) {
  width: 100%;
}

.mfa-login-page {
  width: 100%;
  max-width: 384px;
  margin: 0 auto;
  color: hsl(var(--foreground));
}

.mfa-login-page h1 {
  margin: 0 0 30px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.4px;
}

.mfa-login-page :deep(.ant-form-item) {
  margin-bottom: 24px;
}

.mfa-login-page :deep(.ant-form-item-explain-connected + div),
.mfa-login-page :deep(.ant-form-margin-offset) {
  display: none;
}

.mfa-login-submit {
  height: 44px;
}

.mfa-login-actions {
  margin-top: 12px;
  text-align: center;
}

.mfa-login-actions button {
  color: hsl(var(--muted-foreground));
}
</style>
