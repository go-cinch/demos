<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../locales';
import Sheet from './Sheet.vue';
defineProps<{ columns: { key: string; title: string }[]; fixedColumn: string }>();
const option = defineModel<string>('option', { default: '' });
const density = defineModel<string>('density', { default: 'default' });
const size = defineModel<number>('size', { default: 20 });
const visible = defineModel<string[]>('visible', { default: () => [] });
const bordered = defineModel<boolean>('bordered', { default: false });
const striped = defineModel<boolean>('striped', { default: false });
const sticky = defineModel<boolean>('sticky', { default: true });
const emit = defineEmits<{ sizeChange: [] }>();
const open = computed({
  get: () => !!option.value,
  set: (value) => {
    if (!value) option.value = '';
  },
});
function toggleColumn(key: string) {
  visible.value = visible.value.includes(key)
    ? visible.value.filter((item) => item !== key)
    : [...visible.value, key];
}
</script>
<template>
  <Sheet v-model="open" :title="t(option)">
    <t-radio-group v-if="option === 'system.table.density'" v-model="density"
      ><t-radio
        v-for="value in ['compact', 'default', 'loose']"
        :key="value"
        :value="value"
        :label="t(`system.table.${value}`)"
    /></t-radio-group>
    <t-radio-group v-else-if="option === 'pageSize'" v-model="size" @change="emit('sizeChange')"
      ><t-radio
        v-for="value in [10, 20, 50, 100]"
        :key="value"
        :value="value"
        :label="`${value} / ${t('pageUnit')}`"
    /></t-radio-group>
    <template v-else-if="option === 'system.table.visibleColumns'">
      <p class="field-hint">{{ t('columnsHint') }}</p>
      <div v-for="column in columns" :key="column.key" class="switch-row">
        <span>{{ column.title }}</span
        ><t-switch
          :value="column.key === fixedColumn || visible.includes(column.key)"
          :aria-label="column.title"
          :disabled="column.key === fixedColumn"
          @change="toggleColumn(column.key)"
        />
      </div>
    </template>
    <template v-else>
      <div class="switch-row">
        <span>{{ t('system.table.bordered') }}</span
        ><t-switch v-model="bordered" :aria-label="t('system.table.bordered')" />
      </div>
      <div class="switch-row">
        <span>{{ t('system.table.striped') }}</span
        ><t-switch v-model="striped" :aria-label="t('system.table.striped')" />
      </div>
      <div class="switch-row">
        <span>{{ t('system.table.sticky') }}</span
        ><t-switch v-model="sticky" :aria-label="t('system.table.sticky')" />
      </div>
    </template>
  </Sheet>
</template>
