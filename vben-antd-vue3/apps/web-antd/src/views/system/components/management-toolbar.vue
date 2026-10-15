<script setup lang="ts">
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Popover, Space, Switch, Tooltip } from 'ant-design-vue';

import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';
withDefaults(
  defineProps<{
    canRead?: boolean;
    loading?: boolean;
    isFullscreen?: boolean;
  }>(),
  { canRead: true, loading: false, isFullscreen: false },
);
const emit = defineEmits<{ refresh: []; fullscreen: [] }>();
const size = defineModel<'large' | 'middle' | 'small'>('size', {
  default: 'middle',
});
const bordered = defineModel<boolean>('bordered', { default: true });
const striped = defineModel<boolean>('striped', { default: true });
const sticky = defineModel<boolean>('sticky', { default: true });
const densityOptions = computed(() => [
  { label: $t('system.table.compact'), value: 'small' as const },
  { label: $t('system.table.default'), value: 'middle' as const },
  { label: $t('system.table.loose'), value: 'large' as const },
]);
</script>
<template>
  <Space class="ml-auto" data-testid="management-toolbar" size="small" wrap>
    <Tooltip :title="$t('system.common.refresh')">
      <Button
        class="management-tool-button"
        v-if="canRead"
        :aria-label="$t('system.common.refresh')"
        :disabled="loading" v-skeleton="loading" :aria-busy="loading"
        size="small"
        @click="emit('refresh')"
      >
        <IconifyIcon icon="lucide:refresh-cw" />
      </Button>
    </Tooltip>

    <Popover
      overlay-class-name="system-compact-popover"
      placement="bottomRight"
      trigger="click"
    >
      <template #content>
        <div class="flex w-24 flex-col">
          <Button
            v-for="item in densityOptions"
            :key="item.value"
            block
            size="small"
            :type="size === item.value ? 'primary' : 'text'"
            @click="size = item.value"
          >
            {{ item.label }}
          </Button>
        </div>
      </template>
      <Button
        class="management-tool-button"
        :aria-label="$t('system.table.density')"
        size="small"
      >
        <IconifyIcon icon="lucide:rows-3" />
      </Button>
    </Popover>

    <Tooltip
      :title="
        isFullscreen
          ? $t('system.table.exitFullscreen')
          : $t('system.table.fullscreen')
      "
    >
      <Button
        class="management-tool-button"
        :aria-label="$t('system.table.fullscreen')"
        size="small"
        @click="emit('fullscreen')"
      >
        <IconifyIcon
          :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'"
        />
      </Button>
    </Tooltip>

    <Popover
      placement="bottomRight"
      :title="$t('system.table.visibleColumns')"
      trigger="click"
    >
      <template #content>
        <slot name="columns"></slot>
      </template>
      <Button
        class="management-tool-button"
        :aria-label="$t('system.table.columns')"
        size="small"
      >
        <IconifyIcon icon="lucide:columns-3" />
      </Button>
    </Popover>

    <Popover
      overlay-class-name="system-compact-popover"
      placement="bottomRight"
      :title="$t('system.table.style')"
      trigger="click"
    >
      <template #content>
        <div class="grid w-40 grid-cols-[1fr_auto] items-center gap-2">
          <span>{{ $t('system.table.bordered') }}</span>
          <Switch v-model:checked="bordered" size="small" />
          <span>{{ $t('system.table.striped') }}</span>
          <Switch v-model:checked="striped" size="small" />
          <span>{{ $t('system.table.sticky') }}</span>
          <Switch v-model:checked="sticky" size="small" />
        </div>
      </template>
      <Button
        class="management-tool-button"
        :aria-label="$t('system.table.style')"
        size="small"
      >
        <IconifyIcon icon="lucide:settings-2" />
      </Button>
    </Popover>
  </Space>
</template>
<style>
.management-tool-button.ant-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 24px;
  padding: 0;
  line-height: 1;
}
.management-tool-button.ant-btn > svg {
  display: block;
  flex: none;
  width: 14px;
  height: 14px;
}
.system-compact-popover .ant-popover-inner {
  min-width: 0;
  padding: 8px;
}
.system-compact-popover .ant-popover-title {
  min-width: 0;
  margin-bottom: 6px;
}
</style>
