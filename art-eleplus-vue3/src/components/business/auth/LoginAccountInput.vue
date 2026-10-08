<script setup lang="ts">
  import type { AutocompleteInstance } from 'element-plus'
  import { $t } from '@/locales'
  import {
    clearLoginAccountHistory,
    readLoginAccountHistory,
    removeLoginAccount
  } from '@/utils/login-account-history'

  const account = defineModel<string>({ default: '' })
  const emit = defineEmits<{ select: [] }>()
  const autocomplete = ref<AutocompleteInstance>()
  const history = ref(readLoginAccountHistory())

  function fetchSuggestions(query: string, callback: (items: { value: string }[]) => void) {
    history.value = readLoginAccountHistory()
    const search = query.trim().toLocaleLowerCase()
    callback(
      history.value
        .filter((value) => value.toLocaleLowerCase().includes(search))
        .map((value) => ({ value }))
    )
  }

  function segments(value: string) {
    const query = account.value.trim()
    const start = query ? value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1
    if (start < 0) return [{ text: value, matched: false }]
    return [
      { text: value.slice(0, start), matched: false },
      { text: value.slice(start, start + query.length), matched: true },
      { text: value.slice(start + query.length), matched: false }
    ]
  }

  function removeAccount(value: string) {
    history.value = removeLoginAccount(value)
    void autocomplete.value?.getData(account.value)
  }

  function clearHistory() {
    history.value = clearLoginAccountHistory()
    autocomplete.value?.close()
  }
</script>

<template>
  <div class="login-account-field">
    <ElAutocomplete
      ref="autocomplete"
      v-model="account"
      class="login-account-control"
      size="large"
      clearable
      autocomplete="off"
      :aria-label="$t('auth.username')"
      :placeholder="$t('auth.usernameRequired')"
      :fetch-suggestions="fetchSuggestions"
      :trigger-on-focus="true"
      :debounce="0"
      fit-input-width
      popper-class="login-account-autocomplete"
      @select="emit('select')"
      @keyup.enter.stop
    >
      <template #header>
        <div v-if="history.length" class="login-account-actions">
          <span>{{ $t('auth.loginAccountHistory') }}</span>
          <ElButton
            class="login-account-clear"
            text
            size="small"
            @mousedown.prevent
            @click="clearHistory"
            @keyup.enter.stop
          >
            {{ $t('auth.clearLoginAccountHistory') }}
          </ElButton>
        </div>
      </template>
      <template #default="{ item }">
        <div class="login-account-row">
          <span class="login-account-value">
            <span
              v-for="(segment, index) in segments(item.value)"
              :key="index"
              :class="{ 'login-account-match': segment.matched }"
              >{{ segment.text }}</span
            >
          </span>
          <button
            class="login-account-remove"
            type="button"
            :aria-label="$t('auth.removeLoginAccount', { username: item.value })"
            @mousedown.prevent.stop
            @click.prevent.stop="removeAccount(item.value)"
            @keyup.enter.stop
          >
            <ArtSvgIcon icon="ri:close-line" />
          </button>
        </div>
      </template>
    </ElAutocomplete>
  </div>
</template>

<style scoped>
  .login-account-field,
  .login-account-control {
    width: 100%;
  }

  .login-account-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }

  .login-account-row {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 34px;
  }

  .login-account-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .login-account-match {
    font-weight: 700;
    color: var(--el-color-primary);
  }

  .login-account-remove {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 5px;

    &:hover,
    &:focus-visible {
      color: var(--el-color-danger);
      background: var(--el-fill-color);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 20%, transparent);
    }
  }

  .login-account-clear:focus-visible {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 20%, transparent);
  }

  :global(.login-account-autocomplete .el-autocomplete-suggestion__wrap) {
    padding: 6px;
  }

  :global(.login-account-autocomplete li) {
    padding: 0 14px;
    border-radius: 6px;
  }
</style>
