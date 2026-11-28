<script setup lang="ts">
import { Button } from 'ant-design-vue';

import { $t } from '#/locales';

defineProps<{
  account: string;
  disabled?: boolean;
  inputId: string;
}>();

const emit = defineEmits<{ change: [] }>();
</script>

<template>
  <div class="email-code-label">
    <label :for="inputId">{{ $t('email-auth.code') }}</label>
    <span class="email-code-account">
      <span>{{ $t('email-auth.account') }}</span>
      <b>{{ account }}</b>
      <Button
        type="link"
        html-type="button"
        :disabled="disabled"
        @click="emit('change')"
      >
        {{ $t('email-auth.change') }}
      </Button>
    </span>
  </div>
</template>

<style scoped>
.email-code-label {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.email-code-label label {
  flex: none;
}

.email-code-account {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  color: hsl(var(--muted-foreground));
}

.email-code-account b {
  min-width: 0;
  font-weight: 500;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
}

.email-code-account :deep(.ant-btn) {
  flex: none;
  height: auto;
  padding: 0;
}
</style>
