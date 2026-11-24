<script setup lang="ts">
import type { AuditExactField, AuditState } from './use-audit';

import type { AuditHeatCell, AuditKind } from '#/api/audit';

import { computed, nextTick, ref, watch } from 'vue';

import { Alert, Button, Card, Segmented, theme } from 'ant-design-vue';

import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import AuditChart from './audit-chart.vue';
import { activityOption, trendBuckets } from './audit-charts';
import AuditHeatmap from './audit-heatmap.vue';
import AuditPeriodInsight from './audit-period-insight.vue';

const props = defineProps<{ state: AuditState; kind: AuditKind }>();
const emit = defineEmits<{
  related: [field: AuditExactField, value: string, toggle: boolean];
}>();
const state = props.state;
const isLogin = computed(() => props.kind === 'login');
const {
  days,
  result,
  module,
  cell,
  heatmapDay,
  dayHeatmap,
  heatmapPlaceholder,
  interval,
  overview,
  context,
  overviewLoading,
  scopeLoading,
  overviewError,
  scopeError,
  hasScope,
} = state;
const { token } = theme.useToken();
const chartView = ref('module');
const chartViewport = ref({ start: 0, end: 100 });
watch([days, () => state.timezone.timezone], () => {
  chartViewport.value = { start: 0, end: 100 };
});
watch(interval, (value) => {
  if (!value) chartViewport.value = { start: 0, end: 100 };
});
const loginView = ref('heatmap');
const activityReady = ref(false);
watch(
  [overviewLoading, overview, days],
  async ([pending, data], _previous, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    activityReady.value = false;
    if (pending || !data) return;
    await nextTick();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (!cancelled) activityReady.value = true;
  },
  { immediate: true },
);
const heatmapMode = ref<'day' | 'hour'>('day');
const showHeatmapLevels = computed(
  () =>
    days.value === 30 && loginView.value === 'heatmap' && !!heatmapDay.value,
);

const zooming = ref(false);
const heatmapTooltipSuppressed = ref(false);
const zoomSequence = ref(0);
const zoomOrigin = ref({ x: 50, y: 50 });
const hoveredHeatCell = ref<{
  cell: AuditHeatCell;
  origin: { x: number; y: number };
}>();
function setHoveredHeatCell(
  value?: AuditHeatCell,
  origin?: { x: number; y: number },
) {
  hoveredHeatCell.value = value && origin ? { cell: value, origin } : undefined;
}
let wheelDelta = 0;
let lastWheelAt = 0;
let wheelLockedUntil = 0;
const heatmapLevels = computed(() => [
  { value: 'day', label: $t('audit.dayView') },
  {
    value: 'hour',
    label: $t('audit.hourView'),
    disabled: Boolean(
      !dayHeatmap.value || scopeLoading.value || scopeError.value,
    ),
  },
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
function selectHeatCell(
  value: AuditHeatCell,
  origin: { x: number; y: number },
) {
  if (days.value === 30 && heatmapMode.value === 'day') {
    const clearing =
      cell.value?.started_at === value.started_at &&
      cell.value.ended_at === value.ended_at;
    heatmapDay.value = clearing ? undefined : value;
    dayHeatmap.value = undefined;
    zoomOrigin.value = origin;
  }
  if (
    heatmapMode.value === 'hour' &&
    heatmapDay.value &&
    cell.value?.started_at === value.started_at &&
    cell.value.ended_at === value.ended_at
  ) {
    state.selectCell(heatmapDay.value, false);
  } else state.selectCell(value);
}
async function changeHeatmapLevel(value: unknown) {
  const next = value === 'hour' ? 'hour' : 'day';
  if (
    days.value !== 30 ||
    !heatmapDay.value ||
    next === heatmapMode.value ||
    (next === 'hour' && !dayHeatmap.value)
  )
    return;
  const sequence = ++zoomSequence.value;
  wheelLockedUntil = performance.now() + 600;
  heatmapTooltipSuppressed.value = true;
  await nextTick();
  if (sequence !== zoomSequence.value || days.value !== 30 || !heatmapDay.value)
    return;
  heatmapMode.value = next;
  hoveredHeatCell.value = undefined;
  zooming.value = true;
  heatmapTooltipSuppressed.value = false;
  if (next === 'day') state.selectCell(heatmapDay.value, false);
}
async function onHeatmapWheel(event: WheelEvent) {
  if (
    days.value !== 30 ||
    loginView.value !== 'heatmap' ||
    !activityReady.value ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    Math.abs(event.deltaY) <= Math.abs(event.deltaX)
  )
    return;
  const target =
    heatmapMode.value === 'day' ? hoveredHeatCell.value : undefined;
  if (!target && !heatmapDay.value) return;
  const now = performance.now();
  if (now < wheelLockedUntil) {
    event.preventDefault();
    return;
  }
  const next = event.deltaY < 0 ? 'hour' : 'day';
  const changingDate =
    !!target &&
    (target.cell.started_at !== heatmapDay.value?.started_at ||
      target.cell.ended_at !== heatmapDay.value?.ended_at);
  if (
    next === heatmapMode.value ||
    (next === 'hour' &&
      !changingDate &&
      (!dayHeatmap.value || scopeLoading.value || scopeError.value))
  )
    return;
  event.preventDefault();
  const unitHeight = [1, 16, 312][event.deltaMode] ?? 1;
  const delta = event.deltaY * unitHeight;
  if (now - lastWheelAt > 180 || Math.sign(delta) !== Math.sign(wheelDelta))
    wheelDelta = 0;
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
    if (
      days.value !== 30 ||
      loginView.value !== 'heatmap' ||
      heatmapDay.value?.started_at !== target.cell.started_at
    )
      return;
  }
  await changeHeatmapLevel(next);
}
watch([days, () => state.timezone.timezone], clearHeatmapDrill);
watch(cell, (value) => {
  if (!value) clearHeatmapDrill();
});
watch(loginView, () => {
  zooming.value = false;
});
const loginViews = computed(() => [
  { value: 'heatmap', label: $t('audit.heatView') },
  { value: 'trend', label: $t('audit.trendView') },
]);
const operationViews = computed(() => [
  { value: 'time', label: $t('audit.timeDistribution') },
  { value: 'module', label: $t('audit.moduleDistribution') },
]);
const chartOption = computed(() =>
  activityOption(
    !isLogin.value && chartView.value === 'module'
      ? context.value
      : overview.value,
    token.value,
    interval.value,
    !isLogin.value && chartView.value === 'module',
    chartViewport.value,
    result.value,
  ),
);
const trend = computed(() => trendBuckets(overview.value));
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
  const bucket = trend.value[index];
  if (bucket) state.selectInterval(bucket.at, bucket.ended_at);
}
function zoom(range: { start: number; end: number }) {
  chartViewport.value = range;
  if (range.start <= 0 && range.end >= 100) {
    state.clearScope();
    return;
  }
  const buckets = trend.value;
  const first =
    buckets[
      Math.max(0, Math.floor(((buckets.length - 1) * range.start) / 100))
    ];
  const last =
    buckets[
      Math.min(
        buckets.length - 1,
        Math.ceil(((buckets.length - 1) * range.end) / 100),
      )
    ];
  if (first && last) state.selectInterval(first.at, last.ended_at);
}
</script>

