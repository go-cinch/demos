<script setup lang="ts">
import type { Msg } from '#/api/msg';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Checkbox, Empty, Pagination, Tag } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import MessageRecipients from './message-recipients.vue';

const props = defineProps<{
  bordered: boolean;
  busy: boolean;
  canDelete: boolean;
  checkedKeys: number[];
  density: 'large' | 'middle' | 'small';
  detailError: boolean;
  detailLoading: boolean;
  loading: boolean;
  page: number;
  rows: Msg[];
  selected?: Msg;
  selectedId?: number;
  size: number;
  sticky: boolean;
  striped: boolean;
  total: number;
  visible: string[];
}>();
const emit = defineEmits<{
  check: [id: number, checked: boolean];
  checkAll: [checked: boolean];
  page: [page: number, size: number];
  remove: [row: Msg];
  retry: [];
  select: [row: Msg];
  view: [row: Msg];
}>();
const displayRows = computed<Msg[]>(() => props.loading && !props.rows.length
  ? Array.from({ length: props.size }, (_, index) => ({ id: -index - 1, title: '────────', content: '────────', type: 'notice', scope: 'all', sender_id: null, published_at: 0, expired_at: null, read_at: null }))
  : props.rows);
const selected = computed(() => props.selected ?? (props.loading ? displayRows.value[0] : undefined));
const timezone = useTimezoneStore();
const allChecked = computed(
  () => props.rows.length > 0 && props.rows.every((row) => props.checkedKeys.includes(row.id)),
);
const partialChecked = computed(
  () => !allChecked.value && props.rows.some((row) => props.checkedKeys.includes(row.id)),
);
function displayTime(value: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
</script>

<template>
  <div
    class="sent-workspace"
    :class="[
      `sent-density-${density}`,
      { 'sent-bordered': bordered, 'sent-striped': striped, 'sent-sticky': sticky },
    ]"
  >
    <div v-skeleton="loading">
      <div v-if="!loading && !rows.length" class="sent-empty">
        <Empty :description="$t('msg.empty')" />
      </div>
      <div v-else class="sent-reading-layout">
        <section
          data-testid="message-sent-list"
          class="sent-list"
          :aria-label="$t('msg.publishedRecords')"
        >
          <div class="sent-list-heading">
            <Checkbox
              :checked="allChecked"
              :indeterminate="partialChecked"
              :disabled="loading || busy || !rows.length"
              :aria-label="$t('msg.selectAll')"
              @change="emit('checkAll', Boolean($event.target.checked))"
            >
              {{ $t('msg.publishedRecords') }}
            </Checkbox>
            <span>{{ $t('system.table.total', { count: total }) }}</span>
          </div>
          <article
            v-for="row in displayRows"
            :key="row.id"
            class="sent-list-item"
            :class="{ 'is-selected': row.id === selectedId }"
            :data-testid="`message-sent-item-${row.id}`"
          >
            <Checkbox
              class="sent-item-checkbox"
              :checked="checkedKeys.includes(row.id)"
              :disabled="loading || busy"
              :aria-label="`${$t('msg.select')} ${row.title}`"
              @change="emit('check', row.id, Boolean($event.target.checked))"
            />
            <button
              type="button"
              class="sent-item-button"
              :aria-pressed="row.id === selectedId"
              :disabled="loading || busy"
              @click="emit('select', row)"
            >
              <span
                v-if="visible.includes('type') || visible.includes('scope')"
                class="sent-item-tags"
              >
                <Tag v-if="visible.includes('type')" color="blue">{{ $t(`msg.${row.type}`) }}</Tag>
                <Tag v-if="visible.includes('scope')" color="purple">{{
                  $t(`msg.${row.scope}`)
                }}</Tag>
                <Tag v-if="row.expired_at && row.expired_at <= Date.now()">{{
                  $t('msg.expired')
                }}</Tag>
              </span>
              <strong>{{ row.title }}</strong>
              <span class="sent-item-excerpt">{{ row.summary }}</span>
              <time v-if="visible.includes('published_at')">{{
                displayTime(row.published_at)
              }}</time>
            </button>
          </article>
        </section>
        <section
          data-testid="message-sent-preview"
          class="sent-preview"
          :aria-label="$t('msg.preview')"
          :aria-busy="detailLoading"
        >
          <div class="sent-preview-kicker">
            <IconifyIcon icon="lucide:mail-open" />{{ $t('msg.preview')
            }}<span v-if="selected">#{{ selected.id }}</span>
            <Button v-if="selected && !detailLoading && !detailError" type="text" size="small" class="ml-auto" :aria-label="$t('msg.detail')" @click="emit('view', selected)"><IconifyIcon icon="lucide:panel-right-open" /></Button>
          </div>
          <LoadWarning v-if="detailError">
            <template #action>
<Button @click="emit('retry')">{{ $t('msg.retry') }}</Button>
</template>
          </LoadWarning>
          <div v-else-if="selected" v-skeleton="detailLoading">
            <Tag color="blue">{{ $t(`msg.${selected.type}`) }}</Tag>
            <Tag v-if="selected.expired_at && selected.expired_at <= Date.now()">
{{
              $t('msg.expired')
            }}
