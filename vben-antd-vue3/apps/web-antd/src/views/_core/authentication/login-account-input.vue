<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref } from 'vue';

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
const history = ref(readLoginAccountHistory());

onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  // AutoComplete teleports its popup outside the cached login page. Destroy
  // the control so an old open state cannot reopen it after the form resets.
  active.value = false;
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
}
</script>

<template>
  <div class="w-full">
    <div
      v-if="history.length"
      class="text-muted-foreground mb-1 flex items-center justify-between text-xs"
    >
      <span>{{ $t('authentication.accountHistory') }}</span>
      <button type="button" class="hover:text-primary" @click="clear">
        {{ $t('authentication.clearAccountHistory') }}
      </button>
    </div>
    <AutoComplete
      v-if="active"
      v-model:value="model"
      :disabled="Boolean($attrs.disabled)"
      :default-active-first-option="false"
      :filter-option="false"
      :options="options"
      :show-action="['focus']"
      class="w-full"
      @focus="history = readLoginAccountHistory()"
      @select="emit('select')"
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
          <span class="min-w-0 break-all">
            <span
              v-for="(part, index) in segments(String(value))"
              :key="index"
              :class="{ 'font-bold text-primary': part.matched }"
              >{{ part.text }}</span>
          </span>
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
