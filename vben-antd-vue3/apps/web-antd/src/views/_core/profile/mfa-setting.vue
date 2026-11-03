<script setup lang="ts">
import type { MFAStatus } from '#/api/core/auth';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Card, Skeleton, Tag } from 'ant-design-vue';

import { getMFAStatusApi } from '#/api/core/auth';
import { $t } from '#/locales';
import { useMFAError } from '#/security/mfa-error';
import { MFACancelled, requestMFA } from '#/security/mfa-prompt';
import { useAuthStore } from '#/store';
const status = ref<MFAStatus>();
const loading = ref(true);
const recovering = ref(false);
const testing = ref(false);
const enrolling = ref(false);
const failure = useMFAError('mfa.failed');
const error = failure.message;
const auth = useAuthStore();
let active = true;
onBeforeUnmount(() => {
  active = false;
});
async function load() {
  loading.value = true;
  failure.clear();
  try {
    status.value = await getMFAStatusApi();
  } catch (cause: unknown) {
    failure.setCause(cause);
  } finally {
    loading.value = false;
  }
}
async function enroll() {
  if (enrolling.value) return;
  enrolling.value = true;
  let failed = false;
  try {
    await requestMFA('enroll');
  } catch (cause) {
    failed = !(cause instanceof MFACancelled);
  } finally {
    // Confirmation binds immediately, before the recovery codes are acknowledged.
    // Closing that final screen must still refresh the bound state.
    if (active) {
      await load();
      if (failed && !error.value) failure.setKey();
    }
    enrolling.value = false;
  }
}
async function test() {
  if (testing.value) return;
  testing.value = true;
  try {
    await requestMFA('test');
  } catch (cause) {
    if (active && !(cause instanceof MFACancelled)) failure.setKey();
  } finally {
    testing.value = false;
  }
}
async function recover() {
  if (recovering.value) return;
  recovering.value = true;
  try {
    await auth.restartLoginForMFARecovery();
  } finally {
    recovering.value = false;
  }
}
onMounted(load);
</script>
<template>
  <Card
    class="profile-panel profile-security-card mfa-card"
    :body-style="{ padding: '28px' }"
  >
    <template #title>
      <div class="mfa-card-title">
        <span class="mfa-card-icon"><IconifyIcon icon="lucide:shield-check" /></span>
        <h2>{{ $t('mfa.title') }}</h2>
      </div>
    </template>
    <template #extra>
      <Tag
        v-if="status && !loading && !error"
        :color="status.enabled ? 'green' : 'orange'"
      >
        {{ $t(status.enabled ? 'mfa.enabled' : 'mfa.disabled') }}
      </Tag>
    </template>
    <Skeleton v-if="loading" active :title="false" :paragraph="{ rows: 1 }" />
    <Alert v-else-if="error" :message="error" type="error" show-icon>
      <template #action>
<Button @click="load">{{ $t('mfa.retry') }}</Button>
</template>
    </Alert>
    <div v-else-if="status" class="mfa-card-content">
      <p v-if="status.enabled" class="mfa-card-description">
        {{ $t('mfa.enabledHelp') }}
      </p>
      <div class="mfa-card-actions">
        <Button
          v-if="!status.enabled"
          type="primary"
          :loading="enrolling"
          @click="enroll"
          >
{{ $t('mfa.beginBinding') }}
</Button>
        <template v-else>
          <Button
            data-testid="mfa-test"
            :loading="testing"
            :disabled="recovering"
            @click="test"
            >
{{ $t('mfa.test') }}
</Button>
          <Button
            data-testid="mfa-restart-recovery"
            :loading="recovering"
            :disabled="testing"
            @click="recover"
            >
{{ $t('mfa.restartRecovery') }}
</Button>
        </template>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.mfa-card-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mfa-card-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.mfa-card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.07);
}
.mfa-card-icon :deep(svg) {
  width: 18px;
  height: 18px;
}
.mfa-card :deep(.ant-card-extra .ant-tag) {
  margin-inline-end: 0;
}
.mfa-card-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.mfa-card-description {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  line-height: 1.8;
}
.mfa-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  flex: none;
  gap: 12px;
}
@media (max-width: 1100px) {
  .mfa-card-content {
    align-items: flex-start;
    flex-direction: column;
    gap: 20px;
  }
  .mfa-card-actions {
    justify-content: flex-start;
  }
}
</style>
