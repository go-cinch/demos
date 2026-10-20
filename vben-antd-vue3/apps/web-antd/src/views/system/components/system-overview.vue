<script setup lang="ts">
import type {
  SystemResource,
  SystemSummary,
  SystemSummaryDay,
  SystemSummaryGroup,
} from '#/api/system/insights';

import { computed, nextTick, ref } from 'vue';

import { useResizeObserver } from '@vueuse/core';
import {
  Button,
  Card,
  Empty,
  Select,
  Tooltip,
} from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { useStatisticsWarning } from '#/composables/use-statistics-warning';
import { vSkeleton } from '#/directives/skeleton';
import { $t, catalogLabel } from '#/locales';

const props = defineProps<{
  resource: SystemResource;
  summary?: SystemSummary;
  loading: boolean;
  error: boolean;
  days: number;
  selectedStatus?: number;
  selectedEnabled?: string;
  selectedCategory?: number;
  selectedDay?: string;
  selectedLoginDay?: string;
  selectedGroups?: string[];
  selectedHasPermissions?: boolean;
  selectedHasMembers?: boolean;
}>();
const emit = defineEmits<{
  retry: [];
  days: [number];
  filter: [{ key: string; value: boolean | number | string | undefined }];
  day: [SystemSummaryDay];
  loginDay: [SystemSummaryDay];
  group: [SystemSummaryGroup];
  permissionGroup: [string];
}>();
const summary = computed<SystemSummary>(() => props.summary ?? {
  total: 0, counts: {}, groups: Array.from({ length: 4 }, (_, id) => ({ id, name: '────────', count: 0 })),
  trend: Array.from({ length: props.days }, (_, index) => ({ date: `loading-${index}`, from: 0, to: 0, count: 0, recent_logged_in_users: 0 })),
});
const warningVisible = useStatisticsWarning(() => props.error);
const trendViewport = ref<HTMLElement>();
const trendTooltips = ref<Array<{ forcePopupAlign: () => void }>>([]);
async function alignTrendTooltips() {
  // The shell changes layout after the window resize event. Align against the
  // chart's settled size so a focused popup cannot retain desktop coordinates.
  await nextTick();
  for (const tooltip of trendTooltips.value) tooltip.forcePopupAlign();
}
useResizeObserver(trendViewport, alignTrendTooltips);
const count = (key: string) => props.summary?.counts[key] ?? 0;
const statusItems = computed(() => [
  {
    value: 1,
    key: 'active',
    label: $t('system.status.active'),
    color: '#289c76',
  },
  {
    value: 0,
    key: 'pending',
    label: $t('system.status.pending'),
    color: '#d9a035',
  },
  {
    value: 2,
    key: 'locked',
    label: $t('system.status.locked'),
    color: '#da6570',
  },
]);
const ring = computed(() => {
  let offset = 0;
  return statusItems.value.map((item) => {
    const fraction = props.summary?.total
      ? count(item.key) / props.summary.total
      : 0;
    const segment = { ...item, length: fraction * 295.3, offset };
    offset += fraction * 295.3;
    return segment;
  });
});
const trendMaximum = computed(() =>
  Math.max(
    1,
    ...(props.summary?.trend.flatMap((day) => [
      day.count,
      day.recent_logged_in_users,
    ]) ?? []),
  ),
);
const newUserCount = computed(
  () => props.summary?.trend.reduce((total, day) => total + day.count, 0) ?? 0,
);
const groupMaximum = computed(() =>
  Math.max(1, ...(props.summary?.groups.map((group) => group.count) ?? [])),
);
const actionMetrics = computed(() => [
  {
    key: 'total',
    label: $t('system-insights.actionTotal'),
    value: props.summary?.total ?? 0,
  },
  {
    key: 'groups',
    label: $t('system-insights.businessGroups'),
    value: props.summary?.groups.length ?? 0,
  },
  {
    key: 'resource',
    label: $t('system-insights.resourceConfigured'),
    value: count('resource'),
  },
  {
    key: 'menu',
    label: $t('system-insights.menuConfigured'),
    value: count('menu'),
  },
  {
    key: 'button',
    label: $t('system-insights.buttonConfigured'),
    value: count('button'),
  },
]);
const roleMetrics = computed(() => [
  {
    key: 'total',
    label: $t(props.resource === 'role' ? 'system-insights.roles' : 'system-insights.groups'),
    value: props.summary?.total ?? 0,
    filter: undefined,
  },
  {
    key: 'with-permissions',
    label: $t('system-insights.withPermissions'),
    value: count('with_permissions'),
    filter: true,
  },
  {
    key: 'without-permissions',
    label: $t('system-insights.withoutPermissions'),
    value: count('without_permissions'),
    filter: false,
  },
]);
const compactItems = computed(() =>
  props.resource === 'dictionary'
    ? [
        {
          key: 'all',
          label: $t('system-insights.all'),
          value: props.summary?.total ?? 0,
          selected: props.selectedEnabled === undefined,
          filter: undefined,
        },
        {
          key: 'enabled',
          label: $t('system.enabled.yes'),
          value: count('enabled'),
          selected: props.selectedEnabled === 'true',
          filter: 'true',
        },
        {
          key: 'disabled',
          label: $t('system.enabled.no'),
          value: count('disabled'),
          selected: props.selectedEnabled === 'false',
          filter: 'false',
        },
      ]
    : [
        {
          key: 'all',
          label: $t('system-insights.all'),
          value: props.summary?.total ?? 0,
          selected: props.selectedCategory === undefined,
          filter: undefined,
        },
        {
          key: 'permission',
          label: $t('system.category.permission'),
          value: count('permission'),
          selected: props.selectedCategory === 0,
          filter: 0,
        },
        {
          key: 'jwt',
          label: $t('system.category.jwt'),
          value: count('jwt'),
          selected: props.selectedCategory === 1,
          filter: 1,
        },
      ],
);
</script>

