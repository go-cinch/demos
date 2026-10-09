<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { listResource } from '../lib/api';
import type { ResourceKind } from '../lib/types';
import type { FilterDefinition } from '../lib/resource-config';
import { readStored, writeStored } from '../lib/storage';
import { t } from '../locales';
import RemoteSelect from './RemoteSelect.vue';
const props = defineProps<{ field: FilterDefinition; resource: ResourceKind }>();
const model = defineModel<unknown>();
const emit = defineEmits<{ search: [] }>();
const query = ref('');
const focused = ref(false);
const suggestions = ref<string[]>([]);
const busy = ref(false);
const suggestionError = ref('');
const clearTimeout = window.clearTimeout.bind(window);
const multiple = computed(() => props.field.type === 'input-multi-select');
const historyKey = computed(() => `cinch-mobile-filter:${props.resource}:${props.field.key}`);
const history = ref<string[]>(readStored(historyKey.value, []));
const text = computed({
  get: () => (multiple.value ? query.value : String(model.value ?? '')),
  set: (value: string) => {
    focused.value = true;
    if (multiple.value) query.value = value;
    else model.value = value;
    void suggest(value);
  },
});
const items = computed(() => [...new Set([...suggestions.value, ...history.value])].slice(0, 15));
let timer: ReturnType<typeof setTimeout> | undefined;
let blurTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
watch(model, (value) => {
  if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
    query.value = '';
    clearTimeout(timer);
    clearTimeout(blurTimer);
    generation++;
    busy.value = false;
    focused.value = false;
    suggestions.value = [];
  }
});
function normalize(value: string) {
  return (props.resource === 'user' || props.resource === 'action') && props.field.key === 'code'
    ? value.trim().toUpperCase()
    : value.trim();
}
function remember(value: string) {
  if (!value) return;
  history.value = [value, ...history.value.filter((x) => x !== value)].slice(0, 10);
  writeStored(historyKey.value, history.value);
}
function pick(value: string) {
  clearTimeout(blurTimer);
  value = normalize(value);
  if (multiple.value) {
    model.value = [
      ...new Set([
        ...(Array.isArray(model.value) ? model.value : []),
        ...value.split(',').map(normalize).filter(Boolean),
      ]),
    ];
    query.value = '';
  } else model.value = value;
  remember(value);
  focused.value = false;
  suggestions.value = [];
  emit('search');
}
function blur(_value: unknown, context?: { e: FocusEvent }) {
  const target = context?.e.target;
  const next = context?.e.relatedTarget;
  if (
    target instanceof Element &&
    next instanceof Node &&
    target.closest('.search-field')?.contains(next)
  )
    return;
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (text.value.trim()) pick(text.value);
    else {
      focused.value = false;
      emit('search');
    }
  }, 400);
}
async function suggest(value: string) {
  clearTimeout(timer);
  const id = ++generation;
  timer = setTimeout(async () => {
    if (!value.trim()) {
      suggestions.value = [];
      return;
    }
    busy.value = true;
    suggestionError.value = '';
    try {
      const field = props.field.suggestion?.fieldKey || props.field.key;
      const result = await listResource(props.field.suggestion?.resource || props.resource, {
        p: 1,
        s: 20,
        [field]: normalize(value),
      });
      if (id === generation)
        suggestions.value = [
          ...new Set(
            result.items.flatMap((record) =>
              typeof record[field] === 'string' ? [String(record[field])] : [],
            ),
          ),
        ];
    } catch (e) {
      if (id === generation) suggestionError.value = (e as Error).message;
    } finally {
      if (id === generation) busy.value = false;
    }
  }, 250);
}
function segments(value: string) {
  const q = text.value.toLowerCase();
  const index = q ? value.toLowerCase().indexOf(q) : -1;
  return index < 0
    ? [{ text: value, match: false }]
    : [
        { text: value.slice(0, index), match: false },
        { text: value.slice(index, index + q.length), match: true },
        { text: value.slice(index + q.length), match: false },
      ];
}
const options = computed(() =>
  props.field.type.includes('status')
    ? [
        { value: 0, label: t('system.status.pending') },
        { value: 1, label: t('system.status.active') },
        { value: 2, label: t('system.status.locked') },
      ]
    : props.field.type === 'category'
      ? [
          { value: 0, label: t('system.category.permission') },
          { value: 1, label: t('system.category.jwt') },
        ]
      : [
          { value: 'true', label: t('system.enabled.yes') },
          { value: 'false', label: t('system.enabled.no') },
        ],
);
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearTimeout(blurTimer);
  generation++;
});
</script>
<template>
  <div class="search-field">
    <label :for="`filter-${field.key}`">{{ field.label }}</label
    ><RemoteSelect
      v-if="field.type.includes('status') || ['category', 'enabled'].includes(field.type)"
      v-model="model"
      :name="`filter-${field.key}`"
      :label="field.label"
      :multiple="field.type === 'status-multi-select'"
      :options="options"
      @update:model-value="emit('search')"
    /><template v-else
      ><div v-if="multiple && Array.isArray(model) && model.length" class="filter-tags">
        <t-tag
          v-for="value in model"
          :key="String(value)"
          closable
          @close="
            model = (model as string[]).filter((x) => x !== value);
            emit('search');
          "
          ><span v-for="line in String(value).split('\n')" :key="line" class="tag-line">{{
            line
          }}</span></t-tag
        >
      </div>
      <t-input
        :id="`filter-${field.key}`"
        v-model="text"
        :name="`filter-${field.key}`"
        :aria-label="field.label"
        :placeholder="t('system.common.enter', { field: field.label })"
        clearable
        @focus="
          focused = true;
          clearTimeout(blurTimer);
        "
        @blur="blur"
        @enter="pick(text)"
        @clear="
          model = multiple ? [] : '';
          emit('search');
        "
      />
      <div
        v-if="focused && (items.length || busy || suggestionError)"
        class="suggestions card"
        @pointerdown.prevent
      >
        <small>{{
          busy
            ? t('system.suggestions.searching')
            : suggestions.length
              ? t('system.suggestions.backend')
              : t('system.suggestions.history')
        }}</small>
        <p v-if="suggestionError" class="field-error">{{ suggestionError }}</p>
        <t-skeleton v-if="busy" animation="gradient" theme="paragraph" />
        <div v-for="value in busy ? [] : items" :key="value" class="suggestion-row">
          <button type="button" @click="pick(value)">
            <span
              v-for="line in value.split('\n')"
              :key="line"
              :class="{ 'resource-tag': field.splitLines }"
              ><template v-for="(segment, index) in segments(line)" :key="index"
                ><mark v-if="segment.match">{{ segment.text }}</mark
                ><template v-else>{{ segment.text }}</template></template
              ></span
            ></button
          ><button
            v-if="history.includes(value)"
            type="button"
            :aria-label="t('system.suggestions.removeHistory', { value })"
            @click="
              history = history.filter((x) => x !== value);
              writeStored(historyKey, history);
            "
          >
            ×
          </button>
        </div>
      </div></template
    >
  </div>
</template>
