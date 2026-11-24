<script setup lang="ts">
import type { TOTPEnrollment as TOTPEnrollmentResult } from '#/api/core/auth';

import { ref } from 'vue';

import { Button } from 'ant-design-vue';

import { $t } from '#/locales';
import TOTPEnrollment from '#/security/totp-enrollment.vue';
import { useVerificationTip } from '#/security/verification-tip';
import { useAuthStore } from '#/store';

import OnboardingSignOut from './onboarding-sign-out.vue';

const auth = useAuthStore();
const entering = ref(false);
const formBusy = ref(false);
const skipping = ref(false);
const stage = ref<'password' | 'recovery' | 'scan'>('password');
const { showFailure, TipHolder } = useVerificationTip();

async function complete(result: TOTPEnrollmentResult) {
  if (entering.value) return;
  entering.value = true;
  try {
    await auth.completeVerificationEnrollment(result);
  } catch (error: unknown) {
    showFailure(error);
  } finally {
    entering.value = false;
  }
}
async function skip() {
  if (
    entering.value ||
    formBusy.value ||
    skipping.value ||
    !auth.totpSkipAllowed
  )
    return;
  skipping.value = true;
  try {
    await auth.skipOnboarding('totp');
  } catch (error) {
    showFailure(error);
  } finally {
    skipping.value = false;
  }
}
</script>

<template>
  <section
    class="totp-auth-page"
    :class="{ 'is-recovery': stage === 'recovery' }"
  >
    <TipHolder />
    <TOTPEnrollment
      mandatory
      :completing="entering || skipping"
      @busy="formBusy = $event"
      @complete="complete"
      @stage="stage = $event"
    />
    <Button
      v-if="auth.totpSkipAllowed && stage !== 'recovery'"
      type="link"
      block
      class="mt-4"
      :loading="skipping"
      :disabled="entering || formBusy"
      @click="skip"
    >
      {{ $t('app.onboarding.skip') }}
    </Button>
    <OnboardingSignOut :disabled="entering || skipping || formBusy" />
  </section>
</template>

<style scoped>
.totp-auth-page {
  width: 100%;
  max-width: 384px;
  margin: 0 auto;
}

.totp-auth-page.is-recovery {
  max-width: 448px;
}
</style>
