<script setup lang="ts">
import type { AuditPreview, AuditHeatCell, AuditKind } from '#/api/audit';

import { computed, nextTick, ref, watch } from 'vue';

import { Page, ScrollArea } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { formatDate, formatDateTime } from '@vben/utils';

import { useFullscreen } from '@vueuse/core';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  FormItem,
  message,
  Progress,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  theme,
  Tooltip,
} from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import Table from '#/components/skeleton-table.vue';
import { useStatisticsWarning } from '#/composables/use-statistics-warning';
import { vSkeleton } from '#/directives/skeleton';
import SearchAutocomplete from '#/components/search-autocomplete.vue';
import { $t } from '#/locales';

import ManagementCard from '../system/components/management-card.vue';
import ManagementSearch from '../system/components/management-search.vue';
import ManagementToolbar from '../system/components/management-toolbar.vue';
import AuditChart from './audit-chart.vue';
import { activityOption } from './audit-charts';
import AuditDetail from './audit-detail.vue';
import AuditHeatmap from './audit-heatmap.vue';
import AuditFilterCue from './audit-filter-cue.vue';
import { clientLabel, operationLabel, successful } from './audit-utils';
import { useAudit } from './use-audit';
const props = defineProps<{ kind: AuditKind }>();
const isLogin = computed(() => props.kind === 'login');
const state = useAudit(props.kind);
const {
  canRead,
  canExport,
  days,
  q,
  result,
  module,
  sort,
  exact,
  cell,
  heatmapDay,
  dayHeatmap,
  interval,
  overview,
  context,
  rows,
  page,
  size,
  total,
  loading,
  overviewLoading,
  scopeLoading,
  error,
  overviewError,
  scopeError,
  selected,
  selectedID,
  detailLoading,
  detailError,
  options,
  history,
  hasScope,
  scopeLabel,
} = state;
const overviewWarningVisible = useStatisticsWarning(overviewError);
const scopeWarningVisible = useStatisticsWarning(() => scopeError.value || overviewError.value);
const scopeRange = computed(() => cell.value
  ? { from: cell.value.started_at, to: cell.value.ended_at }
  : interval.value);
const { token } = theme.useToken();
const root = ref<HTMLElement>();
const { isFullscreen, toggle } = useFullscreen(root);
const chartView = ref('module');
const chartViewport = ref({ start: 0, end: 100 });
watch([days, () => state.timezone.timezone], () => { chartViewport.value = { start: 0, end: 100 }; });
watch(interval, (value) => {
  if (!value) chartViewport.value = { start: 0, end: 100 };
});
  const loginView = ref('heatmap');
const activityReady = ref(false);
watch([overviewLoading, overview, days], async ([pending, data], _previous, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  activityReady.value = false;
  if (pending || !data) return;
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (!cancelled) activityReady.value = true;
}, { immediate: true });
const heatmapMode = ref<'day' | 'hour'>('day');
const showHeatmapLevels = computed(() => days.value === 30 && loginView.value === 'heatmap' && !!heatmapDay.value);

