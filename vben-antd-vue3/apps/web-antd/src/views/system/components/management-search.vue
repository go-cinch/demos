<script setup lang="ts">
import { Form, Space } from 'ant-design-vue';
defineOptions({ inheritAttrs: false });
</script>
<template>
  <Form
    v-bind="$attrs"
    class="system-filter-form flex w-full flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:justify-between"
    layout="inline"
  >
    <div class="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-3">
      <slot></slot>
    </div>
    <Space class="w-full justify-end lg:w-auto lg:shrink-0" wrap>
<slot name="actions"></slot>
</Space>
  </Form>
</template>
<style scoped>
:deep(.system-filter-control.ant-select) {
  width: var(--filter-width, 208px);
  min-width: var(--filter-width, 208px);
  flex-shrink: 0;
}
:deep(.ant-form-item-label) {
  flex-shrink: 0;
}
@media (min-width: 640px) {
  :deep(.ant-form-item) {
    flex: none;
    max-width: 100%;
  }
  :deep(.ant-form-item-control) {
    flex: none;
  }
  :deep(.ant-form-item-row) {
    flex-wrap: nowrap;
  }
}
@media (max-width: 639px) {
  :deep(.ant-form-item),
  :deep(.ant-form-item-row) {
    width: 100%;
  }
  :deep(.ant-form-item) {
    margin-inline-end: 0;
  }
  :deep(.ant-form-item-control) {
    flex: 1;
    min-width: 0;
  }
  :deep(.system-filter-control.ant-select) {
    width: 100%;
    min-width: 0;
  }
}
</style>
