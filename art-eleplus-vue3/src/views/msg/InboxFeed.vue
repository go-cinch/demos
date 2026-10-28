<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { $t } from '@/locales'
  import { adminDate } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  import { useInboxFeed } from './use-inbox-feed'
  const emit = defineEmits<{ close: [] }>(),
    zone = useAdminTimezone(),
    open = ref(false)
  const {
    canControl,
    canSelect,
    rows,
    total,
    unread,
    filter,
    filters,
    draft,
    query,
    loading,
    loadingMore,
    error,
    moreError,
    busy,
    expanded,
    detailLoading,
    detailError,
    selecting,
    selected,
    viewport,
    newMessages,
    hasMore,
    options,
    suggesting,
    refresh,
    more,
    onScroll,
    search,
    suggest,
    scheduleSearch,
    cancelSearch,
    choose,
    segments,
    toggle,
    mark,
    readAll,
    confirmAction,
    check
  } = useInboxFeed()
  const text = (key: string, params: Record<string, string | number> = {}) =>
    $t(`pc.msg.${key}`, params)
  const all = computed(
    () => rows.value.length > 0 && rows.value.every((row) => selected.value.includes(row.id))
  )
  function changeFilter(value: string) {
    filter.value = value as typeof filter.value
  }
  function selectedOption(value: string) {
    open.value = false
    choose(value)
  }
