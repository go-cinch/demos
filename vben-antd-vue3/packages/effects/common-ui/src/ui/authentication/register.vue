<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { VbenFormSchema } from '@vben-core/form-ui';

import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { $t } from '@vben/locales';

import { useVbenForm } from '@vben-core/form-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import Title from './auth-title.vue';

interface Props {
  formSchema?: VbenFormSchema[];
  /**
   * @zh_CN 是否处于加载处理状态
   */
  loading?: boolean;
  /**
   * @zh_CN 登录路径
   */
  loginPath?: string;
  /**
   * @zh_CN 标题
   */
  title?: string;
  /**
   * @zh_CN 描述
   */
  subTitle?: string;
  /**
   * @zh_CN 按钮文本
   */
  submitButtonText?: string;
}

defineOptions({
  name: 'RegisterForm',
});

const props = withDefaults(defineProps<Props>(), {
  formSchema: () => [],
  loading: false,
  loginPath: '/auth/login',
  submitButtonText: '',
  subTitle: '',
  title: '',
});

const emit = defineEmits<{
  submit: [Recordable<any>];
  valuesChange: [Recordable<any>, string[]];
}>();

const [Form, formApi] = useVbenForm(
  reactive({
    commonConfig: {
      hideLabel: true,
      hideRequiredMark: true,
    },
    schema: computed(() => props.formSchema),
    handleValuesChange(values, changedFields) {
      emit('valuesChange', { ...values }, changedFields);
    },
    showDefaultActions: false,
  }),
);

const router = useRouter();

async function handleSubmit() {
  const { valid } = await formApi.validate();
  const values = await formApi.getValues();
  if (valid) {
    emit('submit', { ...values });
  }
}

function goToLogin() {
  const target = router.resolve(props.loginPath);
  router.push({
    path: target.path,
    query: { ...router.currentRoute.value.query, ...target.query },
    hash: target.hash,
  });
}

defineExpose({
  getFormApi: () => formApi,
});
</script>

<template>
  <div>
    <Title>
      <slot name="title">
        {{ title || $t('authentication.createAnAccount') }} 🚀
      </slot>
      <template #desc>
        <slot name="subTitle">
          {{ subTitle || $t('authentication.signUpSubtitle') }}
        </slot>
      </template>
    </Title>
    <Form class="auth-feedback-form" @submit="handleSubmit" />

    <slot name="submit" :submit="handleSubmit">
      <VbenButton
        :class="{
          'cursor-wait': loading,
        }"
        :loading="loading"
        aria-label="register"
        class="mt-2 w-full"
        @click="handleSubmit"
      >
        <slot name="submitButtonText">
          {{ submitButtonText || $t('authentication.signUp') }}
        </slot>
      </VbenButton>
    </slot>
    <div
      class="mt-[22px] flex min-h-8 items-center justify-center gap-1 text-sm"
    >
      {{ $t('authentication.alreadyHaveAccount') }}
      <span class="vben-link text-sm font-normal" @click="goToLogin()">
        {{ $t('authentication.goToLogin') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.auth-feedback-form :deep([data-slot='form-item']) {
  padding-bottom: 24px;
  transition: padding-bottom 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
}

.auth-feedback-form :deep([data-slot='form-item']:has([aria-invalid='true'])) {
  padding-bottom: 48px;
}

.auth-feedback-form :deep([data-slot='form-message']) {
  position: absolute;
  margin-top: 4px;
  line-height: 20px;
}

.auth-feedback-form :deep(.slide-up-enter-active),
.auth-feedback-form :deep(.slide-up-leave-active) {
  transition:
    opacity 0.3s cubic-bezier(0.645, 0.045, 0.355, 1),
    transform 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
}

.auth-feedback-form :deep(.slide-up-enter-from),
.auth-feedback-form :deep(.slide-up-leave-to) {
  transform: translateY(-5px);
}

@media (prefers-reduced-motion: reduce) {
  .auth-feedback-form :deep([data-slot='form-item']),
  .auth-feedback-form :deep(.slide-up-enter-active),
  .auth-feedback-form :deep(.slide-up-leave-active) {
    transition: none;
  }
}
</style>
