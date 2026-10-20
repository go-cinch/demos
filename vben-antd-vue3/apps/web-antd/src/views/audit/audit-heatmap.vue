<script setup lang="ts">
import type { AuditHeatCell } from '#/api/audit';
import { computed, ref, watch } from 'vue';
import { formatDate, formatDateTime } from '@vben/utils';
import { Button, Tooltip, theme } from 'ant-design-vue';
import { $t } from '#/locales';
import { vSkeleton } from '#/directives/skeleton';
const props = defineProps<{
  data: AuditHeatCell[];
  days: number;
  result?: string;
  drillDay?: AuditHeatCell;
  selected?: AuditHeatCell;
  loading?: boolean;
  suppressTooltips?: boolean;
}>();
const emit = defineEmits<{
  select: [AuditHeatCell, { x: number; y: number }];
  hover: [AuditHeatCell | undefined, { x: number; y: number } | undefined];
}>();
const { token } = theme.useToken();
const root = ref<HTMLElement>();
const focusIndex = ref(0);
const cells = computed(() => {
  if (!props.drillDay) return props.data.map((cell, index) => ({ ...cell, index, disabled: false }));
  return Array.from({ length: 24 }, (_, hour) => {
    const matches = props.data.filter((cell) => cell.hour === hour);
    const first = matches[0];
    return {
      started_at: first?.started_at ?? props.drillDay!.started_at,
      ended_at: matches.at(-1)?.ended_at ?? props.drillDay!.started_at,
      weekday: first?.weekday ?? props.drillDay!.weekday, hour, index: hour,
      count: matches.reduce((count, cell) => count + cell.count, 0),
      failed: matches.reduce((count, cell) => count + cell.failed, 0),
      disabled: !first,
    };
  });
});
type Cell = (typeof cells.value)[number];
const detailed = computed(() => props.days === 7);
const rows = computed(() => {
  if (!detailed.value) {
    return Array.from({ length: Math.ceil(cells.value.length / 6) }, (_, index) => ({
      key: String(index), label: '', weekday: '',
      slots: cells.value.slice(index * 6, index * 6 + 6).map((cell) => [cell]),
    }));
  }
  const dates = new Map<string, { key: string; label: string; weekday: string; slots: Cell[][] }>();
  for (const cell of cells.value) {
    const date = formatDate(cell.started_at);
    let row = dates.get(date);
    if (!row) {
      row = { key: date, label: formatDate(cell.started_at, 'MM-DD'),
        weekday: $t(`audit.weekday${cell.weekday}`),
        slots: Array.from({ length: 24 }, () => []) };
      dates.set(date, row);
    }
    row.slots[cell.hour]!.push(cell);
  }
  return [...dates.values()];
});
const scaleColor = computed(() => props.result === 'failure' ? token.value.colorError : 'hsl(var(--primary))');
const maxCount = computed(() => Math.max(1, ...cells.value.map((cell) => cell.count)));
const peak = computed(() => cells.value.reduce<Cell | undefined>(
  (best, cell) => !best || cell.count > best.count ? cell : best, undefined,
));
function label(cell: Cell) {
  if (cell.disabled) return $t('audit.hourUnavailable', { hour: String(cell.hour).padStart(2, '0') });
  return $t('audit.heatInterval', {
    start: formatDateTime(cell.started_at), end: formatDateTime(cell.ended_at),
    count: cell.count, failed: cell.failed,
  });
}
function abnormal(cell: Cell) {
  return cell.failed > cell.count - cell.failed;
}
function cellStyle(cell: Cell) {
  const intensity = !props.result && abnormal(cell)
    ? 28 + (cell.failed / cell.count - 0.5) * 120
    : 18 + Math.sqrt(cell.count / maxCount.value) * 76;
  const accent = abnormal(cell) ? token.value.colorError : 'hsl(var(--primary))';
  return {
    '--cell-color': cell.count ? `color-mix(in srgb, ${accent} ${intensity}%, hsl(var(--card)))` : 'hsl(var(--muted))',
    '--cell-text': !abnormal(cell) && cell.count && intensity > 80 ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
    '--cell-accent': accent,
  };
}
function isSelected(cell: Cell) {
  return !cell.disabled && props.selected?.started_at === cell.started_at && props.selected.ended_at === cell.ended_at;
}
function move(event: KeyboardEvent, index: number) {
  const columns = detailed.value ? 24 : 6;
  const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
  const offset = offsets[event.key];
  if (offset === undefined) return;
  event.preventDefault();
  let next = Math.max(0, Math.min(cells.value.length - 1, index + offset));
  while (cells.value[next]?.disabled && next !== index) next += next > index ? -1 : 1;
  focusIndex.value = next;
  root.value?.querySelectorAll<HTMLButtonElement>('.audit-heat-cell')[focusIndex.value]?.focus();
}
function originFor(event: MouseEvent) {
  const area = root.value?.parentElement?.getBoundingClientRect();
  const target = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return {
    x: area ? ((target.x + target.width / 2 - area.x) / area.width) * 100 : 50,
    y: area ? ((target.y + target.height / 2 - area.y) / area.height) * 100 : 50,
  };
}
function pick(cell: Cell, event: MouseEvent) {
  emit('select', cell, originFor(event));
}
watch(() => props.data, () => { focusIndex.value = Math.max(0, cells.value.findIndex((cell) => !cell.disabled)); });
</script>
<template>
  <div ref="root" v-skeleton="{ loading: !!loading, targets: '.audit-heat-cell,.audit-day,.audit-hours > span:not(:empty),.audit-heat-footer > span,.audit-legend' }" class="audit-heatmap" :class="{ detailed, 'hour-grid': days === 1 || !!drillDay }" role="group"
    :style="{ '--heat-rows': Math.max(rows.length, 1) }"
    :aria-label="$t('audit.heatmap')" :aria-busy="loading">
    <div v-if="detailed" class="audit-heat-row audit-hours" aria-hidden="true">
      <span></span><span v-for="hour in 24" :key="hour">{{
        (hour - 1) % 3 === 0 ? String(hour - 1).padStart(2, '0') : ''
      }}</span>
    </div>
    <div v-for="row in rows" :key="row.key" class="audit-heat-row">
      <span v-if="detailed" class="audit-day" :title="row.key">
        {{ row.label }}<small>{{ row.weekday }}</small>
      </span>
      <div v-for="(slot, index) in row.slots" :key="index" class="audit-heat-slot">
        <Tooltip v-for="cell in slot" :key="cell.index" :title="label(cell)" :open="suppressTooltips || loading ? false : undefined" :destroy-tooltip-on-hide="true">
          <Button class="audit-heat-cell" :class="{ selected: isSelected(cell) }"
            :style="cellStyle(cell)"
            :aria-label="label(cell)" :aria-pressed="isSelected(cell)" :disabled="loading || cell.disabled"
            :tabindex="focusIndex === cell.index ? 0 : -1" @focus="focusIndex = cell.index"
            @keydown="move($event, cell.index)" @click="pick(cell, $event)"
            @mouseenter="emit('hover', cell, originFor($event))" @mouseleave="emit('hover', undefined, undefined)">
            <template v-if="!detailed">
              <span class="audit-cell-label">{{ drillDay ? `${String(cell.hour).padStart(2, '0')}:00` : formatDate(cell.started_at, days === 1 ? 'HH:mm' : 'MM-DD') }}</span>
              <small>{{ drillDay ? formatDate(drillDay.started_at, 'MM-DD') : days === 1 ? formatDate(cell.started_at, 'MM-DD') : $t(`audit.weekday${cell.weekday}`) }}</small>
            </template>
          </Button>
        </Tooltip>
      </div>
    </div>
    <div class="audit-heat-footer">
      <span>{{ peak?.count ? $t('audit.heatPeak', {
        time: formatDate(peak.started_at, days === 30 && !drillDay ? 'MM-DD' : 'MM-DD HH:mm'), count: peak.count,
      }) : $t('audit.empty') }}</span>
      <div class="audit-legend">
        <span>{{ $t('audit.less') }}</span><i v-for="n in 5" :key="n"
          :style="{ background: `color-mix(in srgb, ${scaleColor} ${n * 18}%, hsl(var(--card)))` }"></i>
        <span>{{ $t('audit.more') }}</span>
        <span v-if="!result" class="audit-anomaly-legend"><i v-for="strength in [30, 60, 88]" :key="strength"
          :style="{ background: `color-mix(in srgb, ${token.colorError} ${strength}%, hsl(var(--card)))` }"></i>{{ $t('audit.failureDominant') }}</span>
      </div>
    </div>
  </div>
