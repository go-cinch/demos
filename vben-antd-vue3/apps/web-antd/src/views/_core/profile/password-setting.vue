<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';
import type { AuthApi } from '#/api';

import { computed, markRaw, ref } from 'vue';

import { ProfilePasswordSetting, z } from '@vben/common-ui';
import { $placeholder } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

import {
  changePasswordApi,
  getPasswordChangeFailure,
  refreshPasswordChangeCaptchaApi,
  verifyPasswordChangeCaptchaApi,
} from '#/api';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import { isValidUserPassword } from '#/user-validation';

import LoginPointCaptcha from '../authentication/login-point-captcha.vue';

interface PasswordSettingExpose {
  getFormApi: () => {
    reset: () => Promise<void>;
  };
}

const emit = defineEmits<{ cancel: []; busy: [value: boolean] }>();
const authStore = useAuthStore();
const { hasButton } = usePermissions();
const passwordSettingRef = ref<PasswordSettingExpose>();
const submitting = ref(false);
const passwordCaptcha = ref<AuthApi.PointCaptchaChallenge>();

const formSchema = computed((): VbenFormSchema[] => {
  const schema: VbenFormSchema[] = [
    {
      fieldName: 'oldPassword',
      label: $t('page.profile.password.oldPassword'),
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $placeholder(
          'page.profile.password.oldPasswordPlaceholder',
        ),
      },
      rules: z.string().refine(isValidUserPassword, {
        message: $t('app.validation.currentPassword'),
      }),
    },
    {
      fieldName: 'newPassword',
      label: $t('page.profile.password.newPassword'),
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $placeholder(
          'page.profile.password.newPasswordPlaceholder',
        ),
      },
      dependencies: {
        resolve: ({ values }) => ({
          componentProps: { passwordStrength: !!values.newPassword },
        }),
        triggerFields: ['newPassword'],
      },
      rules: z.string().refine(isValidUserPassword, {
        message: $t('app.validation.password'),
      }),
    },
    {
      fieldName: 'confirmPassword',
      label: $t('page.profile.password.confirmPassword'),
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $placeholder(
          'page.profile.password.confirmPasswordPlaceholder',
        ),
      },
      dependencies: {
        rules(values) {
          const { newPassword } = values;
          return z
            .string({
              error: $t('page.profile.password.confirmPasswordPlaceholder'),
            })
            .min(1, {
              message: $t('page.profile.password.confirmPasswordPlaceholder'),
            })
            .refine((value) => value === newPassword, {
              message: $t('page.profile.password.passwordMismatch'),
            });
        },
        triggerFields: ['newPassword'],
      },
    },
  ];
  if (passwordCaptcha.value) {
    schema.push({
      component: markRaw(LoginPointCaptcha),
      componentProps: {
        captcha: passwordCaptcha.value,
        onRefresh: refreshPasswordCaptcha,
        onVerify: verifyPasswordCaptcha,
      },
      fieldName: 'captchaPoints',
      formFieldProps: {
        validateOn: [],
      },
      rules: z
        .unknown()
        .refine(
          (value) =>
            Array.isArray(value) &&
            value.length === passwordCaptcha.value?.target_count,
          { message: $t('app.validation.verification') },
        ),
    });
  }
  return schema;
});

async function refreshPasswordCaptcha() {
  const captchaId = passwordCaptcha.value?.captcha_id;
  if (!captchaId) return;
  passwordCaptcha.value = await refreshPasswordChangeCaptchaApi(captchaId);
}

async function verifyPasswordCaptcha(points: AuthApi.CaptchaPoint[]) {
  const captchaId = passwordCaptcha.value?.captcha_id;
  if (!captchaId) {
    return { verified: false } satisfies AuthApi.PointCaptchaVerificationResult;
  }
  const result = await verifyPasswordChangeCaptchaApi(captchaId, points);
  if (!result.verified) {
    passwordCaptcha.value = result.captcha;
  }
  return result;
}

async function handleSubmit(values: Recordable<any>) {
  if (submitting.value) return;
  try {
    submitting.value = true;
    emit('busy', true);
    await changePasswordApi({
      captchaId: passwordCaptcha.value?.captcha_id,
      captchaPoints: Array.isArray(values.captchaPoints)
        ? values.captchaPoints
        : undefined,
      newPassword: values.newPassword,
      oldPassword: values.oldPassword,
    });
    passwordCaptcha.value = undefined;
    await passwordSettingRef.value?.getFormApi().reset();
    message.success($t('page.profile.password.success'));
    await authStore.logout(false);
  } catch (error) {
    const failure = getPasswordChangeFailure(error);
    if (failure?.captcha_required && failure.captcha) {
      passwordCaptcha.value = failure.captcha;
    } else if (failure) {
      passwordCaptcha.value = undefined;
    }
    // The request client displays the backend or network error message.
  } finally {
    submitting.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <ProfilePasswordSetting
    v-if="hasButton('admin:btn:account:profile:change-password')"
    ref="passwordSettingRef"
    class="profile-password-form w-full"
    vertical
    :form-schema="formSchema"
    :loading="submitting"
    @submit="handleSubmit"
  >
    <template #actions
      ><Button type="text" :disabled="submitting" @click="emit('cancel')">{{
        $t('common.cancel')
      }}</Button></template
    >
  </ProfilePasswordSetting>
</template>

<style scoped>
/* Let validation messages grow with their field, including wrapped translations. */
.profile-password-form :deep([data-slot='form-item']) {
  align-items: stretch;
  padding-bottom: 20px;
}

.profile-password-form :deep([data-slot='form-label']) {
  min-height: 0;
  padding-bottom: 6px;
}

.profile-password-form :deep([data-slot='form-message']) {
  position: static;
  margin-top: 8px;
  line-height: 20px;
}

.profile-password-form :deep(> button[type='submit']) {
  margin-inline: 0 12px;
  margin-top: 0;
}
</style>
