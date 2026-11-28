<script setup lang="ts">
import type { AuthApi, EmailCodeStatus } from '#/api/core/auth';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

import { VbenButton, VbenInput } from '@vben/common-ui';
import { userCache } from '@vben/utils/cache';

import { refAutoReset, useDebounceFn } from '@vueuse/core';
import { Button, Form, Input } from 'ant-design-vue';

import {
  bindEmailApi,
  getBindEmailCodeStatusApi,
  sendBindEmailCodeApi,
} from '#/api/core/auth';
import { requestErrorMessage } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { $t } from '#/locales';

import { isValidEmailAddress } from './email-address';
import EmailCodeLabel from './email-code-label.vue';
import { emailBrowserUUID, useEmailCode } from './email-code';
import VerificationCodeInput from './verification-code-input.vue';
import { VerificationCancelled } from './verification-prompt';
import { useVerificationTip } from './verification-tip';

const props = defineProps<{
  disabled?: boolean;
  draftUserId?: string;
  inline?: boolean;
  complete: (result: AuthApi.LoginResult, address: string) => Promise<void>;
  currentSession: () => boolean;
}>();
const emit = defineEmits<{ cancel: []; busy: [boolean] }>();
const address = ref('');
const code = ref('');
const addressInput = ref<{ focus: () => void }>();
const inlineCode = ref<InstanceType<typeof VerificationCodeInput>>();
const stage = ref<'address' | 'code'>('address');
const action = ref<'bind' | 'send'>();
const busy = computed(() => !!action.value || props.disabled);
const addressInvalid = ref(false);
const invalidAttempts = ref(0);
const { showUnconfirmedDelivery, TipHolder } = useVerificationTip();
const failure = shallowRef<unknown>();
const failureField = ref<'address' | 'code'>('address');
const errorKeys: Record<string, string> = {
  AUTH_EMAIL_ADDRESS_INVALID: 'email-auth.emailRequired',
  AUTH_EMAIL_COOLDOWN: 'email-auth.throttled',
  AUTH_EMAIL_OCCUPIED: 'email-auth.unavailableAddress',
  AUTH_EMAIL_UNAVAILABLE: 'email-auth.deliveryUnavailable',
};
const error = computed(() => {
  if (!failure.value) return '';
  const key = errorKeys[errorCode(failure.value) ?? ''];
  return key
    ? $t(key)
    : requestErrorMessage(failure.value, $t('email-auth.requestFailed'));
});
function errorCode(cause: unknown) {
  return (cause as { response?: { data?: { error_code?: string } } })?.response
    ?.data?.error_code;
}
const emailCode = useEmailCode();
const { remaining } = emailCode;
const addressValid = computed(() => isValidEmailAddress(address.value));
const hasCode = computed(
  () => stage.value === 'code' && !!emailCode.state.value?.verification_id,
);
const codeExpired = computed(() => hasCode.value && emailCode.expired.value);
const showExpiryHint = refAutoReset(false, 3000);
watch(codeExpired, (expired) => {
  showExpiryHint.value = expired;
});
const canEnterCode = computed(
  () => hasCode.value && !emailCode.expired.value && !busy.value,
);
const codeError = computed(() => {
  if (codeExpired.value) return $t('email-auth.expired');
  if (failureField.value === 'code' && error.value) return error.value;
  return invalidAttempts.value ? $t('profile-center.incorrectEmailCode') : '';
});
const addressError = computed(() => {
  if (addressInvalid.value) return $t('email-auth.emailRequired');
  return failureField.value === 'address' ? error.value : '';
});

function updateInlineCode(value: string) {
  code.value = value;
  invalidAttempts.value = 0;
  if (failureField.value === 'code') failure.value = undefined;
}
const primaryLabel = computed(() => {
  if (stage.value === 'code') {
    return $t('email-auth.bind');
  }
  if (remaining.value) {
    return $t('email-auth.countdown', { seconds: remaining.value });
  }
  return $t('email-auth.send');
});
const draftCache = userCache.current('session');
const storageKey = `email-binding/${props.draftUserId ?? ''}`;
let epoch = 0;
let active = true;
let hydrating = true;
onBeforeUnmount(() => {
  active = false;
  epoch++;
});

