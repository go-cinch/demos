<script setup lang="ts">
import type { AuthApi } from '#/api/core/auth';

import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

import { Mail, ShieldCheck } from '@vben/icons';

import {
  Button,
  Form,
  Input,
  InputPassword,
  Modal,
  Skeleton,
} from 'ant-design-vue';

import {
  confirmAccountResetApi,
  confirmTOTPResetEmailApi,
  getLoginRecoveryOptionsApi,
  getMailboxCooldownApi,
  getSensitiveOptionsApi,
  recoverTOTPLoginApi,
  requestVerificationResetEmailApi,
  sendAccountResetEmailApi,
} from '#/api/core/auth';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

import { emailBrowserUUID, useEmailCode } from './email-code';
import SecurityMethodCard from './security-method-card.vue';
import { setTOTPEnrollmentSource } from './totp-enrollment-context';
import VerificationCodeInput from './verification-code-input.vue';
import {
  isVerificationPasswordError,
  useVerificationError,
} from './verification-error';
import { useVerificationTip } from './verification-tip';

const props = withDefaults(
  defineProps<{
    allowEmail?: boolean;
    expired?: boolean;
    login?: {
      id: number;
      ticket: string;
      identifier: string;
      emailLogin: boolean;
      password?: string;
    };
  }>(),
  { login: undefined, allowEmail: true },
);
const emit = defineEmits<{
  close: [];
  restartLogin: [];
  verified: [id: number, session: AuthApi.LoginResult];
}>();
const auth = props.login ? undefined : useAuthStore();
const step = ref<'choose' | 'code' | 'recovery' | 'send'>('choose');
const address = ref('');
const code = ref('');
const password = ref('');
const needsPassword = computed(
  () =>
    props.login &&
    (step.value === 'send'
      ? !props.login.password
      : step.value === 'recovery' && props.login.emailLogin),
);
const passwordId = useId();
const passwordError = ref(false);
const recoveryControl = ref<HTMLDivElement>();
const recoveryAttempts = ref(0);
const emailAttempts = ref(0);
watch(
  recoveryAttempts,
  (attempt) => {
    if (attempt < 2) return;
    for (const animation of recoveryControl.value?.getAnimations?.() ?? []) {
      if ('animationName' in animation) animation.currentTime = 0;
    }
  },
  { flush: 'post' },
);
const busy = ref(false);
const loading = ref(false);
const optionsFailed = ref(false);
const mailbox = useEmailCode();
const failure = useVerificationError();
const fieldError = failure.message;
const { showExpired, showFailure, TipHolder } = useVerificationTip();
const fieldId = useId();
const formId = useId();
const title = computed(() => {
  let messageKey = 'email-auth.resetAuthenticator';
  if (step.value === 'choose') {
    messageKey = 'verification.authenticatorUnavailable';
  } else if (step.value === 'recovery') {
    messageKey = 'verification.chooseRecovery';
  }
  return $t(messageKey);
});

function clearFeedback() {
  failure.clear();
  passwordError.value = false;
  recoveryAttempts.value = 0;
  emailAttempts.value = 0;
}

let optionsRequest = 0;
async function load() {
  const request = ++optionsRequest;
  address.value = '';
  optionsFailed.value = false;
  clearFeedback();
  if (props.expired) {
    loading.value = false;
    await nextTick();
    if (request === optionsRequest) showExpired();
    return;
  }
  loading.value = true;
  try {
    const options = props.login
      ? await getLoginRecoveryOptionsApi(props.login.ticket)
      : await getSensitiveOptionsApi('totp_recovery');
    if (request === optionsRequest) address.value = options.address;
  } catch (error) {
    if (request === optionsRequest) {
      optionsFailed.value = true;
      showFailure(error);
    }
  } finally {
    if (request === optionsRequest) loading.value = false;
  }
}
watch(
  () => [props.login?.ticket, props.expired, props.allowEmail],
  () => {
    step.value = 'choose';
    mailbox.reset();
    void load();
  },
  { immediate: true },
);
let cooldownRequest = 0;
const loadingCooldown = ref(false);
const cooldownReady = ref(false);
async function loadCooldown() {
  const request = ++cooldownRequest;
  loadingCooldown.value = true;
  cooldownReady.value = false;
  failure.clear();
  try {
    const state = await getMailboxCooldownApi(
      emailBrowserUUID(),
      'totp_recovery',
      props.login?.ticket,
    );
    if (request !== cooldownRequest) return;
    mailbox.accept(state);
    cooldownReady.value = true;
  } catch (error) {
    if (request === cooldownRequest) showFailure(error);
  } finally {
    if (request === cooldownRequest) loadingCooldown.value = false;
  }
}
watch(
  () => [step.value, props.login?.ticket],
  () => {
    cooldownRequest++;
    loadingCooldown.value = false;
    cooldownReady.value = false;
    if (step.value === 'send' && !props.expired) void loadCooldown();
  },
);
onBeforeUnmount(() => {
  optionsRequest++;
  cooldownRequest++;
});

