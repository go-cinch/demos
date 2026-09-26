<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, markRaw, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationRegister, z } from '@vben/common-ui';
import { LOGIN_PATH } from '@vben/constants';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getUsernameAvailabilityApi, registerApi } from '#/api';
import { stageRegistrationLogin } from '#/store';
import {
  isValidUsername,
  isValidUserPassword,
  USER_USERNAME_MESSAGE_KEY,
} from '#/user-validation';

import ServerSliderCaptcha from './server-slider-captcha.vue';

defineOptions({ name: 'Register' });

interface RegisterFormInstance {
  getFormApi: () => {
    clearValidation: (fieldName: string) => Promise<void>;
    getFieldComponentRef: <T>(fieldName: string) => T | undefined;
    setFieldError: (fieldName: string, error?: string) => Promise<void>;
    setFieldValue: (fieldName: string, value: unknown) => Promise<void>;
  };
}

interface SliderCaptchaExpose {
  resume: () => void;
}

const loading = ref(false);
const registerFormRef = ref<null | RegisterFormInstance>(null);
const router = useRouter();
const usernameAvailabilityChecks = new Map<string, Promise<boolean>>();

function checkUsernameAvailability(username: string) {
  const cached = usernameAvailabilityChecks.get(username);
  if (cached) {
    return cached;
  }
  const check = getUsernameAvailabilityApi(username)
    .then((result) => result.available)
    .catch((error) => {
      usernameAvailabilityChecks.delete(username);
      throw error;
    });
  usernameAvailabilityChecks.set(username, check);
  return check;
}

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      formFieldProps: {
        validateOn: ['blur'],
      },
      label: $t('authentication.username'),
      rules: z.string().refine(isValidUsername, {
        message: $t(USER_USERNAME_MESSAGE_KEY),
      }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().refine(isValidUserPassword, {
        message: $t('app.validation.password'),
      }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.confirmPassword'),
      },
      dependencies: {
        rules(values) {
          const { password } = values;
          return z
            .string({ error: $t('authentication.passwordTip') })
            .min(1, { message: $t('authentication.passwordTip') })
            .refine((value) => value === password, {
              message: $t('authentication.confirmPasswordTip'),
            });
        },
        triggerFields: ['password'],
      },
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
    },
    {
      component: markRaw(ServerSliderCaptcha),
      componentProps: { purpose: 'register', username: '' },
      dependencies: {
        componentProps(values) {
          return {
            purpose: 'register',
            username: String(values.username ?? '').trim(),
          };
        },
        triggerFields: ['username'],
      },
      fieldName: 'sliderProof',
      rules: z.string().min(1, {
        message: $t('authentication.verifyRequiredTip'),
      }),
    },
  ];
});

async function resetSliderCaptcha() {
  const formApi = registerFormRef.value?.getFormApi();
  if (!formApi) return;
  await formApi.setFieldValue('sliderProof', '');
  formApi.getFieldComponentRef<SliderCaptchaExpose>('sliderProof')?.resume();
  await formApi.clearValidation('sliderProof');
}

async function handleFormFocusout(event: FocusEvent) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.name !== 'username') {
    return;
  }
  const username = input.value.trim();
  if (!isValidUsername(username)) {
    return;
  }
  try {
    const available = await checkUsernameAvailability(username);
    if (input.value.trim() !== username) {
      return;
    }
    await registerFormRef.value
      ?.getFormApi()
      .setFieldError(
        'username',
        available ? undefined : $t('app.register.usernameExists'),
      );
  } catch {
    // The request client already displays backend and network errors.
  }
}

async function handleValuesChange(
  _values: Recordable<any>,
  changedFields: string[],
) {
  if (changedFields.includes('username')) {
    await resetSliderCaptcha();
  }
}

async function handleSubmit(value: Recordable<any>) {
  let registered = false;
  try {
    loading.value = true;
    const username = value.username.trim();
    const password = value.password;
    const available = await checkUsernameAvailability(username);
    if (!available) {
      await registerFormRef.value
        ?.getFormApi()
        .setFieldError('username', $t('app.register.usernameExists'));
      return;
    }
    await registerApi({
      password,
      slider_proof: value.sliderProof,
      username,
    });
    stageRegistrationLogin({ password, username });
    registered = true;
    message.success($t('app.register.success'));
    await router.replace(LOGIN_PATH);
  } finally {
    loading.value = false;
    if (!registered) {
      await resetSliderCaptcha();
    }
  }
}
</script>

<template>
  <AuthenticationRegister
    ref="registerFormRef"
    :form-schema="formSchema"
    :loading="loading"
    @focusout="handleFormFocusout"
    @submit="handleSubmit"
    @values-change="handleValuesChange"
  />
</template>