<template>
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
        class="audit-activity-viewport"
        :aria-busy="!overviewError && (overviewLoading || !activityReady)"
        :role="
          !overviewError && (overviewLoading || !activityReady)
            ? 'status'
            : undefined
        "
        :aria-label="
          !overviewError && (overviewLoading || !activityReady)
            ? $t('audit.activityLoading')
            : undefined
        "
      >
        <div
          v-skeleton="
            loginView === 'trend' &&
            !overviewError &&
            (overviewLoading || !activityReady)
          "
          class="audit-activity-content"
        >
          <div
            v-if="loginView === 'heatmap'"
            :key="`heatmap-${days}-${state.timezone.timezone}`"
            class="audit-heat-stage"
            @wheel="onHeatmapWheel"
            :class="{ 'audit-heat-stage-month': days === 30 }"
            :style="{
              '--zoom-x': `${zoomOrigin.x}%`,
              '--zoom-y': `${zoomOrigin.y}%`,
            }"
          >
            <Transition
              :css="days === 30"
              :name="
                heatmapMode === 'hour' ? 'audit-zoom-in' : 'audit-zoom-out'
              "
              mode="out-in"
            >
              <AuditHeatmap
                :key="heatmapMode"
                :data="
                  heatmapMode === 'hour'
                    ? (dayHeatmap?.heatmap ?? [])
                    : overviewLoading || (!overview && !overviewError)
                      ? heatmapPlaceholder
                      : (overview?.heatmap ?? [])
                "
                :days="days"
                :result="result"
                :drill-day="heatmapMode === 'hour' ? heatmapDay : undefined"
                :selected="cell"
                :suppress-tooltips="heatmapTooltipSuppressed || zooming"
                :loading="
                  !overviewError &&
                  (overviewLoading ||
                    !activityReady ||
                    (heatmapMode === 'hour' && scopeLoading))
                "
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
    <AuditPeriodInsight
      :state="state"
      @related="(field, value, toggle) => emit('related', field, value, toggle)"
    />
  </div>
  <Card
    v-else
    class="audit-panel audit-activity"
    data-testid="operation-activity"
  >
    <div class="audit-panel-heading">
      <h2>{{ $t('audit.operationActivity') }}</h2>
      <div class="flex flex-wrap items-center gap-4">
        <span class="audit-series-key"
          ><template v-if="result !== 'failure'"
            ><i :style="{ background: token.colorPrimary }"></i
            >{{ $t('audit.success') }}</template
          ><template v-if="result !== 'success'"
            ><i :style="{ background: token.colorError }"></i
            >{{ $t('audit.failure') }}</template
          ></span
        ><Segmented v-model:value="chartView" :options="operationViews" />
      </div>
    </div>
    <Alert
      v-if="hasScope && scopeError"
      type="warning"
      show-icon
      :message="$t('audit.moduleStatisticsLoadError')"
    >
      <template #action>
        <Button size="small" @click="state.loadScope()">
          {{ $t('audit.retry') }}
        </Button>
      </template>
    </Alert>
    <AuditChart
      v-if="chartView !== 'module' || !scopeError"
      v-skeleton="overviewLoading || (chartView === 'module' && scopeLoading)"
      :key="`${chartView}-${result}`"
      :option="chartOption"
      :label="$t('audit.operationActivity')"
      :height="chartView === 'time' ? '192px' : '175px'"
      @select="pickBucket"
      @zoom="zoom"
    />
  </Card>
