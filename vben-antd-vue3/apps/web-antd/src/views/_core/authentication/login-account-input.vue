<script setup lang="ts">
import type { AutoCompleteProps } from 'ant-design-vue';

import { computed, h, onActivated, onDeactivated, ref } from 'vue';

import { X } from '@vben/icons';
import { $t } from '@vben/locales';

import { AutoComplete, Input } from 'ant-design-vue';

import {
  clearLoginAccountHistory,
  readLoginAccountHistory,
  removeLoginAccount,
} from '#/store/login-account-history';

defineOptions({ inheritAttrs: false });

const emit = defineEmits<{ select: [] }>();
const model = defineModel<string>({ default: '' });
const active = ref(true);
const open = ref(false);
const history = ref(readLoginAccountHistory());

onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  // AutoComplete teleports its popup outside the cached login page. Destroy
  // the control so an old open state cannot reopen it after the form resets.
  active.value = false;
  open.value = false;
});

const options = computed(() => {
  const query = model.value.trim().toLocaleLowerCase();
  const accounts = history.value.filter((account) =>
    account.toLocaleLowerCase().includes(query),
  );
  return accounts.map((value) => ({ value, label: value }));
});

function segments(account: string) {
  const query = model.value.trim();
  const index = account.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (!query || index < 0) return [{ text: account, matched: false }];
  return [
    { text: account.slice(0, index), matched: false },
    { text: account.slice(index, index + query.length), matched: true },
    { text: account.slice(index + query.length), matched: false },
  ];
}

function remove(account: string) {
  removeLoginAccount(account);
  history.value = readLoginAccountHistory();
}

function clear() {
  clearLoginAccountHistory();
  history.value = [];
  open.value = false;
}

function selectAccount(value: unknown) {
  if (typeof value !== 'string') return;
  // Keep the form value and the combobox's displayed search text in sync.
  model.value = value;
  open.value = false;
  emit('select');
}

const renderDropdown: AutoCompleteProps['dropdownRender'] = (dropdown) =>
  h('div', [
    history.value.length
      ? h(
          'div',
          {
            class:
              'text-muted-foreground flex items-center justify-between gap-3 border-b px-3 py-2 text-xs',
          },
          [
            h('span', $t('authentication.accountHistory')),
            h(
              'button',
              {
                type: 'button',
                class:
                  'hover:text-primary focus-visible:ring-ring shrink-0 rounded px-1 py-1 focus-visible:outline-none focus-visible:ring-2',
                onMousedown: (event: MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
                onClick: (event: MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clear();
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                  }
                },
              },
              $t('authentication.clearAccountHistory'),
            ),
          ],
        )
      : null,
    dropdown?.menuNode,
  ]);
</script>

<template>
  <div class="w-full">
    <AutoComplete
      v-if="active"
      v-model:value="model"
      :search-value="model"
      :open="open"
      :disabled="Boolean($attrs.disabled)"
      :default-active-first-option="false"
      :filter-option="false"
      :dropdown-render="renderDropdown"
      :options="options"
      :not-found-content="history.length ? $t('common.noData') : undefined"
      :show-action="['focus']"
      class="w-full"
      @focus="history = readLoginAccountHistory()"
      @dropdown-visible-change="open = $event"
      @select="selectAccount"
    >
      <Input
        v-bind="$attrs"
        allow-clear
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        class="h-10"
      />
      <template #option="{ value }">
        <div class="flex min-w-0 items-center justify-between gap-2">
          <button
            type="button"
            class="min-w-0 flex-1 cursor-pointer break-all text-start"
            @mousedown.prevent
            @click.stop="selectAccount(value)"
            @keydown.enter.stop
            @keydown.space.stop
          >
            <span
              v-for="(part, index) in segments(String(value))"
              :key="index"
              :class="{ 'font-bold text-primary': part.matched }"
              >{{ part.text }}</span>
          </button>
          <button
            :aria-label="
              $t('authentication.removeAccountHistory', { account: value })
            "
            class="text-muted-foreground hover:bg-accent shrink-0 rounded p-1"
            type="button"
            @mousedown.prevent.stop
            @click.prevent.stop="remove(String(value))"
            @keydown.enter.stop
            @keydown.space.stop
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AutoComplete>
  </div>
</template>

<style scoped>
/* AutoComplete forces type="search"; keep only the component's clear button. */
:deep(input[type='search']::-webkit-search-cancel-button) {
  display: none;
  appearance: none;
}
</style>
