<script setup lang="ts">
  import { $t } from '@/locales'
  defineProps<{ columns: { key: string; title: string }[]; fullscreen: boolean }>()
  const tableSize = defineModel<'small' | 'default' | 'large'>('size', { required: true })
  const visibleColumns = defineModel<string[]>('visible', { required: true })
  const tableBordered = defineModel<boolean>('bordered', { required: true })
  const tableStriped = defineModel<boolean>('striped', { required: true })
  const emit = defineEmits<{ refresh: []; fullscreen: [] }>()
</script>
<template>
  <div class="flex gap-2">
    <ElButton :title="$t('system.common.refresh')" :aria-label="$t('system.common.refresh')" @click="emit('refresh')">
      <ArtSvgIcon icon="ri:refresh-line" />
    </ElButton>
    <ElSelect :aria-label="$t('system.table.density')" v-model="tableSize" style="width: 115px"
      ><ElOption value="small" :label="$t('system.table.compact')" /><ElOption
        value="default"
        :label="$t('system.table.default')" /><ElOption
        value="large"
        :label="$t('system.table.loose')"
    /></ElSelect>
    <ElButton :title="$t('system.table.fullscreen')" :aria-label="$t('system.table.fullscreen')" @click="emit('fullscreen')"
      ><ArtSvgIcon :icon="fullscreen ? 'ri:fullscreen-exit-line' : 'ri:fullscreen-line'"
    /></ElButton>
    <ElPopover trigger="click" :width="220"
      ><template #reference
        ><ElButton :aria-label="$t('system.table.visibleColumns')"><ArtSvgIcon icon="ri:layout-column-line" /></ElButton></template
      ><ElCheckboxGroup v-model="visibleColumns" class="column-picker"
        ><ElCheckbox v-for="column in columns" :key="column.key" :value="column.key">{{
          column.title
        }}</ElCheckbox></ElCheckboxGroup
      ></ElPopover
    >
    <ElPopover trigger="click" :width="200">
      <template #reference>
        <ElButton :title="$t('system.table.style')" :aria-label="$t('system.table.style')">
          <ArtSvgIcon icon="ri:table-2" />
        </ElButton>
      </template>
      <div class="table-style-options">
        <ElSwitch v-model="tableBordered" />
        <span>{{ $t('system.table.bordered') }}</span>
        <ElSwitch v-model="tableStriped" />
        <span>{{ $t('system.table.striped') }}</span>
      </div>
    </ElPopover>
  </div>
</template>

<style scoped>.table-style-options{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;}.column-picker{display:flex;flex-direction:column;gap:8px;}</style>
