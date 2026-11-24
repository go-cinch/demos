<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { Button } from 'ant-design-vue';

import { isServiceUnavailableError } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { $t } from '#/locales';
import EmailBindingForm from '#/security/email-binding-form.vue';
import { useAuthStore } from '#/store';

import OnboardingSignOut from './onboarding-sign-out.vue';

const auth = useAuthStore();
const currentSession = auth.captureSession();
const userID = ref<string>();
const profileUnavailable = ref(false);
const required = ref(true);
const loading = ref(true);
const formBusy = ref(false);
const skipping = ref(false);
const loadFailed = ref(false);
let active = true;
onBeforeUnmount(() => {
  active = false;
});
async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const info = await auth
      .fetchUserInfo({ fresh: true })
      .catch((error: unknown) => {
        if (!isServiceUnavailableError(error)) throw error;
        if (active && currentSession()) profileUnavailable.value = true;
      });
    if (!info || !active || !currentSession()) return;
    if (info.email) {
      await auth.continueLogin();
      return;
    }
    required.value = info.emailBindingRequired;
    userID.value = info.userId;
  } catch (error) {
    if (active && currentSession()) {
      loadFailed.value = true;
      showRequestErrorToast(error);
    }
  } finally {
    loading.value = false;
  }
}
onMounted(load);
async function skip() {
  if (formBusy.value || skipping.value || required.value) return;
  skipping.value = true;
  try {
    await auth.skipEmailBinding();
  } catch (error) {
    if (active && currentSession()) {
      showRequestErrorToast(error);
    }
  } finally {
    required.value = auth.emailBindingRequired;
    skipping.value = false;
  }
}
</script>

<template>
  <section
    class="email-binding"
    aria-labelledby="email-binding-title"
    :aria-busy="loading"
  >
    <h1 id="email-binding-title">{{ $t('email-auth.bindTitle') }}</h1>
    <Button v-if="loadFailed" @click="load">{{ $t('common.retry') }}</Button>
    <EmailBindingForm
      v-if="userID || profileUnavailable"
      :draft-user-id="userID"
      :disabled="skipping"
      :current-session="currentSession"
      :complete="(result) => auth.completeEmailBinding(result)"
      @busy="formBusy = $event"
    />
    <Button
      v-if="!required && !loading"
      type="link"
      block
      class="email-binding-secondary"
      :loading="skipping"
      :disabled="formBusy"
      @click="skip"
    >
      {{ $t('email-auth.skip') }}
    </Button>
    <OnboardingSignOut :disabled="formBusy || skipping" />
  </section>
</template>

<style scoped>
.email-binding {
  width: 100%;
  max-width: 448px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 34px;
  font-size: 30px;
  font-weight: 650;
  line-height: 1.4;
}

.email-binding :deep(.ant-input) {
  min-height: 44px;
}

.email-binding :deep(.ant-btn-primary) {
  height: 44px;
}

.email-binding-secondary {
  margin-top: 16px;
}
</style>
