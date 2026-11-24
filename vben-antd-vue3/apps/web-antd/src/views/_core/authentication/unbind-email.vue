<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Button, Result, Spin } from 'ant-design-vue';

import { confirmEmailUnlinkApi } from '#/api/core/auth';
import { requestErrorMessage } from '#/api/request-error';
import { $t } from '#/locales';

const route = useRoute();
const router = useRouter();
const state = ref<'checking' | 'done' | 'invalid' | 'retry' | 'used'>(
  'checking',
);
let token = new URLSearchParams(route.hash.slice(1)).get('token') ?? '';
const failure = shallowRef<unknown>();
const title = computed(() => {
  if (state.value === 'retry') return requestErrorMessage(failure.value);
  return $t(
    {
      checking: 'email-auth.checkingLink',
      done: 'email-auth.unlinkDone',
      invalid: 'email-auth.invalidLink',
      used: 'email-auth.linkUsed',
    }[state.value],
  );
});
async function confirm() {
  if (!token) {
    const receipt = window.history.state?.emailUnlinkResult;
    state.value =
      receipt === 'done' || receipt === 'used' ? receipt : 'invalid';
    return;
  }
  failure.value = undefined;
  state.value = 'checking';
  try {
    const result = await confirmEmailUnlinkApi(token);
    token = '';
    state.value = result.already_confirmed ? 'used' : 'done';
  } catch (error) {
    const code = (error as { response?: { data?: { error_code?: string } } })
      ?.response?.data?.error_code;
    failure.value = error;
    state.value = code === 'AUTH_UNLINK_INVALID' ? 'invalid' : 'retry';
  }
  if (state.value !== 'retry') {
    // The auth layout keys views by fullPath. Preserve only the display result across its remount.
    await router.replace({
      path: route.path,
      state: { emailUnlinkResult: state.value },
    });
  }
}
onMounted(confirm);
</script>
<template>
  <Result
    :status="
      state === 'done' || state === 'used'
        ? 'success'
        : state === 'checking'
          ? 'info'
          : 'warning'
    "
    :title="title"
    :sub-title="
      state === 'done'
        ? $t('email-auth.noticeSent')
        : state === 'invalid'
          ? $t('email-auth.latestLink')
          : undefined
    "
  >
    <template v-if="state === 'checking'" #icon><Spin size="large" /></template>
    <template v-if="state !== 'checking'" #extra>
      <Button v-if="state === 'retry'" @click="confirm">
        {{ $t('email-auth.retryUnlink') }}
      </Button>
      <Button
        type="primary"
        @click="
          router.replace({ path: '/profile', query: { tab: 'security' } })
        "
      >
        {{ $t('email-auth.backProfile') }}
      </Button>
    </template>
  </Result>
</template>
