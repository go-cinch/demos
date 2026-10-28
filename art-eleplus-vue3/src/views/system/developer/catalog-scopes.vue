<script setup lang="ts">
  import { ref } from 'vue'
  import { IconifyIcon } from '@/components/catalog/element-adapter'
  import { Button, FormItem, Input } from '@/components/catalog/element-adapter'
  import type { Catalog, EditorUI } from './catalog-model'
  import { setText, text } from './catalog-model'
  import { $t } from '@/locales'
  const props = defineProps<{
    catalog: Catalog
    disabled: boolean
    ui: EditorUI
  }>()
  const t = (key: string) => $t(`developer.${key}`)
  const error = ref('')
  const normalizeScopeIdentifier = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '')

  function updateNewScope(value: string) {
    props.ui.newScope = normalizeScopeIdentifier(value)
    error.value = ''
  }

  function addScope() {
    if (props.disabled) return
    props.ui.newScope = normalizeScopeIdentifier(props.ui.newScope)
    if (!/^[a-z]+$/.test(props.ui.newScope)) {
      error.value = 'scopeIdentifierInvalid'
      return
    }
    if (props.catalog.scopes.includes(props.ui.newScope)) {
      error.value = 'duplicate'
      return
    }
    props.catalog.scopes.push(props.ui.newScope)
    props.ui.newScope = ''
    error.value = ''
  }
  function removeScope(scope: string) {
    if (
      Object.keys(props.catalog.resource_catalog.resources).some((key) =>
        key.startsWith(`${scope}:`)
      )
    ) {
      error.value = 'scopeInUse'
      return
    }
    props.catalog.scopes.splice(props.catalog.scopes.indexOf(scope), 1)
  }
  function move(index: number, delta: number) {
    const target = index + delta
    const items = props.catalog.scopes
    const first = items[index]
    const second = items[target]
    if (first !== undefined && second !== undefined) {
      items[target] = first
      items[index] = second
    }
  }
</script>
<template>
  <section class="catalog-card catalog-scopes" :aria-label="t('scopes')">
    <header class="catalog-section-heading">
      <h2>{{ t('scopes') }}</h2>
      <p>{{ t('scopesHint') }}</p>
    </header>
    <div class="catalog-table-wrap">
      <table class="catalog-table catalog-scope-table">
        <thead>
          <tr>
            <th>{{ t('identifier') }}</th>
            <th>{{ t('zh') }}</th>
            <th>English</th>
            <th>{{ t('actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(scope, i) in catalog.scopes" :key="scope">
            <td>
              <code class="catalog-scope-code">{{ scope }}</code>
            </td>
            <td>
              <Input
                :value="text(catalog, 'zh-CN', 'scopes', scope)"
                :disabled="disabled"
                :aria-label="scope + ' zh-CN'"
                @update:value="(value: any) => setText(catalog, 'zh-CN', 'scopes', scope, value)"
              />
            </td>
            <td>
              <Input
                :value="text(catalog, 'en-US', 'scopes', scope)"
                :disabled="disabled"
                :aria-label="scope + ' en-US'"
                @update:value="(value: any) => setText(catalog, 'en-US', 'scopes', scope, value)"
              />
            </td>
            <td>
              <div class="catalog-scope-actions">
                <Button
                  :disabled="disabled || i === 0"
                  :aria-label="t('up') + ' ' + scope"
                  :title="t('up')"
                  @click="move(i, -1)"
                >
                  <template #icon><IconifyIcon icon="lucide:arrow-up" /></template>
                </Button>
                <Button
                  :disabled="disabled || i === catalog.scopes.length - 1"
                  :aria-label="t('down') + ' ' + scope"
                  :title="t('down')"
                  @click="move(i, 1)"
                >
                  <template #icon><IconifyIcon icon="lucide:arrow-down" /></template>
                </Button>
                <Button type="text" danger :disabled="disabled" @click="removeScope(scope)">{{
                  t('remove')
                }}</Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <FormItem
      class="catalog-add-scope"
      :validate-status="error ? 'error' : undefined"
      :help="error ? t(error) : t('scopeIdentifierHint')"
    >
      <div class="catalog-actions">
        <Input
          :value="ui.newScope"
          :disabled="disabled"
          :aria-label="t('newScope')"
          :placeholder="t('newScope')"
          autocapitalize="none"
          :spellcheck="false"
          @update:value="updateNewScope"
          @press-enter="addScope"
        />
        <Button :disabled="disabled" @click="addScope">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          {{ t('add') }}
        </Button>
      </div>
    </FormItem>
  </section>
</template>