function select(next: typeof step.value) {
  clearFeedback();
  code.value = '';
  password.value = '';
  step.value = next;
}

async function submit() {
  if (
    busy.value ||
    loadingCooldown.value ||
    props.expired ||
    step.value === 'choose'
  )
    return;
  if (step.value === 'send' && !cooldownReady.value) {
    await loadCooldown();
    return;
  }
  if (needsPassword.value && !password.value.trim()) {
    passwordError.value = true;
    failure.setKey('email-auth.passwordRequired');
    return;
  }
  const login = props.login;
  const isCurrent = auth?.captureSession();
  busy.value = true;
  failure.clear();
  passwordError.value = false;
  try {
    if (step.value === 'send') {
      if (mailbox.remaining.value > 0) return;
      const uuid = emailBrowserUUID();
      const ticket = login
        ? await requestVerificationResetEmailApi(
            login.ticket,
            login.identifier,
            login.password || password.value,
            uuid,
          )
        : await sendAccountResetEmailApi(uuid);
      mailbox.accept(ticket);
      select('code');
      return;
    }
    const value = code.value.trim();
    if (!value) {
      failure.setKey('verification.required');
      return;
    }
    let proof;
    if (step.value === 'recovery') {
      proof = value;
    } else {
      const id = mailbox.state.value?.verification_id;
      if (!id || mailbox.expired.value) {
        failure.setKey('verification.emailExpired');
        return;
      }
      if (!/^\d{6}$/.test(value)) {
        failure.setKey('verification.codeRequired');
        return;
      }
      proof = {
        browser_uuid: emailBrowserUUID(),
        verification_id: id,
        verification_code: value,
      };
    }
    if (login) {
      let session: AuthApi.LoginResult;
      if (typeof proof === 'string') {
        session = login.emailLogin
          ? await recoverTOTPLoginApi(
              login.ticket,
              proof,
              login.identifier,
              password.value,
            )
          : await recoverTOTPLoginApi(login.ticket, proof);
      } else {
        session = await confirmTOTPResetEmailApi(
          login.ticket,
          login.identifier,
          proof.browser_uuid,
          proof.verification_id,
          proof.verification_code,
        );
      }
      setTOTPEnrollmentSource('recovery');
      emit('verified', login.id, session);
      return;
    }
    const session = await confirmAccountResetApi(proof);
    if (auth && isCurrent?.()) {
      setTOTPEnrollmentSource('recovery');
      await auth.acceptSession(session);
      await auth.requireTOTPEnrollment();
      emit('close');
    }
  } catch (error) {
    if (props.expired) return;
    passwordError.value =
      !!needsPassword.value && isVerificationPasswordError(error);
    if (step.value === 'send' && mailbox.acceptError(error)) return;
    if (step.value === 'send' && !passwordError.value) showFailure(error);
    else failure.setCause(error);
  } finally {
    if (failure.message.value && !passwordError.value) {
      if (step.value === 'recovery') recoveryAttempts.value++;
      if (step.value === 'code') emailAttempts.value++;
    }
    busy.value = false;
  }
}
</script>

