<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import {
    Alert,
    Button,
    Drawer,
    FormItem,
    Input,
    Modal,
    Pagination,
    Segmented,
    Switch,
    Tag
  } from '@/components/catalog/element-adapter'
  import type { Catalog, EditorUI } from './catalog-model'
  import { assign, at, editor, messageCategories, messagePaths } from './catalog-model'
  import { $t } from '@/locales'
  const props = defineProps<{
    catalog: Catalog
    ui: EditorUI
    disabled: boolean
  }>()
  const emit = defineEmits<{ openResources: [] }>()
  const t = (key: string) => $t(`developer.${key}`)
  const categoryHint = (category: string) => t(`messageCategoryHint.${category}`)
  const formBody = ref<HTMLElement>()
  watch(
    () => props.ui.category,
    (category) => {
      if (!messageCategories.includes(category)) {
        props.ui.category = 'frontend'
        props.ui.messagePage = 1
      }
    },
    { immediate: true }
  )
  watch(
    () => props.ui.buffer,
    async (buffer) => {
      if (!buffer) return
      if (buffer.kind === 'message' && !messageCategories.includes(buffer.category))
        buffer.category = 'frontend'
      await nextTick()
      if (formBody.value) formBody.value.scrollTop = props.ui.bufferScroll
    },
    { immediate: true }
  )
  const error = ref('')
  const paths = computed(() => [
    ...new Map(
      ['zh-CN', 'en-US']
        .flatMap((locale) => messagePaths(props.catalog.messages[locale]?.[props.ui.category]))
        .map((path) => [JSON.stringify(path), path])
    ).values()
  ])
  const value = (locale: string, path: string[]) =>
    String(at(props.catalog.messages, [locale, props.ui.category, ...path]) ?? '')
  const filtered = computed(() =>
    paths.value.filter((path) => {
      const q = props.ui.messageQuery.toLocaleLowerCase()
      return (
        (!props.ui.missingOnly || !value('zh-CN', path) || !value('en-US', path)) &&
        (!q ||
          [path.join('.'), value('zh-CN', path), value('en-US', path)].some((v) =>
            v.toLocaleLowerCase().includes(q)
          ))
      )
    })
  )
  const rows = computed(() =>
    filtered.value.slice((props.ui.messagePage - 1) * 20, props.ui.messagePage * 20)
  )
  function set(locale: string, path: string[], next: string) {
    assign(props.catalog.messages, [locale, props.ui.category, ...path], next)
  }
  function create() {
    props.ui.bufferScroll = 0
    props.ui.buffer = editor('message')
    props.ui.buffer.category = props.ui.category
    error.value = ''
  }
  function apply() {
    const b = props.ui.buffer
    if (!b) return
    const path = b.key.split('.')
    if (
      path.some((key) => !key.trim() || ['__proto__', 'prototype', 'constructor'].includes(key))
    ) {
      error.value = 'invalid'
      return
    }
    if (
      ['zh-CN', 'en-US'].some(
        (locale) => at(props.catalog.messages, [locale, b.category, ...path]) !== undefined
      )
    ) {
      error.value = 'duplicate'
      return
    }
    for (let i = 1; i < path.length; i++) {
      if (
        ['zh-CN', 'en-US'].some(
          (locale) =>
            typeof at(props.catalog.messages, [locale, b.category, ...path.slice(0, i)]) ===
            'string'
        )
      ) {
        error.value = 'pathCollision'
        return
      }
    }
    assign(props.catalog.messages, ['zh-CN', b.category, ...path], b.zh)
    assign(props.catalog.messages, ['en-US', b.category, ...path], b.en)
    props.ui.buffer = null
  }
  function remove(path: string[]) {
    Modal.confirm({
      title: t('deleteConfirm'),
      content: path.join('.'),
      okText: t('delete'),
      cancelText: t('cancel'),
      okButtonProps: { danger: true },
      onOk() {
        for (const locale of Object.keys(props.catalog.messages))
          assign(props.catalog.messages, [locale, props.ui.category, ...path], undefined)
      }
    })
  }
  function close() {
    Modal.confirm({
      title: t('discardForm'),
      content: t('discardFormHint'),
      okText: t('discard'),
      cancelText: t('continue'),
      onOk: () => {
        props.ui.buffer = null
      }
    })
  }
