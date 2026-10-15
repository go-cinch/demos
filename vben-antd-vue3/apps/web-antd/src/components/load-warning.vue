<script setup lang="ts">
import { Alert } from 'ant-design-vue';

import { $t } from '#/locales';

withDefaults(defineProps<{ kind?: 'data' | 'statistics' }>(), {
  kind: 'data',
});
</script>

<template>
  <div class="load-warning" :class="{ 'load-warning--data': kind === 'data' }">
    <Alert
      type="warning"
      show-icon
      :message="$t(kind === 'statistics' ? 'app.errors.statisticsLoad' : 'app.errors.dataLoad')"
    >
      <template v-if="$slots.action" #action>
        <slot name="action"></slot>
      </template>
    </Alert>
  </div>
</template>

<style scoped>
/* Keep the gap outside Ant Design's alert reset styles. */
.load-warning--data {
  margin-bottom: 16px;
}
</style>
