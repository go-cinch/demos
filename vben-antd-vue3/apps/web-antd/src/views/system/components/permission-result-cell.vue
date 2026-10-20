<script setup lang="ts">
import type { ActionConfig } from '#/api/system';

import { computed } from 'vue';

import { $te } from '@vben/locales';

import { Button, Tag } from 'ant-design-vue';

import { $t } from '#/locales';

import { permissionResult } from './permission-result';

const props = defineProps<{ config?: ActionConfig; field: string; canDetail?: boolean }>();
const emit = defineEmits<{ detail: [] }>();
const result = computed(() => permissionResult(props.config));
const values = computed(() => {
  const kind = props.field === 'menu' ? 'menus' : props.field === 'resource' ? 'operations' : 'features';
  return result.value[kind].map((key) => ({ key, name: $te(`${kind}.${key}`) ? $t(`${kind}.${key}`) : $t('permission-display.unresolvedLabel') }));
});
const fallback = computed(() => !result.value.available || (props.field === 'button' && !result.value.featuresKnown && !result.value.all) ? 'permission-display.unavailable'
  : result.value.all ? (props.field === 'menu' ? 'permission-display.allMenus' : props.field === 'resource' ? 'permission-display.allOperations' : 'permission-display.allFeatures')
    : props.field === 'menu' ? 'permission-display.noResource' : props.field === 'button' ? 'permission-display.noFeatures' : 'action-editor.noSelectedOperations');
</script>
<template>
  <div class="permission-result-cell" :data-permission-result="field">
    <template v-if="values.length && !result.all && (field !== 'button' || result.featuresKnown)">
      <span v-if="field === 'button'" class="feature-summary">{{ values.slice(0, 3).map((value) => value.name).join('、') }}</span>
      <template v-else><Tag v-for="value in values.slice(0, field === 'resource' ? values.length : 3)" :key="value.key" :color="field === 'menu' ? 'blue' : value.key === 'delete' ? 'red' : undefined">{{ value.name }}</Tag></template>
      <Button v-if="field !== 'resource' && values.length > 3 && canDetail" type="link" size="small" class="more-features" @click="emit('detail')">{{ $t('permission-display.viewAll', { count: values.length }) }}</Button>
      <span v-else-if="field !== 'resource' && values.length > 3" class="secondary">{{ $t('permission-display.total', { count: values.length }) }}</span>
    </template>
    <Tag v-else-if="result.all" color="red">{{ $t(fallback) }}</Tag>
    <span v-else class="secondary">{{ $t(fallback) }}</span>
  </div>
</template>
<style scoped>
.permission-result-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }
.permission-result-cell :deep(.ant-tag) { margin: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.feature-summary { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.more-features { height: auto; padding: 0; line-height: 1.7; }
.secondary { color: hsl(var(--muted-foreground)); font-size: 12px; }
</style>
