<script setup lang="ts">
import { computed, ref, useId } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { AutoComplete, Button, Checkbox, Empty, Skeleton, Spin, Tag } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import MessageTypeIcon from '#/components/message-type-icon.vue';
import { renderSkeletonOptions } from '#/components/skeleton-options';
import { $t } from '#/locales';

import { useInboxFeed } from './use-inbox-feed';

const emit = defineEmits<{ close: [] }>();
const timezone = useTimezoneStore();
const searchId = useId();
const searchOpen = ref(false);
const {
  rows, total, unread, filter, filters, draft, query, loading, loadingMore, error, moreError,
  busy, expanded, detailLoading, detailError, selecting, selected, viewport, newMessages, hasMore,
  options, suggesting, refresh, more, onScroll, search, suggest, scheduleSearch, cancelSearch,
  choose, segments, toggle, mark, readAll, confirmAction, check,
} = useInboxFeed();
const allSelected = computed(() => rows.value.length > 0 && rows.value.every((row) => selected.value.includes(row.id)));
function time(value: number) { void timezone.timezone; return formatDateTime(value); }
function day(value: number) { return time(value).slice(0, 10); }
function changeFilter(value: string) { filter.value = value as typeof filter.value; }
function setViewport(element: unknown) { viewport.value = element instanceof HTMLElement ? element : undefined; }
function submitSearch() { searchOpen.value = false; search(); }
function searchKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    submitSearch();
  } else if (event.key === 'Escape') {
    event.stopPropagation();
    searchOpen.value = false;
  }
}
function selectSuggestion(value: unknown) { searchOpen.value = false; choose(value); }
</script>
<template>
  <section class="inbox-shell" role="dialog" aria-modal="true" :aria-label="$t('msg.history')" data-testid="message-history">
    <header class="inbox-header">
      <div class="inbox-breadcrumb">
        <span>{{ $t('msg.feedCenter') }}</span><span aria-hidden="true">/</span><span>{{ $t('msg.history') }}</span>
        <Button type="text" class="inbox-close" :aria-label="$t('msg.close')" @click="emit('close')"><IconifyIcon icon="lucide:x" /></Button>
      </div>
      <div class="inbox-title">
        <h2>{{ $t('msg.inbox') }}</h2>
        <Tag v-if="unread !== undefined" color="blue" data-testid="inbox-unread">{{ $t('msg.count', { count: unread }) }}</Tag>
        <Button type="link" :disabled="busy || loading" @click="readAll">{{ $t('msg.readAll') }}</Button>
      </div>
      <label :for="searchId" class="sr-only">{{ $t('msg.searchMessages') }}</label>
      <AutoComplete
        :id="searchId"
        v-model:value="draft"
        class="inbox-search"
        allow-clear
        autocomplete="off"
        :aria-label="$t('msg.searchMessages')"
        :placeholder="$t('msg.searchMessages')"
        :filter-option="false"
        :default-active-first-option="false"
        :show-action="['focus']"
        :options="options"
        :open="searchOpen && (options.length > 0 || suggesting)"
        :disabled="busy"
        :not-found-content="suggesting ? ' ' : null"
        :dropdown-render="({ menuNode } = {}) => renderSkeletonOptions(menuNode, suggesting)"
        @search="(value) => { searchOpen = true; suggest(value); }"
        @select="selectSuggestion"
        @focus="searchOpen = true; cancelSearch()"
        @blur="searchOpen = false; scheduleSearch()"
        @input-key-down="searchKeydown"
      >
        <template #option="{ value, source }">
          <span v-for="(segment, index) in segments(String(value))" :key="index" :class="{ 'text-primary font-semibold': segment.matched }">{{ segment.text }}</span>
          <Tag v-if="source === 'history'">{{ $t('msg.searchHistory') }}</Tag>
        </template>
      </AutoComplete>
      <div class="inbox-toolbar">
        <div class="inbox-filters" :aria-label="$t('msg.feedFilters')" role="group">
          <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" :disabled="busy" @click="changeFilter(item.value)">{{ item.label }}</button>
        </div>
        <Button type="text" :disabled="busy || loading" :aria-label="$t('msg.refresh')" @click="refresh()"><IconifyIcon icon="lucide:refresh-cw" /></Button>
        <Button type="text" :disabled="busy || loading" :aria-pressed="selecting" @click="selecting = !selecting; selected = []">{{ $t(selecting ? 'msg.cancel' : 'msg.select') }}</Button>
      </div>
      <div v-if="selecting" class="inbox-selection">
        <Checkbox :checked="allSelected" :indeterminate="selected.length > 0 && !allSelected" :disabled="busy || loading || !rows.length" :aria-label="$t('msg.feedSelectLoaded')" @change="selected = $event.target.checked ? rows.map((row) => row.id) : []">{{ $t('msg.feedSelectLoaded') }}</Checkbox>
        <template v-if="selected.length">
          <Button size="small" :disabled="busy || loading" data-testid="message-bulk-read" @click="confirmAction(true, selected, true)">{{ $t('msg.markRead') }}</Button>
          <Button size="small" danger :disabled="busy || loading" data-testid="message-bulk-delete" @click="confirmAction(false, selected, true)">{{ $t('msg.deleteSelected') }}</Button>
        </template>
      </div>
    </header>
    <div :ref="setViewport" class="inbox-scroll" data-testid="inbox-scroll" :aria-busy="loading || loadingMore" @scroll.passive="onScroll">
      <Button v-if="newMessages" block class="inbox-update" :disabled="busy || loading" @click="refresh()">{{ $t('msg.feedUpdates') }}</Button>
      <LoadWarning v-if="error"><template #action><Button size="small" @click="refresh()">{{ $t('msg.retry') }}</Button></template></LoadWarning>
      <div v-if="loading && !rows.length" class="inbox-skeleton"><Skeleton v-for="n in 4" :key="n" active avatar :paragraph="{ rows: 2 }" /></div>
      <Empty v-else-if="!rows.length && !error" :image="Empty.PRESENTED_IMAGE_SIMPLE" :description="$t(query ? 'msg.feedNoMatch' : filter === 'unread' ? 'msg.feedNoUnread' : 'msg.empty')" class="inbox-empty" />
      <template v-for="(row, index) in rows" :key="row.id">
        <div v-if="!index || day(rows[index - 1]!.published_at) !== day(row.published_at)" class="inbox-day">{{ day(row.published_at) }}</div>
        <article class="inbox-message" :aria-label="row.title" data-testid="inbox-message">
          <Checkbox v-if="selecting" :checked="selected.includes(row.id)" :disabled="busy || loading" :aria-label="`${$t('msg.select')} ${row.title}`" @change="check(row.id, $event.target.checked)" />
          <MessageTypeIcon v-else :type="row.type" />
          <div class="inbox-copy">
            <div class="inbox-meta"><span>{{ $t(`msg.${row.type}`) }}</span><time>{{ time(row.published_at) }}</time><span class="inbox-status" :data-read="!!row.read_at"><span v-if="!row.read_at" class="inbox-dot" aria-hidden="true"></span>{{ $t(row.read_at ? 'msg.read' : 'msg.unread') }}</span></div>
            <h3>{{ row.title }}</h3>
            <p :id="`inbox-content-${row.id}`" class="inbox-content" :class="{ 'is-expanded': expanded.includes(row.id) }">{{ expanded.includes(row.id) ? row.content : row.summary }}</p>
            <LoadWarning v-if="detailError === row.id"><template #action><Button size="small" @click="toggle(row)">{{ $t('msg.retry') }}</Button></template></LoadWarning>
            <div class="inbox-actions">
              <Button type="link" :loading="detailLoading === row.id" :disabled="busy || loading || (detailLoading !== undefined && detailLoading !== row.id)" :aria-expanded="expanded.includes(row.id)" :aria-controls="`inbox-content-${row.id}`" @click="toggle(row)">{{ $t(expanded.includes(row.id) ? 'msg.feedCollapse' : 'msg.feedExpand') }}</Button>
              <Button v-if="!row.read_at" type="link" :disabled="busy || loading" @click="mark(row)">{{ $t('msg.markRead') }}</Button>
              <Button class="inbox-delete" type="text" :disabled="busy || loading" @click="confirmAction(false, [row.id])">{{ $t('msg.delete') }}</Button>
            </div>
          </div>
        </article>
      </template>
      <div v-if="rows.length" class="inbox-end" aria-live="polite">
        <template v-if="loadingMore"><Spin size="small" /> {{ $t('msg.feedLoadingMore') }}</template>
        <template v-else-if="moreError"><span>{{ $t('msg.error') }}</span><Button type="link" @click="more">{{ $t('msg.retry') }}</Button></template>
        <Button v-else-if="hasMore" type="text" :disabled="busy || loading" @click="more">{{ $t('msg.feedLoadMore') }}</Button>
        <span v-else>{{ $t('msg.feedEnd') }}</span>
      </div>
    </div>
    <footer class="inbox-footer"><span>{{ $t('msg.feedShown', { count: rows.length, total }) }}</span><span>{{ $t('msg.feedOrder') }}</span></footer>
  </section>
