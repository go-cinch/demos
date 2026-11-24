<script setup lang="ts">
import type { ActionConfig } from '#/api/system';

import { computed } from 'vue';

import { $te } from '@vben/locales';

import { Button, Tag } from 'ant-design-vue';

import { $t } from '#/locales';

import { permissionResult } from './permission-result';

const props = defineProps<{
  config?: ActionConfig;
  field: string;
  canDetail?: boolean;
}>();
const emit = defineEmits<{ detail: [] }>();
const result = computed(() => permissionResult(props.config));
const values = computed(() => {
  let kind: 'features' | 'menus' | 'operations' = 'features';
  if (props.field === 'menu') {
    kind = 'menus';
  } else if (props.field === 'resource') {
    kind = 'operations';
  }
  return result.value[kind].map((key) => ({
    key,
    name: $te(`${kind}.${key}`)
      ? $t(`${kind}.${key}`)
      : $t('permission-display.unresolvedLabel'),
  }));
});
const fallback = computed(() => {
  if (
    !result.value.available ||
    (props.field === 'button' &&
      !result.value.featuresKnown &&
      !result.value.all)
  ) {
    return 'permission-display.unavailable';
  }
  if (result.value.all) {
    if (props.field === 'menu') {
      return 'permission-display.allMenus';
    }
    if (props.field === 'resource') {
      return 'permission-display.allOperations';
    }
    return 'permission-display.allFeatures';
  }
  if (props.field === 'menu') {
    return 'permission-display.noResource';
  }
  if (props.field === 'button') {
    return 'permission-display.noFeatures';
  }
  return 'action-editor.noSelectedOperations';
});
</script>
<template>
  <div class="permission-result-cell" :data-permission-result="field">
    <template
      v-if="
        values.length &&
        !result.all &&
        (field !== 'button' || result.featuresKnown)
      "
    >
      <span v-if="field === 'button'" class="feature-summary">{{
        values
          .slice(0, 3)
          .map((value) => value.name)
          .join('、')
      }}</span>
      <template v-else
        ><Tag
          v-for="value in values.slice(
            0,
            field === 'resource' ? values.length : 3,
          )"
          :key="value.key"
          :color="
            field === 'menu'
              ? 'blue'
              : value.key === 'delete'
                ? 'red'
                : undefined
          "
          >{{ value.name }}</Tag
        ></template
      >
      <Button
        v-if="field !== 'resource' && values.length > 3 && canDetail"
        type="link"
        size="small"
        class="more-features"
        @click="emit('detail')"
        >{{
          $t('permission-display.viewAll', { count: values.length })
        }}</Button
      >
      <span
        v-else-if="field !== 'resource' && values.length > 3"
        class="secondary"
        >{{ $t('permission-display.total', { count: values.length }) }}</span
      >
    </template>
    <Tag v-else-if="result.all" color="red">{{ $t(fallback) }}</Tag>
    <span v-else class="secondary">{{ $t(fallback) }}</span>
  </div>
</template>
<style scoped>
.permission-result-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  min-width: 0;
}

.permission-result-cell :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.feature-summary {
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.more-features {
  height: auto;
  padding: 0;
  line-height: 1.7;
}

.secondary {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
