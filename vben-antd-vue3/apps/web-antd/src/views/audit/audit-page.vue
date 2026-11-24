<script setup lang="ts">
import type { AuditExactField } from './use-audit';

import type { AuditKind } from '#/api/audit';

import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { formatDate } from '@vben/utils';

import { useFullscreen } from '@vueuse/core';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Progress,
  Select,
  Space,
  Statistic,
  theme,
} from 'ant-design-vue';

import { showRequestErrorToast } from '#/api/request-feedback';
import LoadWarning from '#/components/load-warning.vue';
import { useStatisticsWarning } from '#/composables/use-statistics-warning';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import AuditActivityPanels from './audit-activity-panels.vue';
import AuditDetail from './audit-detail.vue';
import AuditRecords from './audit-records.vue';
import { useAudit } from './use-audit';

const props = defineProps<{ kind: AuditKind }>();
const isLogin = computed(() => props.kind === 'login');
const state = useAudit(props.kind);
const {
  canRead,
  canExport,
  days,
  result,
  overview,
  total,
  loading,
  overviewLoading,
  error,
  overviewError,
  selected,
  selectedID,
  detailLoading,
  detailError,
} = state;
const overviewWarningVisible = useStatisticsWarning(overviewError);
const { token } = theme.useToken();
const root = ref<HTMLElement>();
const { isFullscreen, toggle } = useFullscreen(root);
const expanded = ref(false);
const exporting = ref(false);
const periodOptions = computed(() =>
  [1, 7, 30].map((value) => ({ value, label: $t(`audit.period${value}`) })),
);
const metrics = computed(() => {
  const s = overview.value;
  return [
    {
      key: isLogin.value ? 'loginEvents' : 'operationCount',
      value: s?.total,
      suffix: '',
      precision: 0,
    },
    {
      key: 'successRate',
      value:
        s && (s.success ?? 0) + (s.failed ?? 0) > 0
          ? s.success_rate
          : undefined,
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
function toggleFailures() {
  result.value = result.value === 'failure' ? '' : 'failure';
  state.closeDetail();
  void state.applyFilters();
}
function related(field: AuditExactField, value: string, toggle = false) {
  expanded.value = false;
  state.related(field, value, toggle);
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
  } catch (error) {
    showRequestErrorToast(error);
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
      :style="{ '--audit-error-color': token.colorError }"
      :class="{ 'audit-fullscreen': isFullscreen }"
    >
      <header class="audit-page-toolbar">
        <Space wrap>
          <label class="sr-only" :for="`audit-${kind}-period`">{{
            $t('audit.period')
          }}</label
          ><Select
            :id="`audit-${kind}-period`"
            v-model:value="days"
            :aria-label="$t('audit.period')"
            :options="periodOptions"
            class="audit-period"
            @change="state.changePeriod"
          />
          <Button
            v-if="canRead && canExport"
            :loading="exporting"
            :aria-busy="exporting"
            :disabled="Boolean(loading || !total || error)"
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
          :retry-label="$t('audit.retry')"
          retry-size="small"
          @retry="state.refresh()"
        />
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
                    >
                      {{ metric.value ?? '—' }}
                    </Button>
                  </template>
                </Statistic>
                <Progress
                  v-if="metric.key === 'successRate'"
                  :percent="overview?.success_rate ?? 0"
                  :style="{
                    visibility:
                      overviewLoading || metric.value === undefined
                        ? 'hidden'
                        : undefined,
                  }"
                  :show-info="false"
                  :stroke-width="3"
                  :trail-color="token.colorError"
                  class="audit-rate"
                />
              </div>
            </div>
          </div>
        </Card>
        <AuditActivityPanels :kind="kind" :state="state" @related="related" />
        <AuditRecords
          :kind="kind"
          :state="state"
          :is-fullscreen="isFullscreen"
          @fullscreen="toggle()"
          @expand="expanded = true"
          @related="related"
        />
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
:deep(.audit-panel .ant-card-body) {
  padding: 18px;
}

.audit-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: hsl(var(--foreground));
}

.audit-fullscreen {
  padding: 20px;
  overflow: auto;
  background: hsl(var(--background));
}

.audit-page-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: flex-end;
  margin: 2px 0 3px;
}

.audit-period {
  width: 145px;
}

.audit-ribbon {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
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
  min-width: 0;
  min-height: 76px;
  padding: 0 22px;
}

.audit-failure-filter.ant-btn {
  height: auto;
  padding: 0;
  font: inherit;
  line-height: inherit;
  color: var(--audit-error-color);
  background: transparent;
  border: 0;
  box-shadow: none;
}

.audit-failure-filter.ant-btn:hover,
.audit-failure-filter.ant-btn[aria-pressed='true'] {
  color: var(--audit-error-color);
  text-decoration: underline;
  text-underline-offset: 4px;
  background: transparent;
}

.audit-failure-filter.ant-btn:focus-visible {
  outline: 2px solid var(--audit-error-color);
  outline-offset: 4px;
}

.audit-metric-skeleton {
  position: absolute;
  inset: 0 22px;
}

.audit-metric + .audit-metric {
  border-left: 1px solid hsl(var(--border));
}

.audit-metric :deep(.ant-statistic-title) {
  margin-bottom: 5px;
  font-size: 12px;
}

.audit-metric :deep(.ant-statistic-content) {
  font-size: 27px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.audit-metric :deep(.ant-statistic-content-suffix) {
  margin-left: 2px;
  font-size: 14px;
  font-weight: 400;
}

.audit-rate {
  max-width: 150px;
  margin-top: 3px;
}

@media (max-width: 1250px) {
  .audit-metric-skeleton {
    inset-inline: 15px;
  }

  .audit-metric {
    padding: 0 15px;
  }
}

@media (max-width: 1000px) {
  .audit-page-toolbar {
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

@media (max-width: 600px) {
  .audit-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-metric:nth-child(odd) {
    border-left: 0;
  }

  .audit-metric:nth-child(even) {
    border-left: 1px solid hsl(var(--border));
  }
}
</style>