</template>
<style scoped>
.inbox-shell { display: flex; height: 100%; min-height: 0; flex-direction: column; background: hsl(var(--card)); color: hsl(var(--foreground)); }
.inbox-header { flex: none; padding: 24px 28px 0; border-bottom: 1px solid hsl(var(--border)); }
.inbox-breadcrumb { display: flex; align-items: center; gap: 10px; color: hsl(var(--muted-foreground)); font-size: 12px; margin-bottom: 12px; }
.inbox-close { margin: -8px -10px -8px auto; }
.inbox-title { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.inbox-title h2 { margin: 0; font-size: 22px; font-weight: 650; }
.inbox-title :deep(.ant-tag) { margin: 0; }
.inbox-title > :last-child { margin-left: auto; padding-right: 0; }
.inbox-search { display: block; width: 100%; margin-top: 20px; }
.inbox-search :deep(.ant-select-selector) { min-height: 38px; align-items: center; border-radius: calc(var(--radius) * .875); }
.inbox-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.inbox-filters { display: flex; flex: 1; align-items: center; flex-wrap: wrap; gap: 20px; }
.inbox-filters button { padding: 14px 0; border: 0; border-bottom: 2px solid transparent; background: none; color: hsl(var(--muted-foreground)); font-size: 13px; cursor: pointer; }
.inbox-filters button[aria-pressed='true'] { color: hsl(var(--primary)); border-bottom-color: hsl(var(--primary)); }
.inbox-filters button:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
.inbox-filters button:disabled { cursor: not-allowed; opacity: .5; }
.inbox-selection { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid hsl(var(--border)); }
.inbox-selection :deep(.ant-checkbox-wrapper) { margin-right: auto; }
.inbox-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 0 28px; overflow-anchor: none; }
.inbox-update { margin-top: 16px; }
.inbox-day { display: flex; align-items: center; gap: 12px; padding: 20px 0 2px; font-size: 12px; color: hsl(var(--muted-foreground)); }
.inbox-day::after { content: ''; flex: 1; height: 1px; background: hsl(var(--border)); }
.inbox-message { display: flex; align-items: flex-start; gap: 14px; padding: 20px 0; border-bottom: 1px solid hsl(var(--border)); }
.inbox-message > :first-child { flex: none; margin-top: 3px; }
.inbox-copy { flex: 1; min-width: 0; }
.inbox-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 12px; color: hsl(var(--muted-foreground)); }
.inbox-meta time { font-variant-numeric: tabular-nums; }
.inbox-status { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; white-space: nowrap; }
.inbox-status[data-read='false'] { color: hsl(var(--primary)); }
.inbox-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.inbox-message h3 { margin: 7px 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.inbox-content { margin: 0; color: hsl(var(--muted-foreground)); font-size: 13px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.inbox-content.is-expanded { display: block; color: hsl(var(--foreground)); }
.inbox-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.inbox-actions :deep(.ant-btn) { height: auto; padding: 3px 0; font-size: 12px; }
.inbox-actions .inbox-delete { margin-left: auto; color: hsl(var(--muted-foreground)); }
.inbox-end { padding: 22px 0; text-align: center; color: hsl(var(--muted-foreground)); font-size: 12px; }
.inbox-footer { flex: none; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 14px 28px; border-top: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); font-size: 12px; }
.inbox-skeleton { display: grid; gap: 28px; padding: 28px 0; }
.inbox-empty { margin: 64px 0; }
@media (max-width: 600px) { .inbox-header { padding: 20px 18px 0; } .inbox-scroll { padding-inline: 18px; } .inbox-footer { padding-inline: 18px; } .inbox-filters { gap: 14px; } }
</style>
