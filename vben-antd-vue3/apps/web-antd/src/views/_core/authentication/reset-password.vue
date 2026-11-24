<script setup lang="ts">
import type { FormProps } from 'ant-design-vue';

import { computed, reactive, ref, useId } from 'vue';

import { VbenPasswordStrength } from '@vben/common-ui';

import { Button, Form, FormItem, InputPassword } from 'ant-design-vue';

import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import { isValidUserPassword } from '#/user-validation';

import OnboardingSignOut from './onboarding-sign-out.vue';

const authStore = useAuthStore();
const submitting = ref(false);
const descriptionKey = computed(() => {
  if (authStore.passwordResetByAdmin) {
    return authStore.passwordResetSkipAllowed
      ? 'app.resetPassword.adminOptional'
      : 'app.resetPassword.adminRequired';
  }
  return authStore.passwordResetSkipAllowed
    ? 'app.resetPassword.optionalDescription'
    : 'app.resetPassword.description';
});
const errorId = useId();
const validationErrors = reactive<Record<string, string[]>>({});
const onValidate: NonNullable<FormProps['onValidate']> = (
  name,
  valid,
  messages,
) => {
  validationErrors[String(name)] = valid ? [] : (messages ?? []);
};
const form = ref({ newPassword: '', confirmPassword: '' });
const rules = computed<FormProps['rules']>(() => ({
  newPassword: [
    {
      validator: async (_rule: unknown, value: string) => {
        if (!isValidUserPassword(value || ''))
          throw new Error($t('app.validation.password'));
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    {
      validator: async (_rule: unknown, value: string) => {
        if (!value || value !== form.value.newPassword) {
          throw new Error($t('page.profile.password.passwordMismatch'));
        }
      },
      trigger: 'blur',
    },
  ],
}));

async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    await authStore.completePasswordReset(form.value.newPassword);
    form.value = { newPassword: '', confirmPassword: '' };
  } catch {
    // The request client displays the localized error.
  } finally {
    submitting.value = false;
  }
}
async function skip() {
  if (submitting.value || !authStore.passwordResetSkipAllowed) return;
  submitting.value = true;
  try {
    await authStore.skipOnboarding('password');
  } catch {
    /* The request client displays the localized error. */
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="reset-password-page">
    <h1 class="mb-3 text-2xl font-bold">{{ $t('app.resetPassword.title') }}</h1>
    <p class="text-muted-foreground mb-6">
      {{ $t(descriptionKey) }}
    </p>
    <Form
      :model="form"
      :rules="rules"
      layout="vertical"
      @finish="submit"
      @validate="onValidate"
    >
      <FormItem
        name="newPassword"
        :label="$t('page.profile.password.newPassword')"
      >
        <InputPassword
          v-model:value="form.newPassword"
          :aria-invalid="!!validationErrors.newPassword?.length"
          :aria-describedby="
            validationErrors.newPassword?.length
              ? `${errorId}-newPassword`
              : undefined
          "
          autocomplete="new-password"
          :disabled="submitting"
        />
        <template v-if="validationErrors.newPassword?.length" #help>
          <span :id="`${errorId}-newPassword`">{{
            validationErrors.newPassword?.join(' ')
          }}</span>
        </template>
        <VbenPasswordStrength :password="form.newPassword" />
      </FormItem>
      <FormItem
        name="confirmPassword"
        :label="$t('page.profile.password.confirmPassword')"
      >
        <InputPassword
          v-model:value="form.confirmPassword"
          :aria-invalid="!!validationErrors.confirmPassword?.length"
          :aria-describedby="
            validationErrors.confirmPassword?.length
              ? `${errorId}-confirmPassword`
              : undefined
          "
          autocomplete="new-password"
          :disabled="submitting"
        />
        <template v-if="validationErrors.confirmPassword?.length" #help>
          <span :id="`${errorId}-confirmPassword`">{{
            validationErrors.confirmPassword?.join(' ')
          }}</span>
        </template>
      </FormItem>
      <Button
        type="primary"
        html-type="submit"
        block
        :loading="submitting"
        :aria-busy="submitting"
      >
        {{ $t('app.resetPassword.submit') }}
      </Button>
      <Button
        v-if="authStore.passwordResetSkipAllowed"
        type="link"
        block
        class="mt-3"
        :disabled="submitting"
        @click="skip"
      >
        {{ $t('app.onboarding.skip') }}
      </Button>
    </Form>
    <OnboardingSignOut :disabled="submitting" />
  </div>
</template>

<style scoped>
.reset-password-page {
  width: 100%;
  max-width: 448px;
  margin-inline: auto;
}

.reset-password-page :deep(.ant-input-affix-wrapper) {
  min-height: 44px;
}

.reset-password-page :deep(form .ant-btn) {
  height: 44px;
}

.reset-password-page :deep(.ant-form-item) {
  margin-bottom: 24px;
}

/* Let the error's collapse animation set its height, as on the login form. */
.reset-password-page :deep(.ant-form-item-explain-connected + div),
.reset-password-page :deep(.ant-form-margin-offset) {
  display: none;
}
</style>
