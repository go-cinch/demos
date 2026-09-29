<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { listResource, request } from '../lib/api';
import type { ResourceKind, RecordData } from '../lib/types';
import { t } from '../locales';
import Sheet from './Sheet.vue';
import PageSkeleton from './PageSkeleton.vue';
import Icon from './Icon.vue';
const props = defineProps<{
  name: string;
  label: string;
  resource?: ResourceKind;
  multiple?: boolean;
  group?: boolean;
  options?: { value: string | number; label: string }[];
  initial?: { value: string | number; label: string }[];
}>();
const model = defineModel<unknown>();
const open = ref(false);
const query = ref('');
const busy = ref(false);
const error = ref('');
const loaded = ref<{ value: string | number; label: string }[]>([]);
const labels = new Map<string | number, string>();
const selected = computed<(string | number)[]>(() =>
  Array.isArray(model.value)
    ? model.value
    : model.value !== '' && model.value !== undefined && model.value !== null
      ? [model.value as string | number]
      : [],
);
watch(
  () => props.initial,
  (value) => {
    for (const item of value || []) labels.set(item.value, item.label);
  },
  { immediate: true },
);
const options = computed(() => props.options || loaded.value);
const display = computed(() =>
  selected.value
    .map(
      (value) =>
        labels.get(value) || options.value.find((x) => x.value === value)?.label || String(value),
    )
    .join('、'),
);
const selectedLabels = computed(() =>
  selected.value.map((value) => ({
    value,
    label:
      labels.get(value) ||
      options.value.find((item) => item.value === value)?.label ||
      String(value),
  })),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
function option(record: RecordData) {
  const value = props.resource === 'action' ? String(record.code) : record.id;
  return { value, label: `${record.name || record.username} · ${record.word || record.code}` };
}
async function load() {
  const current = ++generation;
  if (props.options) return;
  busy.value = true;
  error.value = '';
  try {
    if (props.group) {
      const result = await request<{ items: string[] }>(
        `/action/group${query.value ? `?keyword=${encodeURIComponent(query.value)}` : ''}`,
      );
      if (current === generation)
        loaded.value = result.items.map((value) => ({ value, label: value }));
    } else if (props.resource) {
      const q = query.value.trim();
      const fields = props.resource === 'user' ? ['username', 'code'] : ['name', 'word'];
      const results = await Promise.all(
        (q ? fields : ['']).map((field) =>
          listResource(props.resource!, { p: 1, s: 30, ...(field ? { [field]: q } : {}) }),
        ),
      );
      if (current === generation)
        loaded.value = [
          ...new Map(
            results
              .flatMap((result) => result.items)
              .map((record) => {
                const item = option(record);
                return [item.value, item];
              }),
          ).values(),
        ];
    }
    for (const item of loaded.value) labels.set(item.value, item.label);
  } catch (e) {
    if (current === generation) error.value = (e as Error).message;
  } finally {
    if (current === generation) busy.value = false;
  }
}
watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
watch(open, (value) => {
  if (value) {
    query.value = '';
    void load();
  }
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  generation++;
});
function choose(value: string | number) {
  if (props.multiple)
    model.value = selected.value.includes(value)
      ? selected.value.filter((v) => v !== value)
      : [...selected.value, value];
  else {
    model.value = value;
    open.value = false;
  }
}
</script>
<template>
  <button
    :id="name"
    type="button"
    class="select-trigger"
    :aria-label="label"
    :aria-expanded="open"
    @click="open = true"
  >
    <span v-if="multiple && selected.length" class="selection-summary">
      <span v-for="item in selectedLabels.slice(0, 2)" :key="item.value" class="selection-chip">{{
        item.label
      }}</span>
      <span v-if="selected.length > 2" class="selection-count">{{
        t('moreSelected', { count: selected.length - 2 })
      }}</span>
    </span>
    <span v-else :class="{ muted: !display }">{{ display || t('choose') }}</span
    ><Icon name="chevron-down" :size="18" /></button
  ><Sheet v-model="open" :title="label"
    ><t-search
      v-if="!options?.length || resource || group"
      v-model="query"
      :placeholder="t('searchOptions')"
    />
    <p v-if="multiple" class="selection-count" role="status">
      {{ t('selected', { count: selected.length }) }}
    </p>
    <div v-if="display" class="selected-options">
      <t-tag
        v-for="value in selected"
        :key="value"
        closable
        @close="model = multiple ? selected.filter((x) => x !== value) : undefined"
        >{{ labels.get(value) || options.find((x) => x.value === value)?.label || value }}</t-tag
      >
    </div>
    <p v-if="error" class="form-error" role="alert">
      {{ error }}<button @click="load">{{ t('retry') }}</button>
    </p>
    <PageSkeleton v-if="busy" variant="options" />
    <div v-else role="listbox" :aria-label="label" :aria-multiselectable="multiple">
      <button
        v-for="item in options"
        :key="item.value"
        type="button"
        class="option-row"
        role="option"
        :aria-selected="selected.includes(item.value)"
        @click="choose(item.value)"
      >
        <span>{{ item.label }}</span
        ><Icon v-if="selected.includes(item.value)" name="check" :size="18" /></button
      ><button
        v-if="group && query.trim() && !options.some((x) => x.value === query.trim())"
        type="button"
        class="option-row"
        @click="choose(query.trim())"
      >
        {{ t('createGroup', { name: query.trim() }) }}
      </button>
    </div>
    <t-empty v-if="!busy && !options.length && !group" :description="t('noResults')" />
    <div class="sheet-actions">
      <t-button @click="model = multiple ? [] : undefined">{{ t('clear') }}</t-button
      ><t-button theme="primary" @click="open = false">{{ t('done') }}</t-button>
    </div></Sheet
  >
</template>
