<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Checkbox, Empty, Skeleton, Spin, Tag } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import MessageTypeIcon from '#/components/message-type-icon.vue';
import SearchAutocomplete from '#/components/search-autocomplete.vue';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';

import { useInboxFeed } from './use-inbox-feed';

const props = defineProps<{ messageTitle?: string }>();
const emit = defineEmits<{ close: [] }>();
const { hasButton } = usePermissions();
const canControl = (control: string) =>
  hasButton(`admin:btn:msg:inbox:${control}`);
const messageId = defineModel<number>('messageId');
const searchInput = ref<{ focus: () => void }>();
const timezone = useTimezoneStore();
const searchId = useId();
const {
  rows,
  availableIds,
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
  detailFailure,
  selecting,
  selected,
  viewport,
  newMessages,
  hasMore,
  options,
  suggesting,
  removeHistory,
  refresh,
  more,
  onScroll,
  search,
  suggest,
  scheduleSearch,
  cancelSearch,
  choose,
  toggle,
  mark,
  readAll,
  confirmAction,
  check,
} = useInboxFeed(messageId);
async function clearMessageFilter() {
  if (busy.value) return;
  messageId.value = undefined;
  await nextTick();
  searchInput.value?.focus();
}
watch(
  [messageId, expanded],
  async ([id, opened]) => {
    if (id === undefined || !opened.includes(id)) return;
    await nextTick();
    if (messageId.value !== id) return;
    viewport.value
      ?.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
      ?.focus({ preventScroll: true });
  },
  { deep: true, flush: 'post' },
);
const allSelected = computed(
  () =>
    availableIds.value.length > 0 &&
    availableIds.value.every((id) => selected.value.includes(id)),
);
function time(value: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
function day(value: number) {
  return time(value).slice(0, 10);
}
function changeFilter(value: string) {
  filter.value = value as typeof filter.value;
}
function setViewport(element: unknown) {
  viewport.value = element instanceof HTMLElement ? element : undefined;
}
</script>
<template>
  <section
    class="inbox-shell"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('msg.history')"
    data-testid="message-history"
  >
    <header class="inbox-header">
      <div class="inbox-breadcrumb">
        <span>{{ $t('msg.feedCenter') }}</span
        ><span aria-hidden="true">/</span><span>{{ $t('msg.history') }}</span>
        <Button
          type="text"
          class="inbox-close"
          :aria-label="$t('msg.close')"
          @click="emit('close')"
          ><IconifyIcon icon="lucide:x"
        /></Button>
      </div>
      <div class="inbox-title">
        <h2>{{ $t('msg.inbox') }}</h2>
        <Tag
          v-if="unread !== undefined"
          color="blue"
          data-testid="inbox-unread"
          >{{ $t('msg.count', { count: unread }) }}</Tag
        >
        <Button
          v-if="canControl('read-all')"
          type="link"
          :disabled="busy || loading"
          @click="readAll"
          >{{ $t('msg.readAll') }}</Button
        >
      </div>
      <div
        v-if="messageId !== undefined"
        class="inbox-active-filters"
        role="group"
        :aria-label="$t('msg.activeFilters')"
        data-testid="inbox-active-filters"
      >
        <Tag color="blue" class="inbox-id-filter">
          <span>{{
            $t('msg.messageFilter', {
              title:
                props.messageTitle ||
                rows.find((row) => row.id === messageId)?.title ||
                $t('msg.selectedMessage'),
            })
          }}</span>
          <button
            type="button"
            :disabled="busy"
            :aria-label="$t('msg.clearMessageFilter')"
            @click="clearMessageFilter"
          >
            <IconifyIcon icon="lucide:x" aria-hidden="true" />
          </button>
        </Tag>
      </div>
      <SearchAutocomplete
        v-if="canControl('query')"
        ref="searchInput"
        :id="searchId"
        v-model:value="draft"
        class="inbox-search"
        :aria-label="$t('msg.searchMessages')"
        :placeholder="$t('msg.searchMessages')"
        :options="options"
        :loading="suggesting"
        :disabled="busy"
        @search="suggest"
        @select="choose"
        @submit="search"
        @focus="cancelSearch"
        @blur="scheduleSearch"
        @remove-history="removeHistory"
      />
      <div class="inbox-toolbar">
        <div
          class="inbox-filters"
          :aria-label="$t('msg.feedFilters')"
          role="group"
        >
          <button
            v-for="item in filters"
            :key="item.value"
            type="button"
            :aria-pressed="filter === item.value"
            :disabled="busy"
            @click="changeFilter(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
        <Button
          v-if="canControl('refresh')"
          type="text"
          :disabled="busy || loading"
          :aria-label="$t('msg.refresh')"
          @click="refresh()"
          ><IconifyIcon icon="lucide:refresh-cw"
        /></Button>
        <Button
          type="text"
          :disabled="busy || loading"
          :aria-pressed="selecting"
          @click="
            selecting = !selecting;
            selected = [];
          "
          >{{ $t(selecting ? 'msg.cancel' : 'msg.select') }}</Button
        >
      </div>
      <div v-if="selecting" class="inbox-selection">
        <Checkbox
          :checked="allSelected"
          :indeterminate="selected.length > 0 && !allSelected"
          :disabled="busy || loading || !availableIds.length"
          :aria-label="$t('msg.feedSelectLoaded')"
          @change="selected = $event.target.checked ? [...availableIds] : []"
          >{{ $t('msg.feedSelectLoaded') }}</Checkbox
        >
        <template v-if="selected.length">
          <Button
            size="small"
            :disabled="busy || loading"
            v-if="canControl('mark-selected-read')"
            data-testid="message-bulk-read"
            @click="confirmAction(true, selected, true)"
            >{{ $t('msg.markRead') }}</Button
          >
          <Button
            size="small"
            danger
            :disabled="busy || loading"
            v-if="canControl('delete-selected')"
            data-testid="message-bulk-delete"
            @click="confirmAction(false, selected, true)"
            >{{ $t('msg.deleteSelected') }}</Button
          >
        </template>
      </div>
    </header>
    <div
      :ref="setViewport"
      class="inbox-scroll"
      data-testid="inbox-scroll"
      :aria-busy="loading || loadingMore"
      @scroll.passive="onScroll"
    >
      <Button
        v-if="newMessages"
        block
        class="inbox-update"
        :disabled="busy || loading"
        @click="refresh()"
        >{{ $t('msg.feedUpdates') }}</Button
      >
      <LoadWarning
        v-if="error"
        :failure="error"
        :retry-label="$t('msg.retry')"
        retry-size="small"
        @retry="refresh()"
      />
      <div v-if="loading && !rows.length" class="inbox-skeleton">
        <Skeleton
          v-for="n in 4"
          :key="n"
          active
          avatar
          :paragraph="{ rows: 2 }"
        />
      </div>
      <Empty
        v-else-if="!rows.length && !error"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="
          $t(
            messageId !== undefined
              ? 'msg.focusUnavailable'
              : query
                ? 'msg.feedNoMatch'
                : filter === 'unread'
                  ? 'msg.feedNoUnread'
                  : 'msg.empty',
          )
        "
        class="inbox-empty"
      />
      <template v-for="(row, index) in rows" :key="row.id">
        <div
          v-if="
            !index ||
            day(rows[index - 1]!.published_at) !== day(row.published_at)
          "
          class="inbox-day"
        >
          {{ day(row.published_at) }}
        </div>
        <p
          v-if="row.unavailable"
          class="inbox-message text-muted-foreground"
          role="status"
        >
          {{ $t('msg.messageUnavailable') }}
        </p>
        <article
          v-else
          class="inbox-message"
          :class="{ 'is-target': messageId === row.id }"
          :data-message-id="row.id"
          tabindex="-1"
          :aria-label="row.title"
          data-testid="inbox-message"
        >
          <Checkbox
            v-if="selecting"
            :checked="selected.includes(row.id)"
            :disabled="busy || loading"
            :aria-label="`${$t('msg.select')} ${row.title}`"
            @change="check(row.id, $event.target.checked)"
          />
          <MessageTypeIcon v-else :type="row.type" />
          <div class="inbox-copy">
            <div class="inbox-meta">
              <span>{{ $t(`msg.${row.type}`) }}</span
              ><time>{{ time(row.published_at) }}</time
              ><span class="inbox-status" :data-read="!!row.read_at"
                ><span
                  v-if="!row.read_at"
                  class="inbox-dot"
                  aria-hidden="true"
                ></span
                >{{ $t(row.read_at ? 'msg.read' : 'msg.unread') }}</span
              >
            </div>
            <h3>{{ row.title }}</h3>
            <p
              :id="`inbox-content-${row.id}`"
              class="inbox-content"
              :class="{ 'is-expanded': expanded.includes(row.id) }"
            >
              {{ expanded.includes(row.id) ? row.content : row.summary }}
            </p>
            <LoadWarning
              v-if="detailError === row.id"
              :failure="detailFailure"
              :retry-label="$t('msg.retry')"
              retry-size="small"
              @retry="toggle(row)"
            />
            <div class="inbox-actions">
              <Button
                v-if="canControl('view-detail')"
                type="link"
                :loading="detailLoading === row.id"
                :disabled="
                  busy ||
                  loading ||
                  (detailLoading !== undefined && detailLoading !== row.id)
                "
                :aria-expanded="expanded.includes(row.id)"
                :aria-controls="`inbox-content-${row.id}`"
                @click="toggle(row)"
                >{{
                  $t(
                    expanded.includes(row.id)
                      ? 'msg.feedCollapse'
                      : 'msg.feedExpand',
                  )
                }}</Button
              >
              <Button
                v-if="!row.read_at && canControl('mark-read')"
                type="link"
                :disabled="busy || loading"
                @click="mark(row)"
                >{{ $t('msg.markRead') }}</Button
              >
              <Button
                v-if="canControl('delete')"
                class="inbox-delete"
                type="text"
                :disabled="busy || loading"
                @click="confirmAction(false, [row.id])"
                >{{ $t('msg.delete') }}</Button
              >
            </div>
          </div>
        </article>
      </template>
      <div v-if="rows.length" class="inbox-end" aria-live="polite">
        <template v-if="loadingMore"
          ><Spin size="small" /> {{ $t('msg.feedLoadingMore') }}</template
        >
        <template v-else-if="moreError"
          ><Button type="link" @click="more">{{
            $t('msg.retry')
          }}</Button></template
        >
        <Button
          v-else-if="hasMore"
          type="text"
          :disabled="busy || loading"
          @click="more"
          >{{ $t('msg.feedLoadMore') }}</Button
        >
        <span v-else>{{ $t('msg.feedEnd') }}</span>
      </div>
    </div>
    <footer class="inbox-footer">
      <span>{{
        $t('msg.feedShown', { count: availableIds.length, total })
      }}</span
      ><span>{{ $t('msg.feedOrder') }}</span>
    </footer>
  </section>
</template>
<style scoped>
.inbox-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
}