onMounted(async () => {
  if (props.draftUserId) {
    try {
      draftCache.migrate(
        storageKey,
        'cinch-email-binding-context',
        (raw) => JSON.parse(raw)?.userID === props.draftUserId,
      );
      const saved = draftCache.get<{ userID: string; address: string }>(
        storageKey,
      );
      if (
        saved?.userID === props.draftUserId &&
        typeof saved.address === 'string'
      )
        address.value = saved.address;
    } catch {
      /* The draft is optional. */
    }
    await nextTick();
  }
  await restore();
  hydrating = false;
});

async function restore() {
  if (
    !active ||
    busy.value ||
    (!props.inline && !props.draftUserId) ||
    stage.value !== 'address' ||
    (address.value.trim() !== '' && !addressValid.value)
  )
    return;
  const request = ++epoch;
  try {
    const status = await getBindEmailCodeStatusApi(
      emailBrowserUUID(),
      address.value.trim(),
      { suppressErrorMessage: true },
    );
    if (!active || request !== epoch) return;
    emailCode.accept(status);
    if (
      address.value.trim() &&
      status.verification_id &&
      !emailCode.expired.value
    )
      stage.value = 'code';
  } catch (error) {
    if (!props.inline && active && request === epoch)
      showRequestErrorToast(error);
  }
}
const scheduleRestore = useDebounceFn(restore, 350);
watch(address, () => {
  epoch++;
  emailCode.clearVerification();
  failureField.value = 'address';
  code.value = '';
  invalidAttempts.value = 0;
  addressInvalid.value = false;
  failure.value = undefined;
  stage.value = 'address';
  if (props.draftUserId) {
    try {
      draftCache.setItem(
        storageKey,
        JSON.stringify({ userID: props.draftUserId, address: address.value }),
      );
    } catch {
      /* Optional. */
    }
  }
  if (!hydrating) void scheduleRestore();
});
async function editAddress() {
  stage.value = 'address';
  code.value = '';
  invalidAttempts.value = 0;
  failure.value = undefined;
  await nextTick();
  addressInput.value?.focus();
}
async function send() {
  if (busy.value || remaining.value > 0) return;
  if (!addressValid.value) {
    addressInvalid.value = true;
    addressInput.value?.focus();
    return;
  }
  const request = ++epoch;
  const previousId = emailCode.state.value?.verification_id;
  const email = address.value.trim();
  action.value = 'send';
  failureField.value = 'address';
  emit('busy', true);
  failure.value = undefined;
  try {
    const uuid = emailBrowserUUID();
    let status: EmailCodeStatus | undefined;
    let deliveryFailure: undefined | { cause: unknown };
    try {
      status = await sendBindEmailCodeApi({ browser_uuid: uuid, email });
    } catch (error) {
      if (!active || request !== epoch) return;
      const httpStatus = (error as { response?: { status?: number } })?.response
        ?.status;
      if (httpStatus && httpStatus !== 502 && httpStatus !== 504) throw error;

      // A lost response doesn't tell us whether the send request was queued.
      // Re-read the same ticket without sending another email.
      deliveryFailure = { cause: error };
      status = await getBindEmailCodeStatusApi(uuid, email, {
        suppressErrorMessage: true,
      }).catch(() => undefined);
    }
    if (!active || request !== epoch) return;
    if (status) emailCode.accept(status);
    if (
      deliveryFailure &&
      (!status?.verification_id ||
        status.verification_id === previousId ||
        emailCode.expired.value)
    ) {
      showUnconfirmedDelivery(deliveryFailure.cause);
      return;
    }
    code.value = '';
    invalidAttempts.value = 0;
    stage.value = 'code';
    if (props.inline) void nextTick(() => inlineCode.value?.focus());
  } catch (error) {
    if (!active || request !== epoch) return;
    if (!emailCode.acceptError(error)) {
      if (
        errorKeys[errorCode(error) ?? ''] &&
        (props.inline || stage.value === 'address')
      )
        failure.value = error;
      else showRequestErrorToast(error);
    }
  } finally {
    if (active && request === epoch) {
      action.value = undefined;
      emit('busy', false);
    }
  }
}
function clearDraft() {
  if (!props.draftUserId) return;
  try {
    draftCache.removeItem(storageKey);
  } catch {
    /* Storage is optional. */
  }
}
function cancel() {
  clearDraft();
  emit('cancel');
}
async function submit() {
  if (busy.value) return;
  if (props.inline && (!canEnterCode.value || !/^\d{6}$/.test(code.value)))
    return;
  if (stage.value === 'address') return send();
  const id = emailCode.state.value?.verification_id;
  if (!/^\d{6}$/.test(code.value) || !id || emailCode.expired.value) {
    invalidAttempts.value++;
    return;
  }
  action.value = 'bind';
  failureField.value = 'code';
  emit('busy', true);
  failure.value = undefined;
  const email = address.value.trim().toLowerCase();
  const isCurrent = props.currentSession;
  const pending = () => active && isCurrent();
  try {
    const result = await bindEmailApi(
      {
        browser_uuid: emailBrowserUUID(),
        email,
        verification_id: id,
        verification_code: code.value,
      },
      pending,
    );
    // A submitted bind may already have committed and rotated the current session.
    if (!isCurrent() || (!props.inline && !active)) return;
    clearDraft();
    await props.complete(result, email);
  } catch (error) {
    if (!active || error instanceof VerificationCancelled) return;
    invalidAttempts.value++;
    if (errorCode(error) !== 'AUTH_EMAIL_CODE_INVALID') failure.value = error;
  } finally {
    if (active) {
      action.value = undefined;
      emit('busy', false);
    }
  }
}
</script>

