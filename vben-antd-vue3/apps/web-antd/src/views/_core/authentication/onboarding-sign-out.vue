<script setup lang="ts">
import { Button } from 'ant-design-vue';

import { $t } from '#/locales';
import { useAuthStore } from '#/store';

defineProps<{ disabled?: boolean }>();

const auth = useAuthStore();
</script>

<template>
  <div class="onboarding-sign-out">
    <Button type="text" :disabled="disabled" @click="auth.logout(false)">
      {{ $t('verification.logout') }}
    </Button>
  </div>
</template>

<style scoped>
.onboarding-sign-out {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}

.onboarding-sign-out :deep(.ant-btn) {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