.inbox-header {
  flex: none;
  padding: 24px 28px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.inbox-breadcrumb {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.inbox-close {
  margin: -8px -10px -8px auto;
}

.inbox-title {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.inbox-title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}

.inbox-title :deep(.ant-tag) {
  margin: 0;
}

.inbox-title > :last-child {
  padding-right: 0;
  margin-left: auto;
}

.inbox-active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.inbox-id-filter {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  max-width: 100%;
  margin: 0;
}

.inbox-id-filter > span {
  overflow-wrap: anywhere;
  white-space: normal;
}

.inbox-id-filter button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: calc(var(--radius) * 0.375);
}

.inbox-id-filter button svg {
  width: 12px;
  height: 12px;
}

.inbox-id-filter button:hover {
  background: hsl(var(--primary) / 10%);
}

.inbox-id-filter button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

.inbox-id-filter button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.inbox-active-filters ~ .inbox-search {
  margin-top: 12px;
}

.inbox-message.is-target {
  background: hsl(var(--primary) / 3.5%);
}

.inbox-message:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.inbox-search {
  display: block;
  width: 100%;
  margin-top: 20px;
}

.inbox-search :deep(.ant-select-selector) {
  align-items: center;
  min-height: 38px;
  border-radius: calc(var(--radius) * 0.875);
}

.inbox-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: 8px;
}