</script>
<template>
  <section class="inbox-shell" data-testid="message-history" :aria-label="text('history')"
    ><header
      ><div class="inbox-heading"
        ><div
          ><p>{{ text('feedCenter') }}</p
          ><h2>{{ text('inbox') }}</h2></div
        ><ElButton text :aria-label="text('close')" @click="emit('close')"
          ><ArtSvgIcon icon="ri:close-line" /></ElButton></div
      ><div class="inbox-count"
        ><ElTag v-if="unread !== undefined" data-testid="inbox-unread">{{
          text('count', { count: unread })
        }}</ElTag
        ><ElButton
          v-if="canControl('read-all')"
          text
          :disabled="busy || loading || !unread"
          @click="readAll"
          >{{ text('readAll') }}</ElButton
        ></div
      ><div class="inbox-search"
        ><ElInput
          v-model="draft"
          :aria-label="text('searchMessages')"
          :placeholder="text('searchMessages')"
          clearable
          autocomplete="off"
          @input="
            (value) => {
              open = true
              suggest(String(value))
            }
          "
          @focus="
            () => {
              open = true
              cancelSearch()
            }
          "
          @blur="
            () => {
              open = false
              scheduleSearch()
            }
          "
          @keyup.enter="
            () => {
              open = false
              search()
            }
          "
          @keydown.esc.stop="open = false"
        /><div v-if="open && (options.length || suggesting)" role="listbox" class="search-options"
          ><ElSkeleton v-if="suggesting" animated :rows="2" /><button
            v-for="option in options"
            :key="option.value"
            type="button"
            role="option"
            :aria-selected="false"
            @mousedown.prevent
            @click="selectedOption(option.value)"
            ><span
              v-for="(segment, index) in segments(option.value)"
              :key="index"
              :class="{ match: segment.matched }"
              >{{ segment.text }}</span
            ><ElTag v-if="option.source === 'history'" size="small">{{
              text('searchHistory')
            }}</ElTag></button
          ></div
        ></div
      ><div class="inbox-toolbar"
        ><div role="group" :aria-label="text('feedFilters')" class="inbox-filters"
          ><button
            v-for="item in filters"
            :key="item.value"
            type="button"
            :aria-pressed="filter === item.value"
            :disabled="busy"
            @click="changeFilter(item.value)"
            >{{ item.label }}</button
          ></div
        ><ElButton text :disabled="busy || loading" :aria-label="text('refresh')" @click="refresh()"
          ><ArtSvgIcon icon="ri:refresh-line" /></ElButton
        ><ElButton
          v-if="canSelect"
          text
          :disabled="busy || loading"
          @click="
            () => {
              selecting = !selecting
              selected = []
            }
          "
          >{{ text(selecting ? 'cancel' : 'select') }}</ElButton
        ></div
      ><div v-if="selecting && canSelect" class="inbox-selection"
        ><ElCheckbox
          :model-value="all"
          :indeterminate="selected.length > 0 && !all"
          :disabled="busy || loading || !rows.length"
          :aria-label="text('feedSelectLoaded')"
          @change="selected = $event ? rows.map((row) => row.id) : []"
          >{{ text('feedSelectLoaded') }}</ElCheckbox
        ><template v-if="selected.length"
          ><ElButton
            size="small"
            :disabled="busy || loading"
            v-if="canControl('mark-selected-read')"
            data-testid="message-bulk-read"
            @click="confirmAction(true, selected, true)"
            >{{ text('markRead') }}</ElButton
          ><ElButton
            size="small"
            type="danger"
            plain
            :disabled="busy || loading"
            data-testid="message-bulk-delete"
            v-if="canControl('delete-selected')"
            @click="confirmAction(false, selected, true)"
            >{{ text('deleteSelected') }}</ElButton
          ></template
        ></div
      ></header
    ><div
      ref="viewport"
      class="inbox-scroll"
      data-testid="inbox-scroll"
      :aria-busy="loading || loadingMore"
      @scroll.passive="onScroll"
      ><ElButton
        v-if="newMessages"
        class="inbox-update"
        :disabled="busy || loading"
        @click="refresh()"
        >{{ text('feedUpdates') }}</ElButton
      ><ElAlert v-if="error" type="error" :closable="false" :title="text('error')"
        ><ElButton @click="refresh()">{{ text('retry') }}</ElButton></ElAlert
      ><div v-if="loading && !rows.length" class="inbox-skeleton"
        ><ElSkeleton v-for="id in 4" :key="id" animated :rows="3" /></div
      ><ElEmpty
        v-else-if="!rows.length && !error"
        :description="text(query ? 'feedNoMatch' : filter === 'unread' ? 'feedNoUnread' : 'empty')"
      /><template v-for="(row, index) in rows" :key="row.id"
        ><div
          v-if="
            !index ||
            adminDate(rows[index - 1]!.published_at, zone).slice(0, 10) !==
              adminDate(row.published_at, zone).slice(0, 10)
          "
          class="inbox-day"
          >{{ adminDate(row.published_at, zone).slice(0, 10) }}</div
        ><article class="inbox-message" data-testid="inbox-message" :aria-label="row.title"
          ><ElCheckbox
            v-if="selecting && canSelect"
            :model-value="selected.includes(row.id)"
            :disabled="busy || loading"
            :aria-label="`${text('select')} ${row.title}`"
            @change="check(row.id, Boolean($event))"
          /><div v-else class="message-type"
            ><ArtSvgIcon
              :icon="
                row.type === 'notice' ? 'ri:notification-3-line' : 'ri:information-line'
              " /></div
          ><div class="inbox-copy"
            ><div class="inbox-meta"
              ><span>{{ text(row.type) }}</span
              ><time>{{ adminDate(row.published_at, zone) }}</time
              ><span class="inbox-status" :class="{ unread: !row.read_at }"
                ><span v-if="!row.read_at && canControl('mark-read')" aria-hidden="true">• </span
                ><span>{{ text(row.read_at ? 'read' : 'unread') }}</span></span
              ></div
            ><h3>{{ row.title }}</h3
            ><p
              :id="`inbox-content-${row.id}`"
              class="inbox-content"
              :class="{ 'is-expanded': expanded.includes(row.id) }"
              >{{ expanded.includes(row.id) ? row.content : row.summary }}</p
            ><ElAlert
              v-if="detailError === row.id"
              type="error"
              :closable="false"
              :title="text('detailError')"
              ><ElButton @click="toggle(row)">{{ text('retry') }}</ElButton></ElAlert
            ><div class="inbox-actions"
              ><ElButton
                link
                type="primary"
                :loading="detailLoading === row.id"
                :disabled="busy || loading"
                :aria-expanded="expanded.includes(row.id)"
                :aria-controls="`inbox-content-${row.id}`"
                @click="toggle(row)"
                >{{ text(expanded.includes(row.id) ? 'feedCollapse' : 'feedExpand') }}</ElButton
              ><ElButton
                v-if="!row.read_at && canControl('mark-read')"
                link
                type="primary"
                :disabled="busy || loading"
                @click="mark(row)"
                >{{ text('markRead') }}</ElButton
              ><ElButton
                text
                :disabled="busy || loading"
                class="inbox-delete"
                v-if="canControl('delete')"
                @click="confirmAction(false, [row.id])"
                >{{ text('delete') }}</ElButton
              ></div
            ></div
          ></article
        ></template
      ><div v-if="rows.length" class="inbox-end" aria-live="polite"
        ><span v-if="loadingMore">{{ text('feedLoadingMore') }}</span
        ><template v-else-if="moreError"
          ><span>{{ text('error') }}</span
          ><ElButton text @click="more">{{ text('retry') }}</ElButton></template
        ><ElButton v-else-if="hasMore" text :disabled="busy || loading" @click="more">{{
          text('feedLoadMore')
        }}</ElButton
        ><span v-else>{{ text('feedEnd') }}</span></div
      ></div
    ><footer
      ><span>{{ text('feedShown', { count: rows.length, total }) }}</span
      ><span>{{ text('feedOrder') }}</span></footer
    ></section
  >