</template>

<style scoped src="./audit-panel.css"></style>

<style scoped>
.audit-login-activity {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.audit-login-activity :deep(.ant-card-body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.audit-login-activity .audit-panel-heading {
  flex-shrink: 0;
  align-items: flex-start;
}

.audit-login-activity .audit-panel-heading h2 {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.audit-activity-viewport {
  position: relative;
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 312px;
}

.audit-activity-content {
  display: grid;
  min-width: 0;
}

.audit-activity-skeleton {
  position: absolute;
  inset: 10px 0 0;
}

.audit-activity-skeleton :deep(.ant-skeleton-paragraph > li) {
  height: 34px;
  margin-top: 12px;
}

.audit-heat-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.audit-heat-level {
  height: 32px;
  margin-top: 8px;
}

.audit-heat-stage {
  position: relative;
  display: grid;
  min-width: 0;
  padding: 4px;
  overflow: hidden;
  isolation: isolate;
}

.audit-zoom-in-enter-active,
.audit-zoom-out-enter-active {
  transform-origin: var(--zoom-x) var(--zoom-y);
  transition:
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 360ms;
}

.audit-zoom-in-leave-active,
.audit-zoom-out-leave-active {
  transform-origin: var(--zoom-x) var(--zoom-y);
  transition:
    transform 180ms ease,
    opacity 180ms;
}

.audit-zoom-in-enter-from {
  opacity: 0;
  transform: scale(0.94);
}

.audit-zoom-in-leave-to {
  opacity: 0;
  transform: scale(1.02);
}

.audit-zoom-out-enter-from {
  opacity: 0;
  transform: scale(1.02);
}

.audit-zoom-out-leave-to {
  opacity: 0;
  transform: scale(0.94);
}

.audit-heat-lens {
  position: absolute;
  top: var(--zoom-y);
  left: var(--zoom-x);
  z-index: 3;
  width: 20px;
  height: 20px;
  pointer-events: none;
  background: hsl(var(--primary) / 4%);
  border: 2px solid hsl(var(--primary) / 65%);
  border-radius: 50%;
  box-shadow: 0 0 0 2px hsl(var(--primary) / 7%);
  animation: audit-lens-in 420ms ease-out both;
}

.audit-heat-lens::after {
  position: absolute;
  right: -6px;
  bottom: -3px;
  width: 8px;
  height: 2px;
  content: '';
  background: hsl(var(--primary) / 65%);
  border-radius: calc(var(--radius) * 0.25);
  transform: rotate(45deg);
}

.audit-heat-lens-out {
  animation-name: audit-lens-out;
}

@keyframes audit-lens-in {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1);
  }

  25% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.5);
  }
}

@keyframes audit-lens-out {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.5);
  }

  40% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .audit-zoom-in-enter-active,
  .audit-zoom-in-leave-active,
  .audit-zoom-out-enter-active,
  .audit-zoom-out-leave-active {
    transform: none;
    transition: none;
  }

  .audit-heat-lens {
    opacity: 0 !important;
    animation-duration: 1ms;
  }
}

.audit-login-analysis {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: stretch;
}

.audit-series-key {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.audit-series-key i {
  width: 7px;
  height: 7px;
  margin-left: 8px;
  border-radius: 50%;
}

@media (max-width: 1250px) {
  .audit-login-analysis {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
}

@media (max-width: 1000px) {
  .audit-login-analysis {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .audit-activity-viewport {
    min-height: 340px;
  }
}
</style>