<template>
  <section
    v-if="!error || warningVisible"
    class="system-overview"
    :aria-label="$t('system-insights.overview')"
    :aria-busy="loading"
    data-testid="management-overview"
  >
    <LoadWarning
kind="statistics"
      v-if="error"
    >
      <template #action>
        <Button size="small" @click="emit('retry')">
          {{ $t('system-insights.retry') }}
        </Button>
      </template>
    </LoadWarning>
    <div v-else v-skeleton="loading" class="overview-content">
      <div v-if="resource === 'user'" class="overview-grid user-grid">
        <Card class="overview-panel status-panel">
          <div class="overview-heading">
            <div>
              <h2>{{ $t('system-insights.accountStatus') }}</h2>
            </div>
          </div>
          <div class="status-layout">
            <div
              class="status-donut"
              role="img"
              :aria-label="
                statusItems
                  .map((item) => `${item.label}: ${count(item.key)}`)
                  .join(', ')
              "
            >
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle
                  cx="60"
                  cy="60"
                  r="47"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="11"
                  class="donut-track"
                />
                <circle
                  v-for="segment in ring"
                  :key="segment.key"
                  cx="60"
                  cy="60"
                  r="47"
                  fill="none"
                  :stroke="segment.color"
                  stroke-width="11"
                  :stroke-dasharray="`${Math.max(0, segment.length - 2)} ${297.3 - segment.length}`"
                  :stroke-dashoffset="-segment.offset"
                />
              </svg>
              <div class="donut-value">
                <strong data-testid="management-stat-total">{{
                  summary.total
                }}</strong><span>{{ $t('system-insights.userTotal') }}</span>
              </div>
            </div>
            <div class="status-legend">
              <button
                :disabled="loading"
                v-for="item in statusItems"
                :key="item.key"
                type="button"
                :aria-label="
                  $t('system-insights.filterStatus', { status: item.label })
                "
                :aria-pressed="selectedStatus === item.value"
                :data-testid="`management-status-${item.key}`"
                @click="emit('filter', { key: 'status', value: item.value })"
              >
                <i :style="{ background: item.color }"></i><span>{{ item.label }}</span><strong :data-testid="`management-stat-${item.key}`">{{
                  count(item.key)
                }}</strong><small>{{
                    summary.total
                      ? ((count(item.key) / summary.total) * 100).toFixed(1)
                      : '0.0'
                  }}%</small>
              </button>
            </div>
          </div>
        </Card>
        <Card class="overview-panel trend-panel">
          <div class="overview-heading">
            <div>
              <h2>{{ $t('system-insights.userTrend') }}</h2>
            </div>
            <Select
              :disabled="loading"
              :value="days"
              :aria-label="$t('system-insights.period')"
              :options="
                [14, 30].map((value) => ({
                  value,
                  label: $t('system-insights.lastDays', { count: value }),
                }))
              "
              @change="(value) => emit('days', Number(value))"
            />
          </div>
          <div class="trend-metrics">
            <div class="trend-total">
              <strong data-testid="management-stat-new-users">{{
                newUserCount
              }}</strong>
              <span>{{ $t('system-insights.newUsers') }}</span>
            </div>
            <div class="trend-total">
              <strong data-testid="management-stat-recent-logged-in-users">{{
                count('recent_logged_in_users')
              }}</strong>
              <span>{{ $t('system-insights.recentLoginUsers') }}</span>
            </div>
          </div>
          <div class="trend-legend">
            <span><i
                class="trend-new-swatch"
                data-testid="management-legend-new-users"
              ></i>{{ $t('system-insights.newUsers') }}</span>
            <span><i
                class="trend-login-swatch"
                data-testid="management-legend-recent-logins"
              ></i>{{ $t('system-insights.recentLoginUsers') }}</span>
          </div>
          <div class="trend-chart">
            <div class="trend-axis" aria-hidden="true">
              <span>{{ trendMaximum }}</span><span>0</span>
            </div>
            <div ref="trendViewport" class="trend-scroll" @scroll="alignTrendTooltips">
              <div
                class="trend-plot"
                data-testid="management-user-trend"
                :style="{ '--trend-days': summary.trend.length }"
              >
                <div
                  v-for="(day, index) in summary.trend"
                  :key="day.date"
                  class="trend-day"
                >
                  <div class="trend-day-bars">
                    <Tooltip ref="trendTooltips" :trigger="['hover', 'focus']">
                      <template #title>
                        <div>{{ day.date }}</div>
                        <div>
                          {{ $t('system-insights.newUsers') }}: {{ day.count }}
                        </div>
                        <div>
                          {{ $t('system-insights.recentLoginUsers') }}:
                          {{ day.recent_logged_in_users }}
                        </div>
                      </template>
                      <button
                        :disabled="loading"
                        type="button"
                        class="trend-bar-target trend-new-target"
                        :aria-label="
                          $t('system-insights.newUserDay', {
                            date: day.date,
                            count: day.count,
                          })
                        "
                        :aria-pressed="selectedDay === day.date"
                        :data-testid="`management-day-${day.date}`"
                        @click="emit('day', day)"
                      >
                        <span
                          class="trend-column trend-new-swatch"
                          :data-testid="`management-new-bar-${day.date}`"
                          :class="{ 'zero-column': !day.count }"
                          :style="{
                            height: `${(day.count / trendMaximum) * 100}%`,
                          }"
                        ></span>
                      </button>
                    </Tooltip>
                    <Tooltip ref="trendTooltips" :trigger="['hover', 'focus']">
                      <template #title>
                        <div>{{ day.date }}</div>
                        <div>
                          {{ $t('system-insights.newUsers') }}: {{ day.count }}
                        </div>
                        <div>
                          {{ $t('system-insights.recentLoginUsers') }}:
                          {{ day.recent_logged_in_users }}
                        </div>
                      </template>
                      <button
                        class="trend-bar-target trend-login-target"
                        :disabled="loading"
                        type="button"
                        :aria-pressed="selectedLoginDay === day.date"
                        :aria-label="
                          $t('system-insights.recentLoginDay', {
                            date: day.date,
                            count: day.recent_logged_in_users,
                          })
                        "
                        :data-testid="`management-login-day-${day.date}`"
                        @click="emit('loginDay', day)"
                      >
                        <span
                          class="trend-column trend-login-swatch"
                          :data-testid="`management-login-bar-${day.date}`"
                          :class="{
                            'zero-column': !day.recent_logged_in_users,
                          }"
                          :style="{
                            height: `${(day.recent_logged_in_users / trendMaximum) * 100}%`,
                          }"
                        ></span>
                      </button>
                    </Tooltip>
                  </div>
                  <span class="trend-date">{{
                    index % (days === 30 ? 5 : 2) === 0 ||
                    index === summary.trend.length - 1
                      ? day.date.slice(5)
                      : ''
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <div
        v-else-if="resource === 'role' || resource === 'user-group'"
        class="overview-grid"
      >
        <Card class="overview-panel">
          <div class="overview-heading">
            <div>
              <h2>
                {{
                  $t(
                    resource === 'role'
                      ? 'system-insights.roleDistribution'
                      : 'system-insights.membersByGroup',
                  )
                }}
              </h2>
            </div>
          </div>
          <div
            v-if="summary.groups.length"
            class="group-bars"
            data-testid="management-group-distribution"
          >
            <template
              v-for="group in summary.groups"
              :key="group.id ?? group.name"
            >
              <button
                :disabled="loading"
                v-if="resource === 'user-group'"
                type="button"
                class="group-bar"
                :aria-label="
                  $t('system-insights.groupMembers', {
                    name: group.name,
                    count: group.count,
                  })
                "
                @click="emit('group', group)"
              >
                <span class="bar-label">{{ group.name }}</span><span class="bar-track"><i
                    :style="{ width: `${(group.count / groupMaximum) * 100}%` }"
                  ></i></span><strong>{{ group.count }}</strong>
              </button>
              <button
                v-else
                :disabled="loading"
                type="button"
                class="group-bar"
                :aria-label="
                  $t('system-insights.selectGroup', {
                    name: (group.name ? catalogLabel('groups', group.name) : $t('system-insights.ungrouped')),
                  })
                "
                :aria-pressed="selectedGroups?.includes(group.name) ?? false"
                data-testid="management-role-group"
                @click="emit('permissionGroup', group.name)"
              >
                <span class="bar-label">{{
                  (group.name ? catalogLabel('groups', group.name) : $t('system-insights.ungrouped'))
                }}</span><span class="bar-track"><i
                    :style="{ width: `${(group.count / groupMaximum) * 100}%` }"
                  ></i></span><strong>{{ group.count }}</strong>
              </button>
            </template>
          </div>
          <Empty
            v-else
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="$t('system-insights.noSummary')"
          />
        </Card>
        <Card class="overview-panel">
          <div class="overview-heading">
            <div>
              <h2>
                {{
                  $t(
                    resource === 'role'
                      ? 'system-insights.roleOverview'
                      : 'system-insights.groupOverview',
                  )
                }}
              </h2>
            </div>
          </div>
          <div class="summary-metrics">
            <div v-for="metric in roleMetrics" :key="metric.key">
              <strong :data-testid="`management-stat-${metric.key}`">{{
                metric.value
              }}</strong>
              <button
                type="button"
                class="summary-filter-label"
                :disabled="loading"
                :aria-pressed="selectedHasPermissions === metric.filter"
                :data-testid="`management-${resource}-filter-${metric.key}`"
                @click="
                  emit('filter', {
                    key: 'has_permissions',
                    value: metric.filter,
                  })
                "
              >
                {{ metric.label }}
              </button>
            </div>
            <div v-if="resource === 'user-group'">
              <strong data-testid="management-stat-empty-groups">{{
                count('empty_groups')
              }}</strong>
              <button
                type="button"
                class="summary-filter-label"
                :disabled="loading"
                :aria-pressed="selectedHasMembers === false"
                data-testid="management-user-group-filter-empty"
                @click="
                  emit('filter', {
                    key: 'has_members',
                    value: selectedHasMembers === false ? undefined : false,
                  })
                "
              >
                {{ $t('system-insights.withoutMembers') }}
              </button>
            </div>
          </div>
        </Card>
      </div>
      <Card
        v-else-if="resource === 'action'"
        class="overview-panel metric-ribbon"
      >
        <div class="summary-metrics">
          <div v-for="metric in actionMetrics" :key="metric.key">
            <span>{{ metric.label }}</span><strong :data-testid="`management-stat-${metric.key}`">{{
              metric.value
            }}</strong>
          </div>
        </div>
      </Card>
      <div v-else class="compact-summary">
        <div class="compact-filters">
          <button
            :disabled="loading"
            v-for="item in compactItems"
            :key="item.key"
            type="button"
            :aria-pressed="item.selected"
            :data-testid="`management-quick-filter-${item.key}`"
            @click="
              emit('filter', {
                key: resource === 'dictionary' ? 'enabled' : 'category',
                value: item.filter,
              })
            "
          >
            <span>{{ item.label }}</span><strong :data-testid="`management-stat-${item.key}`">{{
              item.value
            }}</strong>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.system-overview {
  min-width: 0;
}
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(290px, 1fr);
  gap: 16px;
}
.user-grid {
  grid-template-columns: minmax(310px, 1fr) minmax(0, 1.45fr);
}
.overview-panel,
.overview-loading {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  box-shadow: none;
  background: hsl(var(--card));
  min-width: 0;
}
.overview-panel :deep(.ant-card-body) {
  padding: 18px 20px;
}
.overview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}
.overview-heading h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.overview-caption {
  font-size: 11px;
  line-height: 1.65;
  color: hsl(var(--muted-foreground));
  margin: 0;
}
.overview-heading :deep(.ant-select) {
  min-width: 128px;
}
.status-layout {
  display: flex;
  align-items: center;
  gap: 24px;
}
.status-panel :deep(.ant-card-body) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.status-panel .status-layout {
  flex: 1;
  min-height: 180px;
}
.status-donut {
  position: relative;
  flex-shrink: 0;
  width: 130px;
  height: 130px;
}
.status-donut svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.donut-track {
  color: hsl(var(--muted));
}
.donut-value {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut-value strong {
  font-size: 29px;
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.donut-value span {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.status-legend {
  flex: 1;
  display: grid;
  gap: 9px;
  min-width: 0;
}
.status-legend button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  border-radius: calc(var(--radius) * 0.625);
  padding: 6px;
  width: 100%;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  color: hsl(var(--muted-foreground));
}
.status-legend button:hover,
.status-legend button[aria-pressed='true'] {
  background: hsl(var(--primary) / 0.07);
}
.status-legend i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-legend strong {
  margin-left: auto;
  color: hsl(var(--foreground));
  font-size: 13px;
}
.status-legend small {
  min-width: 38px;
  text-align: right;
  font-size: 11px;
}
.trend-panel {
  --trend-new-color: #3b82f6;
  --trend-login-color: #269c7a;
}
:global(.dark .system-overview .trend-panel) {
  --trend-new-color: #60a5fa;
  --trend-login-color: #48c9a3;
}
.trend-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: -6px;
}
.trend-total {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.trend-total + .trend-total {
  padding-left: 20px;
  border-left: 1px solid hsl(var(--border));
}
.trend-total strong {
  font-size: 26px;
  font-weight: 600;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}
.trend-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 12px 0 10px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.trend-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.trend-legend i {
  width: 8px;
  height: 8px;
  border-radius: calc(var(--radius) * 0.25);
}
.trend-new-swatch {
  background: var(--trend-new-color);
}
.trend-login-swatch {
  background: var(--trend-login-color);
}
.trend-chart {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 5px;
  margin-bottom: 8px;
}
.trend-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 124px;
  text-align: right;
  font-size: 10px;
  line-height: 1;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}
.trend-scroll {
  min-width: 0;
  overflow-x: auto;
  padding: 3px 3px 5px;
  margin-top: -3px;
}
.trend-plot {
  display: flex;
  gap: 6px;
  align-items: stretch;
  min-width: calc(var(--trend-days) * 24px - 6px);
  background: linear-gradient(hsl(var(--border)) 1px, transparent 1px) 0 0 /
    100% 62px no-repeat;
}
.trend-day {
  flex: 1;
  min-width: 18px;
  display: flex;
  flex-direction: column;
  color: hsl(var(--muted-foreground));
}
.trend-day-bars {
  height: 124px;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  width: 100%;
  border-bottom: 1px solid hsl(var(--border));
}
.trend-bar-target {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border: 0;
  border-radius: calc(var(--radius) * 0.375);
  background: none;
  padding: 0;
}
.trend-new-target {
  cursor: pointer;
}
.trend-login-target {
  cursor: pointer;
}
.trend-bar-target:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
.trend-column {
  display: block;
  width: 100%;
  max-width: 16px;
  border-radius: calc(var(--radius) * 0.375) calc(var(--radius) * 0.375) 0 0;
}
.trend-bar-target:hover,
.trend-bar-target[aria-pressed='true'] {
  background: hsl(var(--muted) / 0.65);
}
.trend-new-target[aria-pressed='true'] {
  box-shadow: inset 0 -2px var(--trend-new-color);
}
.trend-login-target[aria-pressed='true'] {
  box-shadow: inset 0 -2px var(--trend-login-color);
}
.zero-column {
  min-height: 1px;
  background: hsl(var(--border));
}
.trend-date {
  font-size: 9px;
  line-height: 14px;
  min-height: 14px;
  white-space: nowrap;
  margin-top: 8px;
  align-self: center;
}
.group-bars {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px 20px;
  max-height: 190px;
  overflow: auto;
  padding: 5px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.group-bar {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) minmax(50px, 2fr) 26px;
  gap: 12px;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 1.7;
  background: none;
  border: 0;
  padding: 5px 7px;
  border-radius: calc(var(--radius) * 0.625);
  color: hsl(var(--foreground));
  text-align: left;
}
.group-bar:is(button) {
  cursor: pointer;
}
.group-bar:is(button):hover,
.group-bar[aria-pressed='true'] {
  background: hsl(var(--primary) / 0.07);
}
.group-bar[aria-pressed='true'] .bar-label,
.group-bar[aria-pressed='true'] strong {
  color: hsl(var(--primary));
}
.bar-label {
  min-width: 0;
  overflow-wrap: anywhere;
  color: hsl(var(--muted-foreground));
}
.bar-track {
  height: 7px;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) * 0.5);
  overflow: hidden;
}
.bar-track i {
  display: block;
  height: 100%;
  background: hsl(var(--primary) / 0.72);
  border-radius: calc(var(--radius) * 0.5);
}
.group-bar:hover .bar-track i,
.group-bar[aria-pressed='true'] .bar-track i {
  background: hsl(var(--primary));
}
.group-bar strong {
  text-align: right;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.summary-metrics {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin: 8px 0 18px;
}
.summary-metrics > div {
  flex: 1;
  min-width: 0;
  padding: 0 18px;
}
.summary-metrics > div:first-child {
  padding-left: 0;
}
.summary-metrics > div + div {
  border-left: 1px solid hsl(var(--border));
}
.summary-metrics strong {
  display: block;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.25;
  margin-bottom: 9px;
  font-variant-numeric: tabular-nums;
}
.summary-metrics span {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
}
.summary-filter-label {
  padding: 4px 0;
  border: 0;
  border-radius: calc(var(--radius) * 0.375);
  background: none;
  color: hsl(var(--primary));
  cursor: pointer;
  font-size: 11px;
  line-height: 1.5;
  text-align: left;
  text-underline-offset: 4px;
}
.summary-filter-label:hover,
.summary-filter-label[aria-pressed='true'] {
  text-decoration: underline;
}
.summary-filter-label:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 3px;
}
.metric-ribbon .summary-metrics {
  margin: 0;
}
.metric-ribbon strong {
  margin: 8px 0 0;
}
.compact-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.compact-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.compact-filters button {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.75);
  background: hsl(var(--card));
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
}
.compact-filters button[aria-pressed='true'] {
  background: hsl(var(--primary) / 0.07);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.3);
}
button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 3px;
}
@media (max-width: 1200px) {
  .overview-grid,
  .user-grid {
    grid-template-columns: 1fr 1fr;
  }
  .overview-panel :deep(.ant-card-body) {
    padding: 16px;
  }
  .status-layout {
    gap: 12px;
  }
  .status-donut {
    width: 112px;
    height: 112px;
  }
  .group-bars {
    grid-template-columns: 1fr;
  }
  .summary-metrics > div {
    padding: 0 12px;
  }
}
@media (max-width: 950px) {
  .overview-grid,
  .user-grid {
    grid-template-columns: 1fr;
  }
  .group-bars {
    grid-template-columns: 1fr 1fr;
  }
  .status-legend {
    max-width: 350px;
  }
  .metric-ribbon .summary-metrics {
    flex-wrap: wrap;
    gap: 16px 0;
  }
  .metric-ribbon .summary-metrics > div {
    flex-basis: 33%;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>

<style scoped>
.group-bars { height: 180px; overflow: auto; scrollbar-gutter: stable; }
.overview-grid:not(.user-grid) .overview-panel { min-height: 260px; }
</style>