</Tag>
            <h2>{{ selected.title }}</h2>
            <div class="sent-preview-meta">
              <span>{{ $t('msg.published') }}: {{ displayTime(selected.published_at) }}</span><span>{{ $t('msg.sender') }}: {{ selected.sender_id ?? '—' }}</span>
            </div>
            <div class="sent-preview-content">{{ selected.content }}</div>
            <div class="sent-audience-box">
              <div>
                {{ $t('msg.scope') }}: <Tag color="purple">{{ $t(`msg.${selected.scope}`) }}</Tag>
              </div>
              <p v-if="selected.scope === 'all'">{{ $t('msg.broadcastHint') }}</p>
              <template v-else>
                <p>
                  {{ $t('msg.recipients') }} ·
                  {{ $t('msg.recipientCount', { count: selected.recipient_ids?.length ?? 0 }) }}
                </p>
                <MessageRecipients :recipients="selected.recipients" />
              </template>
            </div>
            <div class="sent-preview-footer">
              <span>{{ $t('msg.expiry') }}:
                {{
                  selected.expired_at ? displayTime(selected.expired_at) : $t('msg.noExpiry')
                }}</span>
              <Button
                v-if="canDelete"
                danger
                type="link"
                :disabled="busy || loading"
                @click="emit('remove', selected)"
                >
{{ $t('msg.deleteGlobal') }}
</Button>
            </div>
          </div>
          <Empty v-else :description="$t('msg.selectPreview')" />
        </section>
      </div>
    </div>
    <div class="sent-pagination">
      <Pagination
        :current="page"
        :page-size="size"
        :total="total"
        :disabled="loading || busy"
        show-size-changer
        :show-total="(count: number) => $t('system.table.total', { count })"
        @change="(nextPage, nextSize) => emit('page', nextPage, nextSize)"
      />
    </div>
  </div>
</template>

<style scoped>
.sent-workspace {
  min-width: 0;
}
.sent-reading-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.83fr) minmax(0, 1.25fr);
  min-height: 570px;
  overflow: hidden;
  border-radius: var(--radius);
}
.sent-bordered .sent-reading-layout {
  border: 1px solid hsl(var(--border));
}
.sent-list {
  min-width: 0;
  max-height: 750px;
  overflow: auto;
  border-right: 1px solid hsl(var(--border));
}
.sent-list-heading {
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card));
}
.sent-sticky .sent-list-heading {
  position: sticky;
  top: 0;
}
.sent-list-heading > span {
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  white-space: nowrap;
}
.sent-list-skeleton {
  display: grid;
  gap: 30px;
  padding: 20px;
}
.sent-list-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid hsl(var(--border));
  transition: background-color 0.15s;
}
.sent-striped .sent-list-item:nth-of-type(even) {
  background: hsl(var(--muted) / 35%);
}
.sent-list-item:hover {
  background: hsl(var(--accent));
}
.sent-list-item.is-selected {
  background: hsl(var(--primary) / 8%);
}
.sent-list-item.is-selected::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: hsl(var(--primary));
  content: '';
}
.sent-item-checkbox {
  padding-top: 2px;
}
.sent-item-button {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 0;
  color: inherit;
  text-align: start;
  border: 0;
  background: none;
  cursor: pointer;
}
.sent-item-button:disabled {
  cursor: default;
}
.sent-item-button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 4px;
  border-radius: calc(var(--radius) * 0.375);
}
.sent-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.sent-item-button strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.sent-item-excerpt {
  display: -webkit-box;
  width: 100%;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.6;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.sent-item-button time {
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}
.sent-preview {
  min-width: 0;
  padding: 28px 30px;
}
.sent-preview-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 24px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.sent-preview-kicker > span {
  margin-left: auto;
}
.sent-preview h2 {
  margin: 16px 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.sent-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.8;
}
.sent-preview-content {
  max-height: 430px;
  margin-top: 24px;
  overflow: auto;
  font-size: 14px;
  line-height: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sent-audience-box {
  padding: 14px 16px;
  margin-top: 24px;
  font-size: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--muted) / 45%);
}
.sent-audience-box p {
  margin: 8px 0 0;
  color: hsl(var(--muted-foreground));
  line-height: 1.8;
}
.sent-recipient-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 140px;
  margin-top: 10px;
  overflow: auto;
}
.sent-recipient-tags :deep(.ant-tag) {
  margin: 0;
}
.sent-preview-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 20px;
  margin-top: 24px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  border-top: 1px solid hsl(var(--border));
}
.sent-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
.sent-empty {
  padding: 60px 0;
}
.sent-density-small .sent-list-item {
  padding-block: 11px;
}
.sent-density-large .sent-list-item {
  padding-block: 24px;
}
@media (max-width: 1100px) {
  .sent-reading-layout {
    grid-template-columns: minmax(250px, 0.8fr) minmax(0, 1fr);
  }
  .sent-preview {
    padding: 22px;
  }
}
@media (max-width: 760px) {
  .sent-reading-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .sent-list {
    max-height: 350px;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }
  .sent-pagination {
    overflow: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sent-list-item {
    transition: none;
  }
}
</style>

<style scoped>
.sent-reading-layout, .sent-empty { height: 620px; min-height: 0; }
.sent-list, .sent-preview { height: 100%; overflow: auto; scrollbar-gutter: stable; }
.sent-pagination { min-height: 32px; }
</style>
