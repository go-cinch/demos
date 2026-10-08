<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref, useId, watch } from 'vue';
import { clearLoginAccountHistory, loginAccountHistory, removeLoginAccount } from '../lib/storage';
import { t } from '../locales';
const model = defineModel<string>({ required: true });
defineProps<{ loading?: boolean }>();
const emit = defineEmits<{ blur: [value: string]; select: [] }>();
const root = ref<HTMLElement>();
const identity = useId();
const focused = ref(false);
const active = ref(-1);
const history = ref(loginAccountHistory());
const items = computed(() => {
  const query = model.value.trim().toLowerCase();
  return history.value.filter((account) => account.toLowerCase().includes(query));
});
watch(model, () => {
  active.value = -1;
});
function syncInput() {
  const input = root.value?.querySelector('input');
  if (!input) return;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', String(focused.value && history.value.length > 0));
  input.setAttribute('aria-controls', `${identity}-accounts`);
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('spellcheck', 'false');
  if (active.value >= 0 && focused.value)
    input.setAttribute('aria-activedescendant', `${identity}-account-${active.value}`);
  else input.removeAttribute('aria-activedescendant');
}
onMounted(syncInput);
onUpdated(syncInput);
async function pick(value: string) {
  model.value = value;
  root.value?.querySelector('input')?.focus();
  focused.value = false;
  active.value = -1;
  emit('select');
  await nextTick();
  emit('blur', value);
}
function clearHistory() {
  history.value = clearLoginAccountHistory();
  root.value?.querySelector('input')?.focus();
  focused.value = false;
  active.value = -1;
}
function focus() {
  history.value = loginAccountHistory();
  focused.value = true;
}
function leave(event: FocusEvent) {
  if (root.value?.contains(event.relatedTarget as Node | null)) return;
  focused.value = false;
  active.value = -1;
  emit('blur', model.value);
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || !(event.target instanceof HTMLInputElement)) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    focused.value = false;
    active.value = -1;
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    focused.value = true;
    if (!items.value.length) return;
    active.value =
      active.value < 0
        ? event.key === 'ArrowDown'
          ? 0
          : items.value.length - 1
        : (active.value + (event.key === 'ArrowDown' ? 1 : -1) + items.value.length) %
          items.value.length;
    void nextTick(() =>
      document
        .getElementById(`${identity}-account-${active.value}`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  } else if (
    event.key === 'Enter' &&
    focused.value &&
    active.value >= 0 &&
    items.value[active.value]
  ) {
    event.preventDefault();
    event.stopPropagation();
    void pick(items.value[active.value]!);
  }
}
function segments(value: string) {
  const query = model.value.trim();
  const index = query ? value.toLowerCase().indexOf(query.toLowerCase()) : -1;
  return index < 0
    ? [{ text: value, match: false }]
    : [
        { text: value.slice(0, index), match: false },
        { text: value.slice(index, index + query.length), match: true },
        { text: value.slice(index + query.length), match: false },
      ];
}
</script>
<template>
  <div
    ref="root"
    class="search-field login-account-field"
    @focusout="leave"
    @keydown.capture="keydown"
  >
    <t-input
      id="username"
      v-model="model"
      name="username"
      autocomplete="off"
      :placeholder="t('app.validation.username')"
      :loading="loading"
      clearable
      @update:model-value="
        focused = true;
        active = -1;
      "
      @focus="focus"
    />
    <div
      v-if="focused && history.length"
      class="suggestions card account-suggestions"
      @mousedown.prevent
    >
      <div class="account-history-heading">
        <small>{{ t('loginAccountHistory') }}</small
        ><button type="button" @click="clearHistory">{{ t('clearLoginAccountHistory') }}</button>
      </div>
      <div :id="`${identity}-accounts`" role="listbox" :aria-label="t('loginAccountHistory')">
        <p v-if="!items.length" class="account-history-empty">
          {{ t('loginAccountHistoryEmpty') }}
        </p>
        <div
          v-for="(value, index) in items"
          :key="value"
          class="suggestion-row"
          :class="{ 'account-active': active === index }"
        >
          <button
            :id="`${identity}-account-${index}`"
            type="button"
            role="option"
            :aria-selected="active === index"
            @click="pick(value)"
          >
            <template v-for="(segment, part) in segments(value)" :key="part"
              ><mark v-if="segment.match">{{ segment.text }}</mark
              ><template v-else>{{ segment.text }}</template></template
            >
          </button>
          <button
            type="button"
            :aria-label="t('system.suggestions.removeHistory', { value })"
            @click="
              history = removeLoginAccount(value);
              active = -1;
            "
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
