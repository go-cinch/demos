<script setup lang="ts">
import type { FormProps } from 'ant-design-vue';

import { computed, ref } from 'vue';

import { Button, Form, FormItem, InputPassword } from 'ant-design-vue';

import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import { isValidUserPassword } from '#/user-validation';

const authStore = useAuthStore();
const submitting = ref(false);
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
</script>

<template>
  <div>
    <h1 class="mb-3 text-2xl font-bold">{{ $t('app.resetPassword.title') }}</h1>
    <p class="text-muted-foreground mb-6">
      {{ $t('app.resetPassword.description') }}
    </p>
    <Form :model="form" :rules="rules" layout="vertical" @finish="submit">
      <FormItem
        name="newPassword"
        :label="$t('page.profile.password.newPassword')"
      >
        <InputPassword
          v-model:value="form.newPassword"
          autocomplete="new-password"
          :disabled="submitting"
        />
      </FormItem>
      <FormItem
        name="confirmPassword"
        :label="$t('page.profile.password.confirmPassword')"
      >
        <InputPassword
          v-model:value="form.confirmPassword"
          autocomplete="new-password"
          :disabled="submitting"
        />
      </FormItem>
      <Button type="primary" html-type="submit" block :loading="submitting">
        {{ $t('app.resetPassword.submit') }}
      </Button>
      <Button
        class="mt-3"
        block
        :disabled="submitting"
        @click="authStore.logout(false)"
      >
        {{ $t('app.resetPassword.logout') }}
      </Button>
    </Form>
  </div>
</template>
