<script setup lang="ts">
import type { MFAEnrollment as MFAEnrollmentResult } from '#/api/core/auth';

import { ref } from 'vue';

import { Button } from 'ant-design-vue';

import { $t } from '#/locales';
import MFAEnrollment from '#/security/mfa-enrollment.vue';
import { useMFAError } from '#/security/mfa-error';
import { useAuthStore } from '#/store';

const auth = useAuthStore();
const entering = ref(false);
const failure = useMFAError('mfa.continueFailed');
const error = failure.message;

async function complete(result: MFAEnrollmentResult) {
  if (entering.value) return;
  entering.value = true;
  failure.clear();
  try {
    await auth.completeMFAEnrollment(result);
  } catch (cause: unknown) {
    failure.setCause(cause);
  } finally {
    entering.value = false;
  }
}
</script>

<template>
  <section class="mfa-auth-page">
    <MFAEnrollment
      mandatory
      :completing="entering"
      :completion-error="error"
      @complete="complete"
    />
    <div class="mfa-sign-out">
      <Button type="text" :disabled="entering" @click="auth.logout()">
{{
        $t('mfa.logout')
      }}
</Button>
    </div>
  </section>
</template>

<style scoped>
.mfa-auth-page {
  width: 100%;
  max-width: 384px;
  margin: 0 auto;
}
.mfa-sign-out {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}
.mfa-sign-out :deep(.ant-btn) {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
</style>
