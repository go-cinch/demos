<script setup lang="ts">
import type { LoadFailure } from '#/api/request-error';

import { Alert, Button } from 'ant-design-vue';

import { $t } from '#/locales';

withDefaults(
  defineProps<{
    failure?: LoadFailure;
    kind?: 'data' | 'statistics';
    retryLabel?: string;
    retrySize?: 'large' | 'middle' | 'small';
  }>(),
  {
    kind: 'data',
    failure: true,
    retryLabel: undefined,
    retrySize: undefined,
  },
);
defineEmits<{ retry: [] }>();
</script>

<template>
  <div
    v-if="failure"
    class="load-warning"
    :class="{ 'load-warning--data': kind === 'data' }"
  >
    <Alert
      v-if="kind === 'statistics'"
      type="warning"
      show-icon
      :message="$t('app.errors.statisticsLoad')"
    >
      <template v-if="retryLabel || $slots.action" #action>
        <slot name="action">
          <Button :size="retrySize" @click="$emit('retry')">
            {{ retryLabel }}
          </Button>
        </slot>
      </template>
    </Alert>
    <div v-else role="status" class="flex min-h-16 items-center justify-center">
      <slot name="action">
        <Button v-if="retryLabel" :size="retrySize" @click="$emit('retry')">
          {{ retryLabel }}
        </Button>
        <span v-else class="text-muted-foreground">{{
          $t('app.errors.dataLoad')
        }}</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
/* Keep the gap outside Ant Design's alert reset styles. */
.load-warning--data {
  margin-bottom: 16px;
}
</style>