const zooming = ref(false);
const heatmapTooltipSuppressed = ref(false);
const zoomSequence = ref(0);
const zoomOrigin = ref({ x: 50, y: 50 });
const hoveredHeatCell = ref<{ cell: AuditHeatCell; origin: { x: number; y: number } }>();
function setHoveredHeatCell(value?: AuditHeatCell, origin?: { x: number; y: number }) {
  hoveredHeatCell.value = value && origin ? { cell: value, origin } : undefined;
}
let wheelDelta = 0;
let lastWheelAt = 0;
let wheelLockedUntil = 0;
const heatmapLevels = computed(() => [
  { value: 'day', label: $t('audit.dayView') },
  { value: 'hour', label: $t('audit.hourView'), disabled: !dayHeatmap.value || scopeLoading.value || scopeError.value },
]);
function clearHeatmapDrill() {
  heatmapMode.value = 'day';
  hoveredHeatCell.value = undefined;
  heatmapDay.value = undefined;
  dayHeatmap.value = undefined;
  zooming.value = false;
  heatmapTooltipSuppressed.value = false;
  zoomSequence.value++;
  wheelDelta = 0;
  wheelLockedUntil = 0;
}
function selectHeatCell(value: AuditHeatCell, origin: { x: number; y: number }) {
  if (days.value === 30 && heatmapMode.value === 'day') {
    const clearing = cell.value?.started_at === value.started_at && cell.value.ended_at === value.ended_at;
    heatmapDay.value = clearing ? undefined : value;
    dayHeatmap.value = undefined;
    zoomOrigin.value = origin;
  }
  if (heatmapMode.value === 'hour' && heatmapDay.value &&
    cell.value?.started_at === value.started_at && cell.value.ended_at === value.ended_at) {
    state.selectCell(heatmapDay.value, false);
  } else state.selectCell(value);
}
async function changeHeatmapLevel(value: unknown) {
  const next = value === 'hour' ? 'hour' : 'day';
  if (days.value !== 30 || !heatmapDay.value || next === heatmapMode.value ||
    (next === 'hour' && !dayHeatmap.value)) return;
  const sequence = ++zoomSequence.value;
  wheelLockedUntil = performance.now() + 600;
  heatmapTooltipSuppressed.value = true;
  await nextTick();
  if (sequence !== zoomSequence.value || days.value !== 30 || !heatmapDay.value) return;
  heatmapMode.value = next;
  hoveredHeatCell.value = undefined;
  zooming.value = true;
  heatmapTooltipSuppressed.value = false;
  if (next === 'day') state.selectCell(heatmapDay.value, false);
}
async function onHeatmapWheel(event: WheelEvent) {
  if (days.value !== 30 || loginView.value !== 'heatmap' ||
    !activityReady.value || event.ctrlKey || event.metaKey || event.shiftKey ||
    Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  const target = heatmapMode.value === 'day' ? hoveredHeatCell.value : undefined;
  if (!target && !heatmapDay.value) return;
  const now = performance.now();
  if (now < wheelLockedUntil) { event.preventDefault(); return; }
  const next = event.deltaY < 0 ? 'hour' : 'day';
  const changingDate = !!target && (target.cell.started_at !== heatmapDay.value?.started_at ||
    target.cell.ended_at !== heatmapDay.value?.ended_at);
  if (next === heatmapMode.value || (next === 'hour' && !changingDate &&
    (!dayHeatmap.value || scopeLoading.value || scopeError.value))) return;
  event.preventDefault();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 312 : 1);
  if (now - lastWheelAt > 180 || Math.sign(delta) !== Math.sign(wheelDelta)) wheelDelta = 0;
  lastWheelAt = now;
  wheelDelta += delta;
  if (Math.abs(wheelDelta) < 30) return;
  wheelDelta = 0;
  wheelLockedUntil = now + 600;
  if (next === 'hour' && changingDate && target) {
    heatmapDay.value = target.cell;
    dayHeatmap.value = undefined;
    zoomOrigin.value = target.origin;
    await state.selectCell(target.cell, false);
    await nextTick();
    if (days.value !== 30 || loginView.value !== 'heatmap' ||
      heatmapDay.value?.started_at !== target.cell.started_at) return;
  }
  await changeHeatmapLevel(next);
}
watch([days, () => state.timezone.timezone], clearHeatmapDrill);
watch(cell, (value) => { if (!value) clearHeatmapDrill(); });
watch(loginView, () => { zooming.value = false; });
const expanded = ref(false);
  const exporting = ref(false);
const density = ref<'large' | 'middle' | 'small'>('middle');
const bordered = ref(false);
  const striped = ref(false);
  const sticky = ref(false);
