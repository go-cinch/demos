<script setup lang="ts">
import { computed } from 'vue';

import { Checkbox } from 'ant-design-vue';

import { $t } from '#/locales';

const props = defineProps<{
  options: { label: string; value: string }[];
  selectAll?: boolean;
}>();
const selected = defineModel<string[]>({ required: true });
const allSelected = computed(() =>
  props.options.every(({ value }) => selected.value.includes(value)),
);
const partiallySelected = computed(
  () =>
    !allSelected.value &&
    props.options.some(({ value }) => selected.value.includes(value)),
);

function toggleAll() {
  const options = props.options.map(({ value }) => value);
  selected.value = allSelected.value
    ? selected.value.filter((value) => !options.includes(value))
    : [...new Set([...selected.value, ...options])];
}

function toggle(value: string) {
  selected.value = selected.value.includes(value)
    ? selected.value.filter((key) => key !== value)
    : [...selected.value, value];
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <slot></slot>
    <template v-if="selectAll">
      <Checkbox
        :checked="allSelected"
        :indeterminate="partiallySelected"
        @change="toggleAll"
      >
        {{ $t('system.common.selectAll') }}
      </Checkbox>
      <div class="border-border border-t"></div>
    </template>
    <Checkbox
      v-for="option in options"
      :key="option.value"
      :checked="selected.includes(option.value)"
      @change="toggle(option.value)"
    >
      {{ option.label }}
    </Checkbox>
  </div>
</template>
