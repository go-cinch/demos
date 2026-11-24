<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationRegister, z } from '@vben/common-ui';
import { LOGIN_PATH } from '@vben/constants';
import { $placeholder, $t } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

import { getUsernameAvailabilityApi, registerApi } from '#/api';
import { getLoginFailure } from '#/api/core/auth';
import { showRequestErrorToast } from '#/api/request-feedback';
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
    setFieldError: (fieldName: string, error?: string) => Promise<void>;
  };
}

const loading = ref(false);
const pendingRegistration = ref<null | { password: string; username: string }>(
  null,
);
const registerFormRef = ref<null | RegisterFormInstance>(null);
const router = useRouter();
const usernameAvailabilityChecks = new Map<string, Promise<boolean>>();
let revision = 0;
let active = true;

onBeforeUnmount(() => {
  active = false;
  revision += 1;
  pendingRegistration.value = null;
});

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
        class: 'h-11',
        disabled: loading.value,
        placeholder: $placeholder('authentication.usernameTip'),
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
        class: 'h-11',
        disabled: loading.value,
        placeholder: $placeholder('authentication.password'),
      },
      dependencies: {
        resolve: ({ values }) => ({
          componentProps: { passwordStrength: Boolean(values.password) },
        }),
        triggerFields: ['password'],
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
        class: 'h-11',
        disabled: loading.value,
        placeholder: $placeholder('authentication.confirmPassword'),
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
  ];
});

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
    if (!active || input.value.trim() !== username) {
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

function handleValuesChange(_values: Recordable<any>, changedFields: string[]) {
  if (
    changedFields.some((field) =>
      ['confirmPassword', 'password', 'username'].includes(field),
    )
  ) {
    revision += 1;
    pendingRegistration.value = null;
  }
}

async function handleSubmit(value: Recordable<any>) {
  if (loading.value || pendingRegistration.value) return;
  const currentRevision = revision;
  try {
    loading.value = true;
    const username = value.username.trim();
    const password = value.password.trim();
    const available = await checkUsernameAvailability(username);
    if (!active || currentRevision !== revision) return;
    if (!available) {
      await registerFormRef.value
        ?.getFormApi()
        .setFieldError('username', $t('app.register.usernameExists'));
      return;
    }
    pendingRegistration.value = { password, username };
  } catch {
    // The request client already displays backend and network errors.
  } finally {
    loading.value = false;
  }
}

async function handleVerified(proof: string) {
  if (!proof || loading.value || !pendingRegistration.value || !active) return;
  const { password, username } = pendingRegistration.value;
  const currentRevision = revision;
  try {
    loading.value = true;
    await registerApi({
      password,
      slider_proof: proof,
      username,
    });
    if (!active || currentRevision !== revision) return;
    stageRegistrationLogin({ password, username });
    message.success($t('app.register.success'));
    await router.replace({
      path: LOGIN_PATH,
      query: router.currentRoute.value.query,
    });
  } catch (error) {
    usernameAvailabilityChecks.delete(username);
    if (!active || currentRevision !== revision) return;
    if (getLoginFailure(error)?.error_code === 'AUTH_USERNAME_EXISTS') {
      await registerFormRef.value
        ?.getFormApi()
        .setFieldError('username', $t('app.register.usernameExists'));
    } else {
      showRequestErrorToast(error);
    }
  } finally {
    loading.value = false;
    pendingRegistration.value = null;
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
  >
    <template #submit="{ submit }">
      <div v-if="pendingRegistration" class="mt-2">
        <ServerSliderCaptcha
          :key="revision"
          purpose="register"
          :username="pendingRegistration.username"
          @update:model-value="handleVerified"
        />
      </div>
      <Button
        v-else
        type="primary"
        block
        aria-label="register"
        class="register-submit mt-2"
        :loading="loading"
        @click="submit"
      >
        {{ $t('authentication.signUp') }}
      </Button>
    </template>
  </AuthenticationRegister>
</template>

<style scoped>
.register-submit {
  height: 44px;
}
</style>