const visible = ref(
  isLogin.value
    ? ['username', 'status', 'ip', 'client']
    : ['username', 'status', 'duration_ms']
);
watch(visible, (keys) => {
  state.listFields.value = [...new Set([
    'id', 'occurred_at',
    ...(!isLogin.value ? ['module', 'method', 'path'] : []),
    ...keys.map((key) => key === 'client' ? 'user_agent' : key),
  ])].join(',');
});
const fieldKeys = computed(() =>
  isLogin.value
    ? ['username', 'status', 'ip', 'client']
    : ['username', 'status', 'duration_ms', 'ip']
);
const periodOptions = computed(() =>
  [1, 7, 30].map((value) => ({ value, label: $t(`audit.period${value}`) }))
);
const resultOptions = computed(() =>
  ['', 'success', 'failure'].map((value) => ({
    value,
    label: $t(`audit.${value || 'all'}`),
  }))
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
  }))
);
const loginViews = computed(() => [
  { value: 'heatmap', label: $t('audit.heatView') },
  { value: 'trend', label: $t('audit.trendView') },
]);
const operationViews = computed(() => [
  { value: 'time', label: $t('audit.timeDistribution') },
  { value: 'module', label: $t('audit.moduleDistribution') },
]);
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
    ...(remote.length ? [{ label: $t('system.suggestions.backend'), options: remote }] : []),
    ...(recent.length ? [{ label: $t('system.suggestions.history'), options: recent }] : []),
  ];
});
const chartOption = computed(() =>
  activityOption(
    !isLogin.value && chartView.value === 'module'
      ? context.value
      : overview.value,
    token.value.colorPrimary,
    token.value.colorError,
    interval.value,
    !isLogin.value && chartView.value === 'module',
    chartViewport.value,
    result.value,
  )
);
const metrics = computed(() => {
  const s = overview.value;
  return [
    {
      key: isLogin.value ? 'loginCount' : 'operationCount',
      value: s?.total,
      suffix: '',
      precision: 0,
    },
    {
      key: 'successRate',
      value: s?.total ? s.success_rate : undefined,
      suffix: '%',
      precision: 1,
    },
    ...(isLogin.value
      ? [
          { key: 'failed', value: s?.failed, suffix: '', precision: 0 },
          {
            key: 'uniqueUsers',
            value: s?.unique_users,
            suffix: '',
            precision: 0,
          },
          { key: 'uniqueIPs', value: s?.unique_ips, suffix: '', precision: 0 },
        ]
      : [
          { key: 'average', value: s?.average_ms, suffix: ' ms', precision: 1 },
          { key: 'p95', value: s?.p95_ms, suffix: ' ms', precision: 1 },
          { key: 'failed', value: s?.failed, suffix: '', precision: 0 },
        ]),
  ];
});
const columns = computed(() => [
  ...(isLogin.value
    ? [{ title: $t('audit.occurred_at'), key: 'occurred_at', width: 180 }]
    : [{ title: $t('audit.business'), key: 'business', width: 205 }]),
  ...fieldKeys.value
    .filter((key) => visible.value.includes(key))
    .map((key) => ({
      title: $t(`audit.${key}`),
      key,
      width:
        key === 'username'
          ? 140
          : key === 'client'
          ? 165
          : key === 'ip'
          ? 135
          : 95,
    })),
  ...(!isLogin.value
    ? [{ title: $t('audit.occurred_at'), key: 'occurred_at', width: 178 }]
    : []),
]);
const failedAccountRanks = computed(() => context.value?.accounts?.filter((item) => item.failed > 0) ?? []);
const sourceRanks = computed(() => context.value?.sources ?? []);
const tableWidth = computed(() =>
  columns.value.reduce((sum, c) => sum + c.width, 0)
);
const sortOptions = computed(() => [
  { value: 'newest', label: $t('audit.timeFirst') },
  { value: 'failure', label: $t('audit.failureFirst') },
  ...(isLogin.value ? [] : [{ value: 'duration', label: $t('audit.byDuration') }]),
]);
function highlighted(value: string) {
  const query = q.value.trim().toLowerCase();
  if (!query) return [{ text: value, matched: false }];
  const segments: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  let index = value.toLowerCase().indexOf(query);
  while (index >= 0) {
    if (index > cursor) segments.push({ text: value.slice(cursor, index), matched: false });
    cursor = index + query.length;
    segments.push({ text: value.slice(index, cursor), matched: true });
    index = value.toLowerCase().indexOf(query, cursor);
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), matched: false });
  return segments;
}
function pickBucket(index: number) {
  if (index < 0) {
    state.clearScope();
    return;
  }
  if (!isLogin.value && chartView.value === 'module') {
    module.value = context.value?.modules?.[index]?.name ?? '';
    void state.applyFilters();
    return;
  }
  const b = overview.value?.trend?.[index];
  if (b)
    state.selectInterval(b.at, b.at + (overview.value?.bucket_ms ?? 3600000));
}
function zoom(range: { start: number; end: number }) {
  chartViewport.value = range;
  if (range.start <= 0 && range.end >= 100) {
    state.clearScope();
    return;
  }
  const buckets = overview.value?.trend ?? [];
  const first =
    buckets[
      Math.max(0, Math.floor(((buckets.length - 1) * range.start) / 100))
    ];
  const last =
    buckets[
      Math.min(
        buckets.length - 1,
        Math.ceil(((buckets.length - 1) * range.end) / 100)
      )
    ];
  if (first && last)
    state.selectInterval(
      first.at,
      last.at + (overview.value?.bucket_ms ?? 3600000)
    );
}
function toggleFailures() {
  result.value = result.value === 'failure' ? '' : 'failure';
  state.closeDetail();
  void state.applyFilters();
}
function setSort(value: string) {
  sort.value = value;
  void state.loadRecords(true);
}
function openDetail(record: AuditPreview) {
  void state.detail(record.id);
}
function related(field: 'ip' | 'path' | 'username', value: string, toggle = false) {
  expanded.value = false;
  state.related(field, value, toggle);
}
function changePage(value: { current?: number; pageSize?: number }) {
  page.value = value.current ?? 1;
  size.value = value.pageSize ?? size.value;
  void state.loadRecords();
}
async function exportEvents() {
  exporting.value = true;
  try {
    const blob = await state.exportEvents();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-${props.kind}-${formatDate(Date.now(), 'YYYY-MM-DD-HH')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    message.error($t('audit.exportError'));
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <Page>
    <div
      ref="root"
      class="audit-page"
      :class="{ 'audit-fullscreen': isFullscreen }"
    >
      <header class="audit-page-heading">
        <div>
          <h1>{{ $t(`audit.${kind}`) }}</h1>
        </div>
        <Space wrap>
          <label class="sr-only" :for="`audit-${kind}-period`">{{
            $t('audit.period')
          }}</label><Select
            :id="`audit-${kind}-period`"
            v-model:value="days"
            :aria-label="$t('audit.period')"
            :options="periodOptions"
            class="audit-period"
            @change="state.changePeriod"
          />
          <Button
            v-if="canRead && canExport"
            :loading="exporting" :aria-busy="exporting"
            :disabled="loading || !total || error"
            @click="exportEvents"
            >
<IconifyIcon icon="lucide:download" class="mr-1" />{{
              $t('audit.export')
            }}
</Button>
        </Space>
      </header>
      <Alert
        v-if="!canRead"
        type="warning"
        show-icon
        :message="$t('audit.noAccess')"
      />
      <template v-else>
        <LoadWarning
kind="statistics"
          v-if="overviewWarningVisible"
          >
<template #action>
<Button size="small" @click="state.refresh()">
{{
              $t('audit.retry')
            }}
</Button>
</template>
</LoadWarning>
        <Card class="audit-ribbon" data-testid="audit-metrics">
          <div class="audit-metrics">
            <div
              v-for="metric in metrics"
              :key="metric.key"
              class="audit-metric"
            >
              <div v-skeleton="overviewLoading">
              <Statistic
                :title="$t(`audit.${metric.key}`)"
                :value="metric.value ?? '—'"
                :precision="metric.precision"
                :suffix="metric.value === undefined ? '' : metric.suffix"
                :value-style="
                  metric.key === 'failed' && metric.value
                    ? { color: token.colorError }
                    : undefined
                "
              >
                <template v-if="metric.key === 'failed'" #formatter>
                  <Button
                    type="link"
                    danger
                    class="audit-failure-filter"
                    data-testid="audit-failure-filter"
                    :aria-label="$t('audit.failed')"
                    :aria-pressed="result === 'failure'"
                    :disabled="overviewLoading || metric.value === undefined"
                    @click="toggleFailures"
                  >{{ metric.value ?? '—' }}</Button>
                </template>
              </Statistic>
              <Progress
                v-if="metric.key === 'successRate'"
                :percent="overview?.success_rate ?? 0"
                :style="{ visibility: overviewLoading || !overview?.total ? 'hidden' : undefined }"
                :show-info="false"
                :stroke-width="3"
                :trail-color="token.colorError"
                class="audit-rate"
              />
              </div>
            </div>
          </div>
</Card>
        <div v-if="isLogin" class="audit-login-analysis">
          <Card class="audit-panel audit-login-activity" data-testid="login-activity">
            <div class="audit-panel-heading">
              <h2>{{ $t('audit.loginActivity') }}</h2>
              <div class="audit-heat-controls">
                <Segmented v-model:value="loginView" :options="loginViews" />
                <div
                  v-if="days === 30 && loginView === 'heatmap'"
                  class="audit-heat-level"
                  :style="{ visibility: showHeatmapLevels ? 'visible' : 'hidden' }"
                >
                  <Segmented
                    :value="heatmapMode"
                    :options="heatmapLevels"
                    :aria-label="$t('audit.heatmapLevel')"
                    @change="changeHeatmapLevel"
                  />
                </div>
              </div>
            </div>
            <div
class="audit-activity-viewport" :aria-busy="!overviewError && (overviewLoading || !activityReady)"
              :role="!overviewError && (overviewLoading || !activityReady) ? 'status' : undefined"
              :aria-label="!overviewError && (overviewLoading || !activityReady) ? $t('audit.activityLoading') : undefined"
>
              <div v-skeleton="!overviewError && (overviewLoading || !activityReady)" class="audit-activity-content">
            <div
              v-if="loginView === 'heatmap'"
              :key="`heatmap-${days}-${state.timezone.timezone}`"
              class="audit-heat-stage"
              @wheel="onHeatmapWheel"
              :class="{ 'audit-heat-stage-month': days === 30 }"
              :style="{ '--zoom-x': `${zoomOrigin.x}%`, '--zoom-y': `${zoomOrigin.y}%` }"
            >
              <Transition :css="days === 30" :name="heatmapMode === 'hour' ? 'audit-zoom-in' : 'audit-zoom-out'" mode="out-in">
                <AuditHeatmap
                  :key="heatmapMode"
                  :data="heatmapMode === 'hour' ? dayHeatmap?.heatmap ?? [] : overview?.heatmap ?? []"
                  :days="days"
                  :result="result"
                  :drill-day="heatmapMode === 'hour' ? heatmapDay : undefined"
                  :selected="cell"
                  :suppress-tooltips="heatmapTooltipSuppressed || zooming"
                  :loading="overviewLoading || overviewError || (heatmapMode === 'hour' && (scopeLoading || scopeError))"
                  @select="selectHeatCell"
                  @hover="setHoveredHeatCell"
                />
              </Transition>
              <span
                v-if="zooming"
                :key="zoomSequence"
                class="audit-heat-lens"
                :class="{ 'audit-heat-lens-out': heatmapMode === 'day' }"
                aria-hidden="true"
                @animationend="zooming = false"
              ></span>
            </div>
            <AuditChart
              v-else
              :key="result"
              :option="chartOption"
              :label="$t('audit.trend')"
              height="100%"
              style="height: 100%; min-height: 0"
              @select="pickBucket"
              @zoom="zoom"
            />
              </div>
            </div>
          </Card>
          <Card class="audit-panel audit-insight" data-testid="period-insight">
            <div class="audit-insight-content">
            <div class="audit-panel-heading">
              <h2>{{ $t('audit.insight') }}</h2>
              <Tag v-if="hasScope" color="blue">
{{
                $t('audit.selectedPeriod')
              }}
</Tag>
            </div>
            <h3 class="audit-scope-title" data-testid="insight-period">
              <template v-if="scopeRange">
                <span class="audit-scope-time">{{ formatDateTime(scopeRange.from) }}</span>
                <span class="audit-scope-separator">-</span>
                <span class="audit-scope-time">{{ formatDateTime(scopeRange.to) }}</span>
              </template>
              <template v-else>{{ scopeLabel }}</template>
            </h3>
            <div class="audit-insight-body">
            <LoadWarning
kind="statistics"
              v-if="scopeWarningVisible"
              class="audit-insight-feedback"
              >
<template #action>
<Button
                  size="small"
                  @click="hasScope ? state.loadScope() : state.refresh()"
                  >
{{ $t('audit.retry') }}
</Button>
</template>
</LoadWarning>
            <div v-skeleton="scopeLoading || overviewLoading" :style="{ visibility: scopeError || overviewError ? 'hidden' : undefined }">
              <div class="audit-insight-counts">
                <Statistic
                  :title="$t('audit.loginAttempts')"
                  :value="context?.total ?? 0"
                /><Statistic
                  :title="$t('audit.failed')"
                  :value="context?.failed ?? 0"
                  :value-style="{
                    color: context?.failed ? token.colorError : undefined,
                  }"
                />
              </div>
              <div class="audit-clue">
                <IconifyIcon icon="lucide:user-round" />
                <div class="audit-clue-content">
                  <div class="audit-clue-heading"><span>{{ $t('audit.failedAccounts') }}</span><small>{{ $t('audit.topEntries', { count: 10 }) }}</small></div>
                  <component
:is="failedAccountRanks.length > 5 ? ScrollArea : 'div'"
                    :type="failedAccountRanks.length > 5 ? 'hover' : undefined"
                    :scroll-hide-delay="0"
                    class="audit-clue-scroll" data-testid="failed-account-slots"
>
                  <div v-if="failedAccountRanks.length" class="audit-clue-list" role="list" :aria-label="$t('audit.failedAccounts')">
                    <div v-for="item in failedAccountRanks" :key="item.name" role="listitem">
                      <Tooltip :title="item.name">
                        <Button
type="link" size="small" :aria-pressed="exact.username === item.name"
                          :class="{ 'audit-clue-selected': exact.username === item.name }"
                          @click="related('username', item.name, true)"
>
                          <span class="audit-clue-name">{{ item.name }}</span><span class="audit-clue-count audit-clue-failed">{{ item.failed }}</span>
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                  <small v-else>{{ $t('audit.noFailures') }}</small>
                  </component>
                </div>
              </div>
              <div class="audit-clue">
                <IconifyIcon icon="lucide:network" />
                <div class="audit-clue-content">
                  <div class="audit-clue-heading"><span>{{ $t('audit.sourceFocus') }}</span><small>{{ $t('audit.topEntries', { count: 10 }) }}</small></div>
                  <component
:is="sourceRanks.length > 5 ? ScrollArea : 'div'"
                    :type="sourceRanks.length > 5 ? 'hover' : undefined"
                    :scroll-hide-delay="0"
                    class="audit-clue-scroll" data-testid="source-slots"
>
                  <div v-if="sourceRanks.length" class="audit-clue-list" role="list" :aria-label="$t('audit.sourceFocus')">
                    <div v-for="item in sourceRanks" :key="item.name" role="listitem">
                      <Tooltip :title="item.name">
                        <Button
type="link" size="small" :aria-pressed="exact.ip === item.name"
                          :class="{ 'audit-clue-selected': exact.ip === item.name }"
                          @click="related('ip', item.name, true)"
>
                          <span class="audit-clue-name">{{ item.name }}</span><span class="audit-clue-count">{{ item.total }}</span>
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                  <small v-else>{{ $t('audit.noSources') }}</small>
                  </component>
                </div>
              </div>
            </div>
            </div>
            </div>
          </Card>
        </div>
        <Card v-else class="audit-panel audit-activity">
          <div class="audit-panel-heading">
            <h2>{{ $t('audit.operationActivity') }}</h2>
            <div class="flex flex-wrap items-center gap-4">
              <span class="audit-series-key"><template v-if="result !== 'failure'"><i :style="{ background: token.colorPrimary }"></i>{{ $t('audit.success') }}</template><template v-if="result !== 'success'"><i :style="{ background: token.colorError }"></i>{{ $t('audit.failure') }}</template></span><Segmented v-model:value="chartView" :options="operationViews" />
            </div>
          </div>
          <AuditChart
            v-skeleton="overviewLoading || (chartView === 'module' && scopeLoading)"
            :key="`${chartView}-${result}`"
            :option="chartOption"
            :label="$t('audit.operationActivity')"
            :height="chartView === 'time' ? '192px' : '175px'"
            @select="pickBucket"
            @zoom="zoom"
          />
        </Card>
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
              :ready="!loading && !overviewLoading && (!!overview || overviewError)"
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
            <FormItem
              :label="$t('audit.search')"
              :html-for="`audit-${kind}-search`"
              >
<SearchAutocomplete
                v-model:value="q"
                :id="`audit-${kind}-search`"
                :options="autoOptions"
                :loading="state.optionsLoading.value"
                :placeholder="$t('audit.searchHint')"
                class="audit-search"
                :dropdown-match-select-width="false"
                :dropdown-style="{ width: 'min(560px, calc(100vw - 32px))', maxWidth: 'calc(100vw - 32px)' }"
                :virtual="false"
                @search="state.suggest"
                @blur="state.searchSoon"
                @select="state.searchSoon"
                @submit="state.applyFilters()"
                @remove-history="state.removeHistory"
              >
                <template #result="{ option }">
                  <div class="audit-suggestion" data-testid="audit-search-suggestion">
                    <span class="audit-suggestion-field">{{ $t(`audit.${option.field}`) }}</span>
                    <span class="audit-suggestion-value"><template v-for="(part, index) in highlighted(String(option.value))" :key="index"><mark v-if="part.matched" :style="{ color: token.colorError }">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
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
            <FormItem
              :label="$t('audit.status')"
              :html-for="`audit-${kind}-result`"
              >
<Select
                v-model:value="result"
                :id="`audit-${kind}-result`"
                :options="resultOptions"
                class="audit-select"
                @change="state.applyFilters()"
            />
</FormItem>
            <template #actions>
              <Button v-if="state.canControl('reset-query')" @click="state.reset()">{{ $t('audit.reset') }}</Button>
              <Button
                :loading="loading" :aria-busy="loading"
                type="primary"
                v-if="state.canControl('query')" @click="state.applyFilters()"
              >
{{ $t('audit.search') }}
</Button>
            </template>
          </ManagementSearch>
        </ManagementCard>
        <div
          class="audit-record-workspace with-detail"
        >
          <Card
            class="audit-records"
            data-testid="audit-records"
            :class="{ 'audit-table-striped': striped }"
          >
            <div class="audit-record-heading">
              <h2>
                {{
                  $t(isLogin ? 'audit.loginRecords' : 'audit.operationRecords')
                }}
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
                @fullscreen="toggle"
                >
<template #columns>
<Space direction="vertical">
<Checkbox
                      v-for="key in fieldKeys"
                      :key="key"
                      :checked="visible.includes(key)"
                      @change="
                        (e) =>
                          (visible = e.target.checked
                            ? [...visible, key]
                            : visible.filter((v) => v !== key))
                      "
                      >
{{ $t(`audit.${key}`) }}
</Checkbox>
</Space>
</template>
</ManagementToolbar>
            </div>

            <LoadWarning
              v-if="error"
              >
<template #action>
<Button size="small" @click="state.loadRecords()">
{{
                  $t('audit.retry')
                }}
</Button>
</template>
</LoadWarning>
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
<time>{{
                    formatDateTime(record.occurred_at)
                  }}</time>
</template>
                <template v-else-if="column.key === 'business'">
<span class="audit-operation-label">{{ operationLabel(record as AuditPreview) }}</span>
                  <div class="audit-request-subtitle">
                    {{ record.method }} {{ record.path }}
                  </div>
</template>
                <template v-else-if="column.key === 'username'">
<div class="audit-account">
                    <Avatar :size="25">
{{
                      (record.username || '?').slice(0, 1).toUpperCase()
                    }}
</Avatar><span>{{ record.username || $t('audit.anonymous') }}</span>
                  </div>
</template>
                <template v-else-if="column.key === 'status'">
<Tag
                    :color="successful(record as AuditPreview) ? 'success' : 'error'"
                    >
{{
                      $t(
                        successful(record as AuditPreview)
                          ? 'audit.success'
                          : 'audit.failure'
                      )
                    }}
</Tag>
</template>
                <template v-else-if="column.key === 'duration_ms'">
{{ record.duration_ms }} ms
</template>
                <template v-else-if="column.key === 'client'">
{{
                  clientLabel(record.user_agent)
                }}
</template>
                <template v-else-if="column.key === 'ip'">
{{
                  record.ip || '—'
                }}
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
              @expand="expanded = true"
              @retry="selectedID && state.detail(selectedID)"
              @related="related"
            />
          </aside>
        </div>
      </template>
    </div>
    <Drawer
      v-model:open="expanded"
      :width="580"
      :closable="false"
      :body-style="{ padding: 0 }"
      >
<section
        role="dialog"
        :aria-label="$t('audit.eventDetail')"
        aria-modal="true"
      >
        <AuditDetail
          expanded
          :event="selected"
          :loading="detailLoading"
          :error="detailError"
          @close="expanded = false"
          @retry="selectedID && state.detail(selectedID)"
          @related="related"
        />
</section>
</Drawer>
  </Page>
</template>
<style scoped>
.audit-login-activity, .audit-insight { min-width: 0; }
.audit-login-activity { display: flex; flex-direction: column; }
.audit-login-activity :deep(.ant-card-body) { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.audit-login-activity .audit-panel-heading { flex-shrink: 0; align-items: flex-start; }
.audit-login-activity .audit-panel-heading h2 { display: flex; min-height: 32px; align-items: center; }
.audit-insight-content { display: flow-root; }
.audit-insight-body { position: relative; }
.audit-insight-feedback { position: absolute; inset: 0 0 auto; }
.audit-activity-viewport { position: relative; display: grid; flex: 1; min-height: 312px; min-width: 0; }
.audit-activity-content { display: grid; min-width: 0; }
.audit-activity-skeleton { position: absolute; inset: 10px 0 0; }
.audit-activity-skeleton :deep(.ant-skeleton-paragraph > li) { height: 34px; margin-top: 12px; }
.audit-heat-controls { display: flex; flex-direction: column; align-items: flex-end; }
.audit-heat-level { height: 32px; margin-top: 8px; }
.audit-heat-stage { display: grid; min-width: 0; position: relative; isolation: isolate; overflow: hidden; padding: 4px; }

.audit-zoom-in-enter-active, .audit-zoom-out-enter-active { transition: transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 360ms; transform-origin: var(--zoom-x) var(--zoom-y); }
.audit-zoom-in-leave-active, .audit-zoom-out-leave-active { transition: transform 180ms ease, opacity 180ms; transform-origin: var(--zoom-x) var(--zoom-y); }
.audit-zoom-in-enter-from { opacity: 0; transform: scale(0.94); }
.audit-zoom-in-leave-to { opacity: 0; transform: scale(1.02); }
.audit-zoom-out-enter-from { opacity: 0; transform: scale(1.02); }
.audit-zoom-out-leave-to { opacity: 0; transform: scale(0.94); }
.audit-heat-lens { position: absolute; pointer-events: none; z-index: 3; left: var(--zoom-x); top: var(--zoom-y); width: 20px; height: 20px; border: 2px solid hsl(var(--primary) / 0.65); border-radius: 50%; background: hsl(var(--primary) / 0.04); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.07); animation: audit-lens-in 420ms ease-out both; }
.audit-heat-lens::after { content: ''; position: absolute; width: 8px; height: 2px; border-radius: calc(var(--radius) * 0.25); background: hsl(var(--primary) / 0.65); right: -6px; bottom: -3px; transform: rotate(45deg); }
.audit-heat-lens-out { animation-name: audit-lens-out; }
@keyframes audit-lens-in { 0% { transform: translate(-50%, -50%) scale(1); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; } }
@keyframes audit-lens-out { 0% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; } 40% { opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .audit-zoom-in-enter-active, .audit-zoom-in-leave-active, .audit-zoom-out-enter-active, .audit-zoom-out-leave-active { transition: none; transform: none; }
  .audit-heat-lens { animation-duration: 1ms; opacity: 0 !important; }
}

.audit-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: hsl(var(--foreground));
}
.audit-fullscreen {
  background: hsl(var(--background));
  overflow: auto;
  padding: 20px;
}
.audit-page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin: 2px 0 3px;
}
.audit-page-heading h1 {
  font-size: 24px;
  line-height: 1.35;
  font-weight: 650;
  margin: 0;
}
.audit-period {
  width: 145px;
}
.audit-ribbon,
.audit-panel,
.audit-records,
.audit-detail-pane {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  box-shadow: none;
}
.audit-ribbon :deep(.ant-card-body) {
  padding: 20px 0;
}
.audit-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.audit-metric {
  position: relative;
  min-height: 76px;
  padding: 0 22px;
  min-width: 0;
}
.audit-failure-filter.ant-btn {
  height: auto;
  padding: 0;
  color: v-bind('token.colorError');
  font: inherit;
  line-height: inherit;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.audit-failure-filter.ant-btn:hover,
.audit-failure-filter.ant-btn[aria-pressed='true'] {
  color: v-bind('token.colorError');
  text-decoration: underline;
  text-underline-offset: 4px;
  background: transparent;
}
.audit-failure-filter.ant-btn:focus-visible {
  outline: 2px solid v-bind('token.colorError');
  outline-offset: 4px;
}
.audit-metric-skeleton { position: absolute; inset: 0 22px; }
.audit-metric + .audit-metric {
  border-left: 1px solid hsl(var(--border));
}
.audit-metric :deep(.ant-statistic-title) {
  font-size: 12px;
  margin-bottom: 5px;
}
.audit-metric :deep(.ant-statistic-content) {
  font-size: 27px;
  font-weight: 600;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.audit-metric :deep(.ant-statistic-content-suffix) {
  font-size: 14px;
  font-weight: 400;
  margin-left: 2px;
}
.audit-rate {
  max-width: 150px;
  margin-top: 3px;
}
.audit-login-analysis {
  display: grid;
  align-items: stretch;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
}
.audit-panel :deep(.ant-card-body) {
  padding: 18px;
}
.audit-panel-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.audit-panel-heading h2 {
  display: inline;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.audit-scope-title {
  min-height: 4.5em;
  font-size: 17px;
  line-height: 1.5;
  font-weight: 600;
  margin: 0 0 14px;
  overflow-wrap: anywhere;
}
.audit-scope-time, .audit-scope-separator { display: block; white-space: nowrap; }
.audit-insight-counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding-bottom: 15px;
  margin-bottom: 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.audit-insight-counts :deep(.ant-statistic-title) {
  font-size: 11px;
}
.audit-insight-counts :deep(.ant-statistic-content) {
  font-size: 27px;
  font-weight: 600;
}
.audit-clue {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 8px 0;
}
.audit-clue-content { flex: 1; }
.audit-clue-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
.audit-clue-scroll { width: 100%; height: 120px; }
.audit-clue-list { height: 100%; padding-right: 12px; }
.audit-clue .audit-clue-list :deep(.ant-btn) { display: flex; align-items: center; width: 100%; max-width: none; height: 24px; gap: 8px; text-align: left; }
.audit-clue-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-clue-count { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.audit-clue-failed { color: v-bind('token.colorError'); }
.audit-clue > svg {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  padding: 7px;
  background: hsl(var(--muted));
  flex-shrink: 0;
}
.audit-clue div {
  min-width: 0;
}
.audit-clue span {
  display: block;
  font-size: 12px;
}
.audit-clue small {
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}
.audit-clue :deep(.ant-btn) {
  padding: 0;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  height: auto;
}
.audit-series-key {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.audit-series-key i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-left: 8px;
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
  overflow: auto;
  overscroll-behavior-y: contain;
  /* Let the records set the grid height; long details scroll within it. */
  contain: size;
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 13px;
}
.audit-record-heading h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.audit-record-order {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  white-space: normal;
  overflow-wrap: anywhere;
}
.audit-order :deep(.ant-segmented-item-selected) {
  color: hsl(var(--primary));
}
.audit-search { width: clamp(210px, 30vw, 360px); }
.audit-suggestion { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; align-items: start; padding: 4px 0; white-space: normal; }
.audit-suggestion-field { color: hsl(var(--muted-foreground)); font-size: 12px; border-right: 1px solid hsl(var(--border)); padding-right: 8px; }
.audit-suggestion-value { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
.audit-suggestion-value mark { padding: 0; color: v-bind('token.colorError'); background: transparent; font-weight: 600; }
.audit-clue .audit-clue-selected { font-weight: 600; background: hsl(var(--primary) / 0.08); border-radius: calc(var(--radius) * 0.5); }
.audit-select {
  width: 120px;
}
.audit-table-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0 10px;
}
.audit-records :deep(.ant-table-cell) {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.audit-records :deep(.ant-table-thead > tr > th) {
  font-size: 12px;
  font-weight: 500;
  background: hsl(var(--muted));
  padding-top: 10px;
  padding-bottom: 10px;
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
  align-items: center;
  gap: 9px;
}
.audit-account :deep(.ant-avatar) {
  background: color-mix(in srgb, hsl(var(--primary)) 15%, hsl(var(--card)));
  color: hsl(var(--primary));
  flex-shrink: 0;
  font-size: 12px;
}
.audit-operation-label {
  color: hsl(var(--foreground));
  font-size: 12px;
  font-weight: 500;
  white-space: normal;
  text-align: left;
}
.audit-request-subtitle {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  font-family: ui-monospace, monospace;
  margin-top: 2px;
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
  .audit-login-analysis,
  .audit-record-workspace.with-detail {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
  .audit-metric-skeleton { inset-inline: 15px; }
  .audit-metric {
    padding: 0 15px;
  }
}
@media (max-width: 1000px) {
  .audit-login-analysis,
  .audit-record-workspace.with-detail {
    grid-template-columns: minmax(0, 1fr);
  }
  .audit-detail-pane {
    max-height: calc(var(--audit-table-body-height) + 200px);
    contain: none;
  }
  .audit-insight-counts {
    max-width: 350px;
  }
  .audit-page-heading {
    flex-wrap: wrap;
  }
  .audit-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px 0;
  }
  .audit-metric:nth-child(4) {
    border-left: 0;
  }
}
@media (max-width: 700px) {
  .audit-activity-viewport { min-height: 340px; }
}
@media (max-width: 600px) {
  .audit-panel-heading {
    flex-wrap: wrap;
  }
  .audit-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .audit-metric:nth-child(odd) {
    border-left: 0;
  }
  .audit-metric:nth-child(even) {
    border-left: 1px solid hsl(var(--border));
  }
  .audit-page-heading h1 {
    font-size: 22px;
  }
  .audit-search {
    width: 100%;
  }
}
</style>
