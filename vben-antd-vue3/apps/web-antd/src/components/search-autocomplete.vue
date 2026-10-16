<script setup lang="ts">
import type { AutoCompleteProps } from 'ant-design-vue';

import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';

import { AutoComplete } from 'ant-design-vue';

import SearchOption from './search-option.vue';
import { renderSkeletonOptions } from './skeleton-options';

// The caller owns fetching, debouncing and history persistence. This component
// owns the single-value search control and the suggestion popup's interaction.
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  disabled?: boolean;
  loading?: boolean;
  options?: AutoCompleteProps['options'];
}>(), { disabled: false, loading: false, options: () => [] });
const value = defineModel<string>('value', { default: '' });
const emit = defineEmits<{
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
  'remove-history': [value: string];
  search: [value: string];
  select: [value: string];
  submit: [value: string];
}>();
const input = ref<{ focus: () => void; blur: () => void }>();
const inputId = useId();
const opened = ref(false);
const popupOpen = computed(() => opened.value && !props.disabled && (props.loading || props.options.length > 0));
let selectionRevision = 0;
let submitTimer: ReturnType<typeof setTimeout> | undefined;
function close() { opened.value = false; }
function update(next: unknown) { value.value = String(next ?? ''); }
function search(next: string) {
  update(next);
  opened.value = true;
  emit('search', next);
}
function select(next: unknown) {
  selectionRevision++;
  update(next);
  close();
  emit('select', String(next ?? ''));
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;
  event.preventDefault();
  const revision = selectionRevision;
  // Wait until the DOM event finishes bubbling through Ant's option list.
  // A microtask can run between native listeners and reopen the popup early.
  clearTimeout(submitTimer);
  submitTimer = setTimeout(() => {
    submitTimer = undefined;
    if (props.disabled) return;
    close();
    if (revision === selectionRevision) emit('submit', value.value);
  }, 0);
}
function focus(event: FocusEvent) { opened.value = true; emit('focus', event); }
function blur(event: FocusEvent) { close(); emit('blur', event); }
watch(() => props.disabled, (disabled) => { if (disabled) close(); });
onBeforeUnmount(() => { clearTimeout(submitTimer); });
defineExpose({ focus: () => input.value?.focus(), blur: () => input.value?.blur(), close });
</script>

<template>
  <div
    v-bind="{ class: $attrs.class, style: $attrs.style }"
    class="search-autocomplete-wrapper"
    @keydown.esc.capture.stop.prevent="close"
  >
    <label v-if="$attrs['aria-label']" :for="String($attrs.id ?? inputId)" class="sr-only">{{ $attrs['aria-label'] }}</label>
    <!-- Capture Escape before rc-select resets combobox text or a parent drawer closes. -->
    <AutoComplete
      ref="input"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      class="search-autocomplete-control"
      :id="$attrs.id === undefined ? ($attrs['aria-label'] ? inputId : undefined) : String($attrs.id)"
      :value="value"
      :options="options"
      :open="popupOpen"
      :disabled="disabled"
      :allow-clear="!$slots.input"
      autocomplete="off"
      :filter-option="false"
      :default-active-first-option="false"
      :show-action="['focus']"
      :not-found-content="loading ? ' ' : null"
      :dropdown-render="({ menuNode } = {}) => renderSkeletonOptions(menuNode, loading)"
      @update:value="update"
      @search="search"
      @select="select"
      @focus="focus"
      @blur="blur"
      @dropdown-visible-change="opened = $event"
      @input-key-down="keydown"
    >
      <template v-if="$slots.input" #default><slot name="input"></slot></template>
      <template #option="option">
        <span v-if="option.value === undefined">{{ option.label }}</span>
        <SearchOption
          v-else-if="option.source === 'history'"
          :value="String(option.value)"
          source="history"
          @remove="emit('remove-history', $event)"
        />
        <slot v-else name="result" :option="option" :query="value">
          <SearchOption :value="String(option.label ?? option.value)" :query="value" source="backend" />
        </slot>
      </template>
    </AutoComplete>
  </div>
</template>

<style scoped>
/* Keep caller sizing on the root so scoped page styles still apply. */
.search-autocomplete-wrapper { display: inline-block; width: 100%; min-width: 0; }
.search-autocomplete-control { width: 100%; }
</style>
