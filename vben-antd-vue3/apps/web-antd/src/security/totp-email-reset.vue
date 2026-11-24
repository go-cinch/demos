<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

import { Button, Form, InputPassword } from 'ant-design-vue';

import {
  confirmTOTPResetEmailApi,
  getMailboxCooldownApi,
  requestVerificationResetEmailApi,
} from '#/api/core/auth';
import { $t } from '#/locales';

import { emailBrowserUUID, useEmailCode } from './email-code';
import VerificationCodeInput from './verification-code-input.vue';
import { useVerificationError } from './verification-error';

const props = defineProps<{
  ticket: string;
  identifier: string;
  expired: boolean;
  titleId: string;
}>();
const emit = defineEmits<{
  back: [];
  verified: [result: Awaited<ReturnType<typeof confirmTOTPResetEmailApi>>];
}>();
const password = ref('');
const code = ref('');
const sent = ref(false);
const invalidAttempts = ref(0);
function clearFeedback() {
  failure.clear();
  invalidAttempts.value = 0;
}
const busy = ref(false);
const completed = ref(false);
const mailbox = useEmailCode();
const failure = useVerificationError();
let active = true;
onBeforeUnmount(() => {
  active = false;
  password.value = '';
  code.value = '';
});

const loading = ref(false);
const ready = ref(false);
let request = 0;
watch(
  () => [props.ticket, props.expired],
  async () => {
    const current = ++request;
    ready.value = false;
    if (props.expired) return;
    loading.value = true;
    try {
      const state = await getMailboxCooldownApi(
        emailBrowserUUID(),
        'totp_recovery',
        props.ticket,
      );
      if (!active || current !== request) return;
      mailbox.accept(state);
      ready.value = true;
    } catch (error) {
      if (active && current === request) failure.setCause(error);
    } finally {
      if (active && current === request) loading.value = false;
    }
  },
  { immediate: true },
);

async function submit() {
  if (
    props.expired ||
    !ready.value ||
    loading.value ||
    busy.value ||
    completed.value
  )
    return;
  const uuid = emailBrowserUUID();
  busy.value = true;
  failure.clear();
  try {
    if (sent.value) {
      const id = mailbox.state.value?.verification_id;
      if (!id || mailbox.expired.value || !/^\d{6}$/.test(code.value)) {
        failure.setKey('verification.codeRequired');
        return;
      }
      const result = await confirmTOTPResetEmailApi(
        props.ticket,
        props.identifier,
        uuid,
        id,
        code.value,
      );
      if (active) {
        completed.value = true;
        code.value = '';
        emit('verified', result);
      }
    } else {
      if (!password.value || mailbox.remaining.value > 0) return;
      const state = await requestVerificationResetEmailApi(
        props.ticket,
        props.identifier,
        password.value,
        uuid,
      );
      if (!active || props.expired) return;
      mailbox.accept(state);
      password.value = '';
      code.value = '';
      sent.value = true;
    }
  } catch (error) {
    if (active && !mailbox.acceptError(error)) failure.setCause(error);
  } finally {
    if (active) {
      if (sent.value && failure.message.value) invalidAttempts.value++;
      busy.value = false;
    }
  }
}
</script>

<template>
  <h1 :id="titleId">{{ $t('email-auth.resetAuthenticator') }}</h1>
  <p>
    {{ $t(sent ? 'email-auth.resetWarning' : 'email-auth.resetPasswordHint') }}
  </p>
  <Form layout="vertical" @submit.prevent="submit">
    <Form.Item
      :label="$t(sent ? 'email-auth.code' : 'email-auth.currentPassword')"
      :validate-status="expired || failure.message.value ? 'error' : undefined"
    >
      <VerificationCodeInput
        v-if="sent"
        v-model="code"
        :label="$t('email-auth.code')"
        :disabled="completed || busy || expired"
        :feedback="expired || failure.message.value ? 'failure' : 'idle'"
        :animation="invalidAttempts ? 'failure' : 'idle'"
        :animation-attempt="invalidAttempts"
        autofocus
        @update:model-value="clearFeedback"
      />
      <InputPassword
        v-else
        v-model:value="password"
        :aria-invalid="expired || !!failure.message.value"
        @change="clearFeedback"
        :aria-label="$t('email-auth.currentPassword')"
        autocomplete="current-password"
        :disabled="completed || busy || expired"
        autofocus
      />
      <span
        v-if="expired || failure.message.value"
        class="sr-only"
        role="alert"
        >{{
          expired ? $t('verification.loginExpired') : failure.message.value
        }}</span
      >
    </Form.Item>
    <Button
      type="primary"
      html-type="submit"
      block
      :loading="busy || completed || loading"
      :disabled="
        completed ||
        expired ||
        !ready ||
        loading ||
        (sent
          ? code.length !== 6 || mailbox.expired.value
          : !password || mailbox.remaining.value > 0)
      "
      >{{ $t(sent ? 'email-auth.confirmReset' : 'email-auth.send') }}</Button
    >
    <Button
      v-if="sent || mailbox.remaining.value"
      type="link"
      :disabled="busy || expired || mailbox.remaining.value > 0"
      @click="
        sent = false;
        code = '';
        clearFeedback();
      "
      >{{
        mailbox.remaining.value
          ? $t('email-auth.countdown', { seconds: mailbox.remaining.value })
          : $t('email-auth.resend')
      }}</Button
    >
    <Button type="link" :disabled="completed || busy" @click="emit('back')">{{
      $t('verification.useAuthenticator')
    }}</Button>
  </Form>
</template>