</template>
<style scoped>
.audit-heatmap { --heat-row-min: 52px; min-height: 304px; padding-top: 10px; display: grid; grid-template-rows: repeat(var(--heat-rows), minmax(var(--heat-row-min), 1fr)) auto; }
.hour-grid { --heat-row-min: 65px; }
.detailed { --heat-row-min: 34px; grid-template-rows: auto repeat(var(--heat-rows), minmax(var(--heat-row-min), 1fr)) auto; }
.audit-heat-row { min-height: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-bottom: 6px; align-items: stretch; }
.detailed .audit-heat-row { grid-template-columns: 60px repeat(24, minmax(0, 1fr)); gap: 3px; margin-bottom: 4px; }
.audit-heat-slot { display: flex; gap: 2px; min-width: 0; }
.audit-heat-slot > :deep(*) { flex: 1; min-width: 0; }
.audit-hours { align-items: center; margin-bottom: 10px; color: hsl(var(--muted-foreground)); font-size: 11px; }
.audit-day { font-size: 12px; color: hsl(var(--foreground)); line-height: 1.2; }
.audit-day small { display: block; color: hsl(var(--muted-foreground)); font-size: 10px; margin-top: 2px; }
.audit-heat-cell.ant-btn { position: relative; width: 100%; height: 100%; min-height: 46px; min-width: 0; padding: 4px; border: 1px solid transparent; border-radius: calc(var(--radius) * 0.5); background: var(--cell-color); color: var(--cell-text); box-shadow: none; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.3; }
.hour-grid .audit-heat-cell.ant-btn { min-height: 59px; }
.detailed .audit-heat-cell.ant-btn { height: 100%; min-height: 30px; padding: 0; }
.audit-heat-cell.ant-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.audit-heat-cell.ant-btn.layout-skeleton-shape { opacity: 1; }
.audit-heat-cell.layout-skeleton-shape::after { inset: 0; }
.audit-cell-label { font-size: 12px; font-weight: 500; }
.audit-heat-cell small { font-size: 10px; opacity: 0.75; }
.audit-heat-cell.ant-btn:hover, .audit-heat-cell.ant-btn:focus-visible, .audit-heat-cell.ant-btn.selected { outline: 2px solid var(--cell-accent); outline-offset: 1px; z-index: 1; }
.audit-heat-footer { align-items: flex-start; line-height: 16px; flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; color: hsl(var(--muted-foreground)); font-size: 11px; margin-top: 0; padding-top: 14px; }
.audit-legend { min-height: 16px; display: flex; align-items: center; gap: 4px; }
.audit-legend i { width: 11px; height: 11px; border-radius: calc(var(--radius) * 0.25); }
.audit-anomaly-legend { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; }
@media (max-width: 700px) {
  .audit-heatmap { min-height: 332px; }
  .detailed .audit-heat-row { gap: 2px; grid-template-columns: 45px repeat(24, minmax(0, 1fr)); }
  .detailed .audit-heat-cell.ant-btn { min-height: 28px; border-radius: calc(var(--radius) * 0.25); }
}
</style>
