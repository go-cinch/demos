<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useAntdDesignTokens } from '@vben/hooks';
import { preferences, usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { userCache } from '@vben/utils/cache';

import { App, Button, ConfigProvider, Result, theme } from 'ant-design-vue';

import { $t, antdLocale } from '#/locales';
import { sessionRetryTarget } from '#/router/guard';
import VerificationDialog from '#/security/verification-dialog.vue';
import LoginForm from '#/views/_core/authentication/login.vue';

defineOptions({ name: 'App' });

const router = useRouter();
const access = useAccessStore();
const user = useUserStore();
const publicPage = computed(
  () =>
    router.currentRoute.value.path.startsWith('/auth/') ||
    router.currentRoute.value.meta.ignoreAccess,
);
const ownerRevision = ref(0);
onBeforeUnmount(
  userCache.onChange(() => {
    ownerRevision.value++;
  }),
);
const retrying = ref(false);
async function retrySession() {
  if (retrying.value || !sessionRetryTarget.value) return;
  retrying.value = true;
  try {
    await router.replace(sessionRetryTarget.value);
  } finally {
    retrying.value = false;
  }
}

const { isDark } = usePreferences();
const { tokens } = useAntdDesignTokens();

watch(
  isDark,
  (dark) => {
    document
      .querySelector('link[rel="icon"]')
      ?.setAttribute(
        'href',
        `${import.meta.env.BASE_URL}${dark ? 'go-cinch-white.svg' : 'go-cinch.svg'}`,
      );
  },
  { immediate: true },
);

const tokenTheme = computed(() => {
  const algorithm = isDark.value
    ? [theme.darkAlgorithm]
    : [theme.defaultAlgorithm];

  // antd 紧凑模式算法
  if (preferences.app.compact) {
    algorithm.push(theme.compactAlgorithm);
  }

  return {
    algorithm,
    token: tokens,
  };
});
</script>

<template>
  <ConfigProvider :locale="antdLocale" :theme="tokenTheme">
    <App>
      <Result
        v-if="sessionRetryTarget"
        role="alert"
        status="warning"
        :title="$t('app.errors.sessionRestore')"
      >
        <template #extra>
          <Button type="primary" :loading="retrying" @click="retrySession">{{
            $t('verification.retry')
          }}</Button>
        </template>
      </Result>
      <RouterView
        v-else-if="
          publicPage ||
          (access.accessToken &&
            access.isAccessChecked &&
            user.userInfo &&
            !access.loginExpired)
        "
        :key="publicPage ? 'auth' : ownerRevision"
      />
      <AuthenticationLoginExpiredModal v-model:open="access.loginExpired">
        <LoginForm v-if="access.loginExpired" />
      </AuthenticationLoginExpiredModal>
      <VerificationDialog />
    </App>
  </ConfigProvider>
</template>
