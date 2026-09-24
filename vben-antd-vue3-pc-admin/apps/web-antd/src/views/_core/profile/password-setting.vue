<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';
import type { AuthApi } from '#/api';

import { computed, markRaw, ref } from 'vue';

import { ProfilePasswordSetting, z } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import {
  changePasswordApi,
  getPasswordChangeFailure,
  refreshPasswordChangeCaptchaApi,
  verifyPasswordChangeCaptchaApi,
} from '#/api';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

import LoginPointCaptcha from '../authentication/login-point-captcha.vue';

interface PasswordSettingExpose {
  getFormApi: () => {
    reset: () => Promise<void>;
  };
}

const authStore = useAuthStore();
const passwordSettingRef = ref<PasswordSettingExpose>();
const submitting = ref(false);
const passwordCaptcha = ref<AuthApi.PointCaptchaChallenge>();

function passwordByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

const formSchema = computed((): VbenFormSchema[] => {
  const schema: VbenFormSchema[] = [
    {
      fieldName: 'oldPassword',
      label: $t('page.profile.password.oldPassword'),
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('page.profile.password.oldPasswordPlaceholder'),
      },
      rules: z
        .string()
        .min(1, { message: $t('app.validation.currentPassword') })
        .refine((value) => passwordByteLength(value) <= 72, {
          message: $t('app.validation.passwordMax'),
        }),
    },
    {
      fieldName: 'newPassword',
      label: $t('page.profile.password.newPassword'),
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('page.profile.password.newPasswordPlaceholder'),
      },
      rules: z.string().refine(
        (value) => {
          const length = passwordByteLength(value);
          return length >= 6 && length <= 72;
        },
        { message: $t('app.validation.password') },
      ),
    },
    {
      fieldName: 'confirmPassword',
      label: $t('page.profile.password.confirmPassword'),
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('page.profile.password.confirmPasswordPlaceholder'),
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
  }
}
</script>
<template>
  <ProfilePasswordSetting
    ref="passwordSettingRef"
    class="w-1/3"
    :form-schema="formSchema"
    :loading="submitting"
    @submit="handleSubmit"
  />
</template>
