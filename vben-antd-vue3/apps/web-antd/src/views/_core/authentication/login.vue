<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, markRaw, ref } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useDebounceFn } from '@vueuse/core';

import { useAuthStore } from '#/store';
import { isValidUsername, isValidUserPassword } from '#/user-validation';

import LoginPointCaptcha from './login-point-captcha.vue';
import ServerSliderCaptcha from './server-slider-captcha.vue';

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
      rules: z.string().refine(isValidUsername, {
        message: $t('authentication.usernameTip'),
      }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().refine(isValidUserPassword, {
        message: $t('authentication.passwordTip'),
      }),
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
      component: markRaw(ServerSliderCaptcha),
      componentProps: {
        purpose: 'login',
        username: '',
      },
      dependencies: {
        componentProps(values) {
          return {
            purpose: 'login',
            username: String(values.username ?? '').trim(),
          };
        },
        triggerFields: ['username'],
      },
      fieldName: 'sliderProof',
      rules: z
        .string()
        .min(1, { message: $t('authentication.verifyRequiredTip') }),
    });
  }
  return schema;
});

async function resetSliderCaptcha() {
  if (authStore.loginCaptcha) return;
  const formApi = loginFormRef.value?.getFormApi();
  if (!formApi) return;
  await formApi.setFieldValue('sliderProof', '');
  formApi.getFieldComponentRef<SliderCaptchaExpose>('sliderProof')?.resume();
  await formApi.clearValidation('sliderProof');
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