</script>
<template>
  <div class="catalog-section-heading">
    <h2>{{ t('messages') }}</h2>
    <p>{{ t('messagesDescription') }}</p>
  </div>
  <Alert
    class="catalog-messages-guide"
    type="info"
    show-icon
    :message="t('resourceNamesShared')"
    :description="t('resourceNamesSharedHint')"
  >
    <template #action>
      <Button type="link" @click="emit('openResources')">{{ t('openResourceCatalog') }}</Button>
    </template>
  </Alert>
  <div class="catalog-filter catalog-message-filter">
    <FormItem :label="t('category')" html-for="developer-message-category"
      ><Segmented
        id="developer-message-category"
        v-model:value="ui.category"
        class="catalog-scope-switch"
        :aria-label="t('category')"
        aria-describedby="developer-message-category-hint"
        :options="messageCategories"
        @change="ui.messagePage = 1"
    /></FormItem>
    <FormItem :label="t('keyword')" html-for="developer-message-query"
      ><Input
        id="developer-message-query"
        v-model:value="ui.messageQuery"
        :aria-label="t('searchMessages')"
        :placeholder="t('searchMessages')"
        allow-clear
        @update:value="ui.messagePage = 1"
    /></FormItem>
    <div class="catalog-actions">
      <Switch
        v-model:checked="ui.missingOnly"
        :aria-label="t('missingOnly')"
        @change="ui.messagePage = 1"
      /><span>{{ t('missingOnly') }}</span>
    </div>
    <p id="developer-message-category-hint" class="catalog-message-category-hint">
      {{ categoryHint(ui.category) }}
    </p>
  </div>
  <div class="catalog-card">
    <div class="catalog-row">
      <Button type="primary" :disabled="disabled" data-testid="add-message" @click="create">{{
        t('addMessage')
      }}</Button
      ><span class="catalog-muted">{{ t('inlineHint') }}</span>
    </div>
    <div class="catalog-table-wrap">
      <table class="catalog-table catalog-messages-table" data-testid="messages-table">
        <thead>
          <tr>
            <th>{{ t('messageKey') }}</th>
            <th>{{ t('zh') }} <code>zh-CN</code></th>
            <th>English <code>en-US</code></th>
            <th>{{ t('status') }}</th>
            <th>{{ t('actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="path in rows" :key="JSON.stringify(path)" :data-message-key="path.join('.')">
            <td>
              <code>{{ path.join('.') }}</code
              ><small>{{ ui.category }}</small>
            </td>
            <td>
              <Input.TextArea
                :value="value('zh-CN', path)"
                :aria-label="path.join('.') + ' zh-CN'"
                :disabled="disabled"
                :status="!value('zh-CN', path) ? 'warning' : undefined"
                :auto-size="{ minRows: 1, maxRows: 4 }"
                @update:value="(next: any) => set('zh-CN', path, next)"
              /><small v-if="!value('zh-CN', path)" class="catalog-warning">{{
                t('translation')
              }}</small>
            </td>
            <td>
              <Input.TextArea
                :value="value('en-US', path)"
                :aria-label="path.join('.') + ' en-US'"
                :disabled="disabled"
                :status="!value('en-US', path) ? 'warning' : undefined"
                :auto-size="{ minRows: 1, maxRows: 4 }"
                @update:value="(next: any) => set('en-US', path, next)"
              /><small v-if="!value('en-US', path)" class="catalog-warning">{{
                t('translation')
              }}</small>
            </td>
            <td>
              <Tag :color="!value('zh-CN', path) || !value('en-US', path) ? 'orange' : 'green'">{{
                t(!value('zh-CN', path) || !value('en-US', path) ? 'missing' : 'complete')
              }}</Tag>
            </td>
            <td>
              <Button type="link" danger :disabled="disabled" @click="remove(path)">{{
                t('delete')
              }}</Button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="5">{{ t('empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pagination
      v-model:current="ui.messagePage"
      :total="filtered.length"
      :page-size="20"
      :show-size-changer="false"
      :show-total="(total: any) => t('total') + ' ' + total"
    />
  </div>
  <Drawer
    :open="ui.buffer?.kind === 'message'"
    :title="t('addMessage')"
    :width="600"
    :mask-closable="false"
    @close="close"
  >
    <div
      v-if="ui.buffer?.kind === 'message'"
      data-testid="message-editor"
      class="catalog-editor catalog-editor-scroll"
      ref="formBody"
      @scroll="(event: any) => (ui.bufferScroll = (event.target as HTMLElement).scrollTop)"
    >
      <FormItem :label="t('category')"
        ><Segmented
          v-model:value="ui.buffer.category"
          class="catalog-scope-switch"
          :disabled="disabled"
          :options="messageCategories"
          :aria-label="t('category')"
          aria-describedby="developer-message-editor-category-hint"
      /></FormItem>
      <p id="developer-message-editor-category-hint" class="catalog-muted">
        {{ categoryHint(ui.buffer.category) }}
      </p>
      <FormItem
        :label="t('messageKey')"
        required
        :validate-status="error ? 'error' : undefined"
        :help="error ? t(error) : t('messagePathHint')"
        ><Input
          v-model:value="ui.buffer.key"
          :aria-label="t('identifier')"
          :disabled="disabled"
          data-testid="message-key"
      /></FormItem>
      <FormItem :label="t('zh')"
        ><Input.TextArea
          v-model:value="ui.buffer.zh"
          :aria-label="t('zh')"
          :disabled="disabled"
          data-testid="message-zh"
      /></FormItem>
      <FormItem label="English"
        ><Input.TextArea
          v-model:value="ui.buffer.en"
          aria-label="English"
          :disabled="disabled"
          data-testid="message-en"
      /></FormItem>
      <p class="catalog-muted">{{ t('bufferSaved') }}</p>
    </div>
    <template #footer
      ><div class="catalog-actions">
        <Button @click="close">{{ t('cancel') }}</Button
        ><Button type="primary" :disabled="disabled" data-testid="apply-message" @click="apply">{{
          t('applyDraft')
        }}</Button>
      </div></template
    >
  </Drawer>
</template>
