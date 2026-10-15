<script setup lang="ts">
import type { TableProps } from 'ant-design-vue';

import { computed } from 'vue';

import { Table } from 'ant-design-vue';

import { vSkeleton } from '#/directives/skeleton';

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  loading?: boolean;
  dataSource?: TableProps['dataSource'];
  pagination?: TableProps['pagination'];
  scroll?: TableProps['scroll'];
}>();
const initial = computed(() => props.loading && !props.dataSource?.length);
const placeholderRows = computed(() => Array.from(
  { length: (props.pagination && props.pagination.pageSize) || 10 },
  (_, index) => ({ id: `skeleton-${index}` }),
));
</script>

<template>
  <Table
    v-bind="$attrs"
    v-skeleton="{ loading: !!loading, targets: '.ant-table-tbody > tr:not(.ant-table-measure-row) > td' }"
    class="skeleton-table"
    :data-source="initial ? placeholderRows : dataSource"
    :loading="false"
    :pagination="pagination"
    :scroll="{ ...scroll, y: scroll?.y ?? 'clamp(360px, 52vh, 620px)' }"
  >
    <template v-for="(_, name) in $slots" :key="name" #[name]="scope">
      <slot :name="name" v-bind="scope || {}"></slot>
    </template>
    <template #bodyCell="scope">
      <span v-if="initial" class="skeleton-table-placeholder" aria-hidden="true">&nbsp;</span>
      <slot v-else name="bodyCell" v-bind="scope">{{ scope.text }}</slot>
    </template>
  </Table>
</template>

<style scoped>
/* Keep the result viewport and pagination in the same position for initial
   requests, refreshes, empty results and pages with fewer records. */
.skeleton-table :deep(.ant-table-body) {
  /* stylelint-disable-next-line declaration-property-value-no-unknown -- Vue SFC CSS binding. */
  height: v-bind("scroll?.y ?? 'clamp(360px, 52vh, 620px)'");
  overflow-y: auto !important;
  scrollbar-gutter: stable;
}

.skeleton-table :deep(.ant-spin-container) { padding-bottom: 64px; }

.skeleton-table :deep(.ant-table-pagination) {
  position: absolute;
  right: 0;
  bottom: 0;
  margin-block: 16px;
}

.skeleton-table-placeholder {
  display: inline-block;
  height: 24px;
}
</style>