<template>
  <TipHolder />
  <Modal
    open
    :width="492"
    :closable="!busy"
    :keyboard="!busy"
    :mask-closable="!busy"
    @cancel="emit('close')"
  >
    <template #title>
      <span class="recovery-title"
        ><span class="title-icon"
          ><ShieldCheck :size="20" aria-hidden="true" /></span
        >{{ title }}</span
      >
    </template>
    <div v-if="step === 'choose'" class="methods">
      <p>{{ $t('verification.resetMethod') }}</p>
      <SecurityMethodCard
        action
        :title="$t('verification.chooseRecovery')"
        :description="$t('verification.savedRecoveryHint')"
        :disabled="expired"
        @click="select('recovery')"
      >
        <template #icon><ShieldCheck /></template>
      </SecurityMethodCard>
      <Skeleton v-if="loading" active :paragraph="false" />
      <SecurityMethodCard
        v-else-if="address && allowEmail"
        action
        :title="$t('email-auth.resetAuthenticator')"
        :description="
          address
            ? $t('verification.sendTo', { email: address })
            : $t('verification.sendToBoundEmail')
        "
        @click="
          select(
            mailbox.state.value?.verification_id && !mailbox.expired.value
              ? 'code'
              : 'send',
          )
        "
      >
        <template #icon><Mail /></template>
      </SecurityMethodCard>
    </div>
    <Form v-else :id="formId" layout="vertical" @submit.prevent="submit">
      <Form.Item
        v-if="needsPassword"
        :label="$t('email-auth.currentPassword')"
        :html-for="passwordId"
        :validate-status="passwordError ? 'error' : undefined"
      >
        <InputPassword
          :id="passwordId"
          v-model:value="password"
          :aria-invalid="passwordError"
          :aria-describedby="passwordError ? `${passwordId}-error` : undefined"
          autocomplete="current-password"
          :disabled="busy || expired"
          @change="clearFeedback"
        />
        <span
          v-if="passwordError"
          :id="`${passwordId}-error`"
          class="sr-only"
          role="alert"
          >{{ fieldError }}</span
        >
      </Form.Item>
      <SecurityMethodCard
        v-if="step === 'send'"
        :title="$t('verification.boundEmail')"
        :description="address || $t('verification.sendToBoundEmail')"
      >
        <template #icon><Mail /></template>
      </SecurityMethodCard>
      <template v-else>
        <Form.Item
          :label="
            $t(
              step === 'recovery'
                ? 'verification.recoveryCode'
                : 'verification.emailCode',
            )
          "
          :html-for="fieldId"
          :validate-status="fieldError && !passwordError ? 'error' : undefined"
        >
          <div
            v-if="step === 'recovery'"
            ref="recoveryControl"
            class="recovery-control"
            :class="{ 'is-shaking': fieldError && !passwordError }"
          >
            <Input
              :id="fieldId"
              v-model:value="code"
              class="recovery-input"
              :aria-invalid="!!fieldError && !passwordError"
              autofocus
              autocomplete="off"
              :maxlength="128"
              :disabled="busy"
              @change="clearFeedback"
            />
          </div>
          <VerificationCodeInput
            v-else
            :id="fieldId"
            v-model="code"
            :label="$t('verification.emailCode')"
            :disabled="busy"
            :feedback="fieldError && !passwordError ? 'failure' : 'idle'"
            :animation="emailAttempts ? 'failure' : 'idle'"
            :animation-attempt="emailAttempts"
            autofocus
            @update:model-value="clearFeedback"
          />
          <span
            v-if="fieldError && !passwordError"
            class="sr-only"
            role="alert"
            >{{ fieldError }}</span
          >
        </Form.Item>
        <div v-if="step === 'code'" class="delivery">
          <span>{{
            address
              ? $t('verification.sentTo', { email: address })
              : $t('verification.sentToBoundEmail')
          }}</span>
          <Button
            type="link"
            :disabled="busy || mailbox.remaining.value > 0"
            @click="select('send')"
            >{{
              mailbox.remaining.value
                ? $t('verification.resendAfter', {
                    seconds: mailbox.remaining.value,
                  })
                : $t('verification.resend')
            }}</Button
          >
        </div>
        <p v-if="step === 'code'" class="warning">
          {{ $t('email-auth.resetWarning') }}
        </p>
      </template>
    </Form>
    <template #footer>
      <div class="recovery-footer">
        <Button v-if="expired" type="primary" @click="emit('restartLogin')">{{
          $t('verification.backToLogin')
        }}</Button>
        <template v-else-if="step === 'choose'">
          <Button @click="emit('close')">{{ $t('common.cancel') }}</Button>
          <Button
            v-if="optionsFailed"
            type="primary"
            data-testid="recovery-retry-methods"
            @click="load"
            >{{ $t('verification.retry') }}</Button
          >
        </template>
        <template v-else>
          <Button :disabled="busy" @click="select('choose')">{{
            $t('email-auth.backUnlink')
          }}</Button>
          <Button
            type="primary"
            html-type="submit"
            :form="formId"
            :loading="busy || loadingCooldown"
            :disabled="
              expired ||
              loadingCooldown ||
              (step === 'send' && mailbox.remaining.value > 0)
            "
          >
            {{
              step === 'send'
                ? !cooldownReady
                  ? $t('verification.retry')
                  : mailbox.remaining.value
                    ? $t('verification.resendAfter', {
                        seconds: mailbox.remaining.value,
                      })
                    : $t('verification.confirmSend')
                : $t('email-auth.confirmReset')
            }}
          </Button>
        </template>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.recovery-title,
.delivery,
.recovery-footer {
  display: flex;
  gap: 8px;
  align-items: center;
}

.recovery-title {
  gap: 12px;
  margin-bottom: 16px;
}

.title-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
  border-radius: var(--radius);
}

.methods {
  display: grid;
  gap: 10px;
}

.methods p,
.warning {
  margin: 0;
  color: hsl(var(--muted-foreground));
}

.recovery-control.is-shaking {
  animation: recovery-code-failure 400ms ease-in-out both;
}

@keyframes recovery-code-failure {
  0%,
  100% {
    transform: translateX(0);
  }

  25%,
  75% {
    transform: translateX(-3px);
  }

  50% {
    transform: translateX(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .recovery-control.is-shaking {
    animation: none;
  }
}

.recovery-input {
  height: 49px;
  font:
    14px ui-monospace,
    monospace;
}

.delivery {
  justify-content: space-between;
  margin-top: -16px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.delivery button {
  padding-inline: 0;
}

.warning {
  margin-top: 10px;
  font-size: 13px;
}

.recovery-footer {
  flex-wrap: wrap;
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 20px;
  border-top: 1px solid hsl(var(--border));
}
</style>
