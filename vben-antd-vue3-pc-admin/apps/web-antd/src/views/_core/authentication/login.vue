<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, markRaw, ref } from 'vue';

import { AuthenticationLogin, SliderCaptcha, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useDebounceFn } from '@vueuse/core';

import { useAuthStore } from '#/store';

import LoginPointCaptcha from './login-point-captcha.vue';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
const loginFormRef = ref<{
  getFormApi: () => {
    clearValidation: (fieldName: string) => Promise<void>;
    getFieldComponentRef: <T>(fieldName: string) => T | undefined;
    setFieldValue: (fieldName: string, value: unknown) => Promise<void>;
  };
}>();

interface SliderCaptchaExpose {
  resume: () => void;
}

const formSchema = computed((): VbenFormSchema[] => {
  const schema: VbenFormSchema[] = [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
  ];
  if (authStore.loginCaptcha) {
    schema.push({
      component: markRaw(LoginPointCaptcha),
      componentProps: {
        captcha: authStore.loginCaptcha,
        onRefresh: authStore.refreshLoginCaptcha,
        onVerify: authStore.verifyLoginCaptcha,
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
            value.length === authStore.loginCaptcha?.target_count,
          { message: $t('app.validation.verification') },
        ),
    });
  } else {
    schema.push({
      component: markRaw(SliderCaptcha),
      fieldName: 'captcha',
      rules: z.boolean().refine((value) => value, {
        message: $t('authentication.verifyRequiredTip'),
      }),
    });
  }
  return schema;
});

async function resetSliderCaptcha() {
  if (authStore.loginCaptcha) return;
  const formApi = loginFormRef.value?.getFormApi();
  if (!formApi) return;
  await formApi.setFieldValue('captcha', false);
  formApi.getFieldComponentRef<SliderCaptchaExpose>('captcha')?.resume();
  await formApi.clearValidation('captcha');
}

const checkLoginVerification = useDebounceFn(
  (username: string) => authStore.checkLoginVerification(username),
  300,
);

async function handleValuesChange(
  values: Recordable<any>,
  changedFields: string[],
) {
  if (!changedFields.includes('username')) return;
  authStore.resetLoginVerification();
  await resetSliderCaptcha();
  const username = typeof values.username === 'string' ? values.username : '';
  await checkLoginVerification(username);
}

async function handleSubmit(params: Recordable<any>) {
  const captcha = authStore.loginCaptcha;
  const captchaPoints = Array.isArray(params.captchaPoints)
    ? params.captchaPoints
    : [];

  const { userInfo } = await authStore.authLogin({
    ...params,
    captchaPoints: captcha ? captchaPoints : undefined,
  });
  if (!userInfo) {
    await resetSliderCaptcha();
  }
}
</script>

<template>
  <AuthenticationLogin
    ref="loginFormRef"
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-qrcode-login="false"
    :show-third-party-login="false"
    @submit="handleSubmit"
    @values-change="handleValuesChange"
  />
</template>
