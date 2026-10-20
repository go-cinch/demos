<script setup lang="ts">
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Segmented } from 'ant-design-vue';

const props = defineProps<{
  options: { icon: string; label: string; value: string }[];
  testId: string;
}>();
const value = defineModel<string>({ required: true });
const segmentedOptions = computed(() =>
  props.options.map((option) => ({ value: option.value, payload: option })),
);
</script>

<template>
  <Segmented
    v-model:value="value"
    class="management-view-switch"
    :data-testid="`${testId}-switch`"
    :options="segmentedOptions"
  >
    <template #label="{ value: optionValue, payload }">
      <span :data-testid="`${testId}-${optionValue}`" class="management-view-label">
        <IconifyIcon :icon="payload.icon" aria-hidden="true" />
        {{ payload.label }}
      </span>
    </template>
  </Segmented>
</template>

<style scoped>
.management-view-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.management-view-switch :deep(.ant-segmented-item-selected) {
  color: hsl(var(--primary));
}
.management-view-switch :deep(.ant-segmented-item:has(input:focus-visible)) {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
</style>