.inbox-filters {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}

.inbox-filters button {
  padding: 14px 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
}

.inbox-filters button[aria-pressed='true'] {
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.inbox-filters button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.inbox-filters button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.inbox-selection {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid hsl(var(--border));
}

.inbox-selection :deep(.ant-checkbox-wrapper) {
  margin-right: auto;
}

.inbox-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 28px;
  overflow: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  overflow-anchor: none;
}

.inbox-update {
  margin-top: 16px;
}

.inbox-day {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 20px 0 2px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.inbox-day::after {
  flex: 1;
  height: 1px;
  content: '';
  background: hsl(var(--border));
}

.inbox-message {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 20px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.inbox-message > :first-child {
  flex: none;
  margin-top: 3px;
}

.inbox-copy {
  flex: 1;
  min-width: 0;
}

.inbox-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.inbox-meta time {
  font-variant-numeric: tabular-nums;
}

.inbox-status {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  margin-left: auto;
  white-space: nowrap;
}

.inbox-status[data-read='false'] {
  color: hsl(var(--primary));
}

.inbox-dot {
  width: 5px;
  height: 5px;
  background: currentcolor;
  border-radius: 50%;
}

.inbox-message h3 {
  margin: 7px 0;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.inbox-content {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 13px;
  line-height: 1.8;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
}

.inbox-content.is-expanded {
  display: block;
  color: hsl(var(--foreground));
}

.inbox-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 8px;
}

.inbox-actions :deep(.ant-btn) {
  height: auto;
  padding: 3px 0;
  font-size: 12px;
}

.inbox-actions .inbox-delete {
  margin-left: auto;
  color: hsl(var(--muted-foreground));
}

.inbox-end {
  padding: 22px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.inbox-footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 14px 28px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  border-top: 1px solid hsl(var(--border));
}

.inbox-skeleton {
  display: grid;
  gap: 28px;
  padding: 28px 0;
}

.inbox-empty {
  margin: 64px 0;
}

@media (max-width: 600px) {
  .inbox-header {
    padding: 20px 18px 0;
  }

  .inbox-scroll {
    padding-inline: 18px;
  }

  .inbox-footer {
    padding-inline: 18px;
  }

  .inbox-filters {
    gap: 14px;
  }
}
</style>
