<script setup lang="ts">
import type { AuditExactField, AuditState } from './use-audit';

import type { AuditKind, AuditPreview } from '#/api/audit';

import { computed, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import {
  Avatar,
  Button,
  Card,
  Empty,
  FormItem,
  Segmented,
  Select,
  Tag,
  theme,
} from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import SearchAutocomplete from '#/components/search-autocomplete.vue';
import Table from '#/components/skeleton-table.vue';
import TableColumnSelector from '#/components/table-column-selector.vue';
import { $t } from '#/locales';

import ManagementCard from '../system/components/management-card.vue';
import ManagementSearch from '../system/components/management-search.vue';
import ManagementToolbar from '../system/components/management-toolbar.vue';
import AuditDetail from './audit-detail.vue';
import AuditFilterCue from './audit-filter-cue.vue';
import {
  auditOutcome,
  clientLabel,
  operationLabel,
  outcomeColor,
} from './audit-utils';

const props = defineProps<{
  state: AuditState;
  kind: AuditKind;
  isFullscreen: boolean;
}>();
const emit = defineEmits<{
  fullscreen: [];
  expand: [];
  related: [field: AuditExactField, value: string, toggle?: boolean];
}>();
const state = props.state;
const isLogin = computed(() => props.kind === 'login');
const { token } = theme.useToken();
const {
  q,
  result,
  module,
  sort,
  exact,
  overview,
  rows,
  page,
  size,
  total,
  loading,
  overviewLoading,
  error,
  overviewError,
  selected,
  selectedID,
  detailLoading,
  detailError,
  options,
  history,
  hasScope,
  scopeLabel,
} = state;
const density = ref<'large' | 'middle' | 'small'>('middle');
const bordered = ref(false);
const striped = ref(false);
const sticky = ref(false);
const visible = ref(
  isLogin.value
    ? ['username', 'status', 'ip', 'client']
    : ['username', 'status', 'duration_ms'],
);
watch(visible, (keys) => {
  state.listFields.value = [
    ...new Set([
      'id',
      'occurred_at',
      ...(isLogin.value
        ? ['operation']
        : ['module', 'method', 'path', 'operation']),
      ...keys.map((key) => (key === 'client' ? 'user_agent' : key)),
      ...(isLogin.value && keys.includes('status') ? ['outcome'] : []),
    ]),
  ].join(',');
});
const fieldKeys = computed(() =>
  isLogin.value
    ? ['username', 'status', 'ip', 'client']
    : ['username', 'status', 'duration_ms', 'ip'],
);
const resultOptions = computed(() =>
  ['', 'success', 'failure'].map((value) => ({
    value,
    label: $t(`audit.${value || 'all'}`),
  })),
);
const moduleOptions = computed(() =>
  [
    '',
    'auth',
    'user',
    'role',
    'action',
    'user-group',
    'dictionary',

    'msg',
  ].map((value) => ({
    value,
    label: value ? $t(`audit.modules.${value}`) : $t('audit.allModules'),
  })),
);
const suggestionFields = ['username', 'ip', 'path', 'trace_id'] as const;
const autoOptions = computed(() => {
  const query = q.value.trim().toLowerCase();
  const matches = new Map<string, { value: string; field: string }>();
  for (const record of query ? options.value : []) {
    for (const field of suggestionFields) {
      const value = record[field];
      if (value && value.toLowerCase().includes(query) && !matches.has(value)) {
        matches.set(value, { value, field });
      }
    }
  }
  const remote = [...matches.values()].slice(0, 10);
  const recent = history.value
    .filter((value) => !matches.has(value))
    .map((value) => ({ value, source: 'history' }));
  return [
    ...(remote.length > 0
      ? [{ label: $t('system.suggestions.backend'), options: remote }]
      : []),
    ...(recent.length > 0
      ? [{ label: $t('system.suggestions.history'), options: recent }]
      : []),
  ];
});
const columnWidths: Record<string, number> = {
  username: 140,
  client: 165,
  ip: 135,
};
const columns = computed(() => [
  ...(isLogin.value
    ? [{ title: $t('audit.occurred_at'), key: 'occurred_at', width: 180 }]
    : [{ title: $t('audit.business'), key: 'business', width: 205 }]),
  ...fieldKeys.value
    .filter((key) => visible.value.includes(key))
    .map((key) => ({
      title: $t(`audit.${key}`),
      key,
      width: columnWidths[key] ?? 95,
    })),
  ...(isLogin.value
    ? []
    : [{ title: $t('audit.occurred_at'), key: 'occurred_at', width: 178 }]),
]);
const tableWidth = computed(() =>
  columns.value.reduce((sum, c) => sum + c.width, 0),
);
const sortOptions = computed(() => [
  { value: 'newest', label: $t('audit.timeFirst') },
  { value: 'failure', label: $t('audit.failureFirst') },
  ...(isLogin.value
    ? []
    : [{ value: 'duration', label: $t('audit.byDuration') }]),
]);
function highlighted(value: string) {
  const query = q.value.trim().toLowerCase();
  if (!query) return [{ text: value, matched: false }];
  const segments: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  let index = value.toLowerCase().indexOf(query);
  while (index >= 0) {
    if (index > cursor)
      segments.push({ text: value.slice(cursor, index), matched: false });
    cursor = index + query.length;
    segments.push({ text: value.slice(index, cursor), matched: true });
    index = value.toLowerCase().indexOf(query, cursor);
  }
  if (cursor < value.length)
    segments.push({ text: value.slice(cursor), matched: false });
  return segments;
}
function setSort(value: string) {
  sort.value = value;
  void state.loadRecords(true);
}
function openDetail(record: AuditPreview) {
  void state.detail(record.id);
}
function changePage(value: { current?: number; pageSize?: number }) {
  const nextPageSize = value.pageSize ?? size.value;
  page.value = nextPageSize === size.value ? (value.current ?? 1) : 1;
  size.value = nextPageSize;
  void state.loadRecords();
}
</script>

<template>
  <ManagementCard class="audit-search-card" data-testid="audit-search-region">
    <div
      v-if="hasScope || Object.keys(exact).length"
      class="audit-filter-tags"
      data-testid="audit-active-filters"
    >
      <Tag
        v-if="hasScope"
        color="blue"
        closable
        @close.prevent="state.clearScope()"
      >
        {{ scopeLabel }}
      </Tag>
      <AuditFilterCue
        v-for="(value, field) in exact"
        :key="field"
        :kind="kind"
        :value="field === 'username' ? value || '' : ''"
        :ready="
          !loading && !overviewLoading && Boolean(overview || overviewError)
        "
      >
        <Tag color="blue" closable @close.prevent="state.removeExact(field)">
          {{ $t(`audit.${field}`) }}: {{ value }}
        </Tag>
      </AuditFilterCue>
    </div>
    <ManagementSearch
      class="audit-filters"
      data-testid="audit-search-form"
      @submit.prevent="state.applyFilters()"
    >
      <FormItem :label="$t('audit.search')" :html-for="`audit-${kind}-search`">
        <SearchAutocomplete
          v-model:value="q"
          :id="`audit-${kind}-search`"
          :options="autoOptions"
          :loading="state.optionsLoading.value"
          :placeholder="$t('audit.searchHint')"
          class="audit-search"
          :dropdown-match-select-width="false"
          :dropdown-style="{
            width: 'min(560px, calc(100vw - 32px))',
            maxWidth: 'calc(100vw - 32px)',
          }"
          :virtual="false"
          @search="state.suggest"
          @blur="state.searchSoon"
          @select="state.searchSoon"
          @submit="state.applyFilters()"
          @remove-history="state.removeHistory"
        >
          <template #result="{ option }">
            <div class="audit-suggestion" data-testid="audit-search-suggestion">
              <span class="audit-suggestion-field">{{
                $t(`audit.${option.field}`)
              }}</span>
              <span class="audit-suggestion-value"
                ><template
                  v-for="(part, index) in highlighted(String(option.value))"
                  :key="index"
                  ><mark
                    v-if="part.matched"
                    :style="{ color: token.colorError }"
                    >{{ part.text }}</mark
                  ><template v-else>{{ part.text }}</template></template
                ></span
              >
            </div>
          </template>
        </SearchAutocomplete>
      </FormItem>
      <FormItem
        v-if="!isLogin"
        :label="$t('audit.module')"
        :html-for="`audit-${kind}-module`"
      >
        <Select
          v-model:value="module"
          :id="`audit-${kind}-module`"
          :options="moduleOptions"
          class="audit-select"
          @change="state.applyFilters()"
        />
      </FormItem>
      <FormItem :label="$t('audit.status')" :html-for="`audit-${kind}-result`">
        <Select
          v-model:value="result"
          :id="`audit-${kind}-result`"
          :options="resultOptions"
          class="audit-select"
          @change="state.applyFilters()"
        />
      </FormItem>
      <template #actions>
        <Button v-if="state.canControl('reset-query')" @click="state.reset()">
          {{ $t('audit.reset') }}
        </Button>
        <Button
          :loading="loading"
          :aria-busy="loading"
          type="primary"
          v-if="state.canControl('query')"
          @click="state.applyFilters()"
        >
          {{ $t('audit.search') }}
        </Button>
      </template>
    </ManagementSearch>
  </ManagementCard>
  <div class="audit-record-workspace with-detail">
    <Card
      class="audit-records"
      data-testid="audit-records"
      :class="{ 'audit-table-striped': striped }"
    >
      <div class="audit-record-heading">
        <h2>
          {{ $t(isLogin ? 'audit.loginRecords' : 'audit.operationRecords') }}
        </h2>
      </div>
      <div class="audit-record-order">
        <Segmented
          class="audit-order"
          :value="sort"
          :options="sortOptions"
          :aria-label="$t('audit.recordOrder')"
          :disabled="loading"
          @change="(value) => setSort(String(value))"
        />
        <ManagementToolbar
          v-model:size="density"
          v-model:bordered="bordered"
          v-model:striped="striped"
          v-model:sticky="sticky"
          :loading="loading || overviewLoading"
          :is-fullscreen="isFullscreen"
          :can-read="state.canControl('refresh')"
          @refresh="state.refresh()"
          @fullscreen="emit('fullscreen')"
        >
          <template #columns>
            <TableColumnSelector
              v-model="visible"
              :options="
                fieldKeys.map((value) => ({
                  value,
                  label: $t(`audit.${value}`),
                }))
              "
            />
          </template>
        </ManagementToolbar>
      </div>

      <LoadWarning
        v-if="error"
        :failure="error"
        :retry-label="$t('audit.retry')"
        retry-size="small"
        @retry="state.loadRecords()"
      />
      <Table
        data-testid="audit-record-table"
        :data-source="rows"
        :columns="columns"
        row-key="id"
        :size="density"
        :bordered="bordered"
        :sticky="sticky"
        :loading="loading"
        :scroll="{
          x: tableWidth,
          y: 'var(--audit-table-body-height)',
        }"
        :custom-row="
          (record: AuditPreview) => ({
            'aria-selected': record.id === selectedID,
            'aria-label': $t('audit.openEvent', { id: record.id }),
            tabindex: loading ? -1 : 0,
            onClick: () => !loading && openDetail(record),
            onKeydown: (event: KeyboardEvent) => {
              if (event.target !== event.currentTarget || loading) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDetail(record);
              }
            },
          })
        "
        :row-class-name="
          (record: AuditPreview) =>
            record.id === selectedID ? 'audit-selected-row' : ''
        "
        :pagination="{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => $t('system.table.total', { count }),
          pageSizeOptions: ['10', '20', '50', '100', '200'],
        }"
        @change="changePage"
      >
        <template #emptyText>
          <Empty
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="$t('audit.empty')"
          />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'occurred_at'">
            <time>{{ formatDateTime(record.occurred_at) }}</time>
            <div
              v-if="isLogin && record.operation === 'logout'"
              class="text-muted-foreground"
            >
              {{ $t('audit.operationTypes.logout') }}
            </div>
          </template>
          <template v-else-if="column.key === 'business'">
            <span class="audit-operation-label">{{
              operationLabel(record as AuditPreview)
            }}</span>
            <div class="audit-request-subtitle">
              {{ record.method }} {{ record.path }}
            </div>
          </template>
          <template v-else-if="column.key === 'username'">
            <div class="audit-account">
              <Avatar :size="25">
                {{
                  (record.username || '?').slice(0, 1).toUpperCase()
                }} </Avatar
              ><span>{{ record.username || $t('audit.anonymous') }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="outcomeColor[auditOutcome(record as AuditPreview)]">
              {{ $t(`audit.${auditOutcome(record as AuditPreview)}`) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'duration_ms'">
            {{ record.duration_ms }} ms
          </template>
          <template v-else-if="column.key === 'client'">
            {{ clientLabel(record.user_agent) }}
          </template>
          <template v-else-if="column.key === 'ip'">
            {{ record.ip || '—' }}
          </template>
        </template>
      </Table>
    </Card>
    <aside
      class="audit-detail-pane"
      data-testid="audit-detail-scroll"
      :aria-label="$t('audit.eventDetail')"
      tabindex="0"
    >
      <AuditDetail
        :event="selected"
        :loading="detailLoading"
        :error="detailError"
        @close="state.closeDetail"
        @expand="emit('expand')"
        @retry="selectedID && state.detail(selectedID)"
        @related="(field, value) => emit('related', field, value)"
      />
    </aside>
  </div>
</template>

<style scoped>
.audit-records,
.audit-detail-pane {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  box-shadow: none;
}

.audit-record-workspace {
  --audit-table-body-height: 300px;

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.audit-record-workspace.with-detail {
  --audit-table-body-height: 660px;

  grid-template-columns: minmax(0, 1fr) 300px;
}

.audit-fullscreen .audit-record-workspace {
  --audit-table-body-height: max(300px, calc(100vh - 320px));
}

.audit-record-workspace.with-detail .audit-records :deep(.ant-table-body) {
  min-height: var(--audit-table-body-height);

  /* Ant Table sets inline overflow-y: scroll; only show it when rows overflow. */
  overflow-y: auto !important;
}

.audit-detail-pane {
  min-width: 0;
  min-height: 0;

  /* Let the records set the grid height; long details scroll within it. */
  contain: size;
  overflow: auto;
  overscroll-behavior-y: contain;
}

.audit-detail-pane:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.audit-detail-pane :deep(.audit-detail) {
  /* Keep the final actions above the shell's floating back-to-top button. */
  padding-bottom: 64px;
}

.audit-records {
  min-width: 0;
}

.audit-records :deep(.ant-card-body) {
  padding: 18px;
}

.audit-record-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}

.audit-record-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.audit-record-order {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.audit-filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.audit-filter-tags :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.audit-order :deep(.ant-segmented-item-selected) {
  color: hsl(var(--primary));
}

.audit-search {
  width: clamp(210px, 30vw, 360px);
}

.audit-suggestion {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 4px 0;
  white-space: normal;
}

.audit-suggestion-field {
  padding-right: 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  border-right: 1px solid hsl(var(--border));
}

.audit-suggestion-value {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.audit-suggestion-value mark {
  padding: 0;
  font-weight: 600;
  color: var(--audit-error-color);
  background: transparent;
}

.audit-select {
  width: 120px;
}

.audit-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 12px 0 10px;
}

.audit-records :deep(.ant-table-cell) {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.audit-records :deep(.ant-table-thead > tr > th) {
  padding-top: 10px;
  padding-bottom: 10px;
  font-size: 12px;
  font-weight: 500;
  background: hsl(var(--muted));
}

.audit-records :deep(.ant-table-cell::before) {
  display: none !important;
}

.audit-records :deep(.ant-table-tbody > tr > td) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.audit-account {
  display: flex;
  gap: 9px;
  align-items: center;
}

.audit-account :deep(.ant-avatar) {
  flex-shrink: 0;
  font-size: 12px;
  color: hsl(var(--primary));
  background: color-mix(in srgb, hsl(var(--primary)) 15%, hsl(var(--card)));
}

.audit-operation-label {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  text-align: left;
  white-space: normal;
}

.audit-request-subtitle {
  margin-top: 2px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.audit-records :deep(.ant-table-row) {
  cursor: pointer;
}

.audit-records :deep(.ant-table-row:focus-visible) {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.audit-records :deep(.audit-selected-row > td) {
  background: color-mix(
    in srgb,
    hsl(var(--primary)) 9%,
    hsl(var(--card))
  ) !important;
}

.audit-records :deep(.audit-selected-row > td:first-child) {
  box-shadow: inset 3px 0 hsl(var(--primary));
}

.audit-table-striped
  :deep(.ant-table-tbody > tr:nth-child(even):not(.audit-selected-row) > td) {
  background: hsl(var(--muted));
}

@media (max-width: 1250px) {
  .audit-record-workspace.with-detail {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
}

@media (max-width: 1000px) {
  .audit-record-workspace.with-detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .audit-detail-pane {
    max-height: calc(var(--audit-table-body-height) + 200px);
    contain: none;
  }
}

@media (max-width: 600px) {
  .audit-search {
    width: 100%;
  }
}
</style>