<template>
  <TipHolder />
  <form
    v-if="inline"
    class="profile-email-form w-full max-w-full"
    novalidate
    @submit.prevent="submit"
  >
    <div class="profile-field">
      <label for="binding-email">{{ $t('profile-center.emailAddress') }}</label>
      <div class="profile-control">
        <div class="address-controls">
          <VbenInput
            id="binding-email"
            v-model="address"
            autocomplete="email"
            inputmode="email"
            autocapitalize="none"
            :spellcheck="false"
            placeholder="name@example.com"
            :disabled="busy"
            :aria-invalid="!!addressError"
            :aria-describedby="
              addressError ? 'binding-address-error' : undefined
            "
            @blur="addressInvalid = !!address.trim() && !addressValid"
            @keydown.enter.prevent="send"
          />
          <VbenButton
            type="button"
            size="lg"
            variant="outline"
            :disabled="busy || !addressValid || remaining > 0"
            :loading="action === 'send'"
            @click="send"
          >
            {{
              remaining
                ? $t('email-auth.countdown', { seconds: remaining })
                : $t(hasCode ? 'email-auth.resend' : 'email-auth.send')
            }}
          </VbenButton>
        </div>
        <p
          v-if="addressError"
          id="binding-address-error"
          class="sr-only"
          role="alert"
        >
          {{ addressError }}
        </p>
      </div>
    </div>
    <div class="profile-field">
      <label for="binding-code">{{ $t('email-auth.code') }}</label>
      <div class="profile-control">
        <VerificationCodeInput
          id="binding-code"
          ref="inlineCode"
          compact
          name="email_binding_code"
          :model-value="code"
          :label="$t('email-auth.code')"
          :disabled="!canEnterCode"
          :feedback="codeError ? 'failure' : 'idle'"
          :animation="invalidAttempts ? 'failure' : 'idle'"
          :animation-attempt="invalidAttempts"
          :described-by="codeError ? 'binding-code-error' : undefined"
          @update:model-value="updateInlineCode"
        />
        <p
          v-if="codeError"
          id="binding-code-error"
          :class="showExpiryHint ? 'mt-1 text-sm text-destructive' : 'sr-only'"
          role="alert"
        >
          {{ codeError }}
        </p>
      </div>
    </div>
    <div class="profile-binding-actions">
      <VbenButton
        type="submit"
        class="profile-confirm"
        :loading="action === 'bind'"
        :disabled="!canEnterCode || code.length !== 6"
      >
        {{ $t('profile-center.confirmEmailBinding') }}
      </VbenButton>
      <VbenButton
        type="button"
        variant="ghost"
        :disabled="busy"
        @click="cancel"
        >{{ $t('common.cancel') }}</VbenButton
      >
    </div>
  </form>
  <Form v-else layout="vertical" novalidate @submit.prevent="submit">
    <Form.Item
      v-if="stage === 'address'"
      :label="$t('email-auth.email')"
      html-for="binding-email"
      :validate-status="addressError ? 'error' : undefined"
    >
      <Input
        id="binding-email"
        ref="addressInput"
        v-model:value="address"
        :aria-invalid="!!addressError"
        :aria-describedby="addressError ? 'binding-address-error' : undefined"
        autocomplete="email"
        inputmode="email"
        autocapitalize="none"
        :spellcheck="false"
        placeholder="name@example.com"
        :disabled="busy"
      />
      <span
        v-if="addressError"
        id="binding-address-error"
        class="sr-only"
        role="alert"
        >{{ addressError }}</span
      >
    </Form.Item>
    <template v-else>
      <EmailCodeLabel
        input-id="binding-code"
        :account="address"
        :disabled="busy"
        @change="editAddress"
      />
      <VerificationCodeInput
        id="binding-code"
        name="email_binding_code"
        :model-value="code"
        :label="$t('email-auth.code')"
        :feedback="codeError ? 'failure' : 'idle'"
        :animation="invalidAttempts ? 'failure' : 'idle'"
        :animation-attempt="invalidAttempts"
        :described-by="codeError ? 'binding-code-error' : undefined"
        :disabled="busy"
        autofocus
        @update:model-value="updateInlineCode"
      />
      <p
        v-if="codeError"
        id="binding-code-error"
        :class="showExpiryHint ? 'mt-1 text-sm text-destructive' : 'sr-only'"
        role="alert"
      >
        {{ codeError }}
      </p>
      <div class="email-binding-resend">
        <Button
          type="link"
          :loading="action === 'send'"
          :disabled="busy || remaining > 0"
          @click="send"
        >
          {{
            remaining
              ? $t('email-auth.countdown', { seconds: remaining })
              : $t('email-auth.resend')
          }}
        </Button>
      </div>
    </template>
    <div class="binding-actions">
      <Button
        type="primary"
        html-type="submit"
        block
        :loading="action === (stage === 'address' ? 'send' : 'bind')"
        :disabled="busy || (stage === 'address' && remaining > 0)"
      >
        {{ primaryLabel }}
      </Button>
    </div>
  </Form>
</template>

<style scoped>
.email-binding-resend {
  display: flex;
  justify-content: flex-end;
  margin: 14px 0 24px;
}

.email-binding-resend :deep(.ant-btn) {
  padding: 0;
}

.profile-field {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
}

.profile-field label {
  font-size: 13px;
}

.profile-control {
  min-width: 0;
}

.address-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.address-controls :deep(input) {
  flex: 1;
  min-width: 0;
}

.profile-binding-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.profile-confirm {
  margin: 0;
}

@media (max-width: 480px) {
  .address-controls {
    flex-wrap: wrap;
  }
}

.profile-field :deep(input[aria-invalid='true']) {
  border-color: hsl(var(--destructive));
}
</style>