</template>
<style scoped>
  .inbox-shell {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
  }
  .inbox-shell header {
    flex: none;
    border-bottom: 1px solid var(--el-border-color);
    padding-bottom: 12px;
  }
  .inbox-heading,
  .inbox-count,
  .inbox-toolbar,
  .inbox-selection {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .inbox-heading p {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .inbox-heading h2 {
    font-size: 22px;
    font-weight: 600;
    margin-top: 10px;
  }
  .inbox-count {
    margin: 16px 0;
  }
  .inbox-search {
    position: relative;
  }
  .search-options {
    position: absolute;
    top: 100%;
    z-index: 30;
    max-height: 260px;
    overflow: auto;
    width: 100%;
    margin-top: 5px;
    padding: 8px;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    box-shadow: var(--el-box-shadow-light);
  }
  .search-options button {
    display: block;
    width: 100%;
    padding: 10px;
    text-align: start;
    border: 0;
    background: transparent;
    color: var(--el-text-color-primary);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .search-options button:hover {
    background: var(--el-fill-color-light);
  }
  .search-options .el-tag {
    margin-left: 8px;
  }
  .match {
    color: var(--el-color-primary);
    font-weight: 600;
  }
  .inbox-toolbar {
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .inbox-filters {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 18px;
  }
  .inbox-filters button {
    padding: 12px 0;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    cursor: pointer;
  }
  .inbox-filters button[aria-pressed='true'] {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }
  .inbox-selection {
    flex-wrap: wrap;
    justify-content: start;
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 10px;
  }
  .inbox-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    overflow-anchor: none;
    padding: 0 4px;
  }
  .inbox-update {
    margin-top: 15px;
  }
  .inbox-day {
    padding: 20px 0 2px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .inbox-message {
    display: flex;
    align-items: start;
    gap: 14px;
    padding: 20px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .message-type {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--el-border-radius-base);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 21px;
  }
  .inbox-copy {
    flex: 1;
    min-width: 0;
  }
  .inbox-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .inbox-status {
    margin-left: auto;
  }
  .inbox-status.unread {
    color: var(--el-color-primary);
  }
  .inbox-message h3 {
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
    margin: 8px 0;
  }
  .inbox-content {
    font-size: 13px;
    line-height: 1.8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--el-text-color-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .inbox-content.is-expanded {
    display: block;
    color: var(--el-text-color-primary);
  }
  .inbox-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
  }
  .inbox-actions .el-button + .el-button {
    margin-left: 0;
  }
  .inbox-actions .inbox-delete {
    margin-left: auto;
  }
  .inbox-skeleton {
    display: grid;
    gap: 24px;
    padding: 24px 0;
  }
  .inbox-end {
    text-align: center;
    padding: 24px 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .inbox-shell footer {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid var(--el-border-color);
    padding-top: 14px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
