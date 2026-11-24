<script setup lang="ts">
import type { AuditExactField, AuditState } from './use-audit';

import { computed } from 'vue';

import { ScrollArea } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import { Button, Card, Statistic, Tag, theme, Tooltip } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { useStatisticsWarning } from '#/composables/use-statistics-warning';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

const props = defineProps<{ state: AuditState }>();
const emit = defineEmits<{
  related: [field: AuditExactField, value: string, toggle: boolean];
}>();
const state = props.state;
const {
  cell,
  interval,
  context,
  exact,
  overviewLoading,
  scopeLoading,
  overviewError,
  scopeError,
  hasScope,
  scopeLabel,
} = state;
const { token } = theme.useToken();
const scopeWarningVisible = useStatisticsWarning(
  () => scopeError.value || overviewError.value,
);
const scopeRange = computed(() =>
  cell.value
    ? { from: cell.value.started_at, to: cell.value.ended_at }
    : interval.value,
);
const failedAccountRanks = computed(
  () => context.value?.accounts?.filter((item) => item.failed > 0) ?? [],
);
const sourceRanks = computed(() => context.value?.sources ?? []);
</script>

<template>
  <Card class="audit-panel audit-insight" data-testid="period-insight">
    <div class="audit-insight-content">
      <div class="audit-panel-heading">
        <h2>{{ $t('audit.insight') }}</h2>
        <Tag v-if="hasScope" color="blue">
          {{ $t('audit.selectedPeriod') }}
        </Tag>
      </div>
      <h3 class="audit-scope-title" data-testid="insight-period">
        <template v-if="scopeRange">
          <span class="audit-scope-time">{{
            formatDateTime(scopeRange.from)
          }}</span>
          <span class="audit-scope-separator">-</span>
          <span class="audit-scope-time">{{
            formatDateTime(scopeRange.to)
          }}</span>
        </template>
        <template v-else>{{ scopeLabel }}</template>
      </h3>
      <div class="audit-insight-body">
        <LoadWarning
          kind="statistics"
          v-if="scopeWarningVisible"
          class="audit-insight-feedback"
          :retry-label="$t('audit.retry')"
          retry-size="small"
          @retry="hasScope ? state.loadScope() : state.refresh()"
        />
        <div
          v-skeleton="scopeLoading || overviewLoading"
          :style="{
            visibility: scopeError || overviewError ? 'hidden' : undefined,
          }"
        >
          <div class="audit-insight-counts">
            <Statistic
              :title="$t('audit.loginEvents')"
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
              <div class="audit-clue-heading">
                <span>{{ $t('audit.failedAccounts') }}</span
                ><small>{{ $t('audit.topEntries', { count: 10 }) }}</small>
              </div>
              <component
                :is="failedAccountRanks.length > 5 ? ScrollArea : 'div'"
                :type="failedAccountRanks.length > 5 ? 'hover' : undefined"
                :scroll-hide-delay="0"
                class="audit-clue-scroll"
                data-testid="failed-account-slots"
              >
                <div
                  v-if="failedAccountRanks.length"
                  class="audit-clue-list"
                  role="list"
                  :aria-label="$t('audit.failedAccounts')"
                >
                  <div
                    v-for="item in failedAccountRanks"
                    :key="item.name"
                    role="listitem"
                  >
                    <Tooltip :title="item.name">
                      <Button
                        type="link"
                        size="small"
                        :aria-pressed="exact.username === item.name"
                        :class="{
                          'audit-clue-selected': exact.username === item.name,
                        }"
                        @click="emit('related', 'username', item.name, true)"
                      >
                        <span class="audit-clue-name">{{ item.name }}</span
                        ><span class="audit-clue-count audit-clue-failed">{{
                          item.failed
                        }}</span>
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
              <div class="audit-clue-heading">
                <span>{{ $t('audit.sourceFocus') }}</span
                ><small>{{ $t('audit.topEntries', { count: 10 }) }}</small>
              </div>
              <component
                :is="sourceRanks.length > 5 ? ScrollArea : 'div'"
                :type="sourceRanks.length > 5 ? 'hover' : undefined"
                :scroll-hide-delay="0"
                class="audit-clue-scroll"
                data-testid="source-slots"
              >
                <div
                  v-if="sourceRanks.length"
                  class="audit-clue-list"
                  role="list"
                  :aria-label="$t('audit.sourceFocus')"
                >
                  <div
                    v-for="item in sourceRanks"
                    :key="item.name"
                    role="listitem"
                  >
                    <Tooltip :title="item.name">
                      <Button
                        type="link"
                        size="small"
                        :aria-pressed="exact.ip === item.name"
                        :class="{
                          'audit-clue-selected': exact.ip === item.name,
                        }"
                        @click="emit('related', 'ip', item.name, true)"
                      >
                        <span class="audit-clue-name">{{ item.name }}</span
                        ><span class="audit-clue-count">{{ item.total }}</span>
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
</template>

<style scoped src="./audit-panel.css"></style>

<style scoped>
.audit-insight {
  min-width: 0;
}

.audit-insight-content {
  display: flow-root;
}

.audit-insight-body {
  position: relative;
}

.audit-insight-feedback {
  position: absolute;
  inset: 0 0 auto;
}

.audit-scope-title {
  min-height: 4.5em;
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.audit-scope-time,
.audit-scope-separator {
  display: block;
  white-space: nowrap;
}

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
  gap: 12px;
  align-items: flex-start;
  margin: 8px 0;
}

.audit-clue-content {
  flex: 1;
}

.audit-clue-heading {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 3px;
}

.audit-clue-scroll {
  width: 100%;
  height: 120px;
}

.audit-clue-list {
  height: 100%;
  padding-right: 12px;
}

.audit-clue .audit-clue-list :deep(.ant-btn) {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  max-width: none;
  height: 24px;
  text-align: left;
}

.audit-clue-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-clue-count {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.audit-clue-failed {
  color: var(--audit-error-color);
}

.audit-clue > svg {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 7px;
  background: hsl(var(--muted));
  border-radius: 50%;
}

.audit-clue div {
  min-width: 0;
}

.audit-clue span {
  display: block;
  font-size: 12px;
}

.audit-clue small {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.audit-clue :deep(.ant-btn) {
  max-width: 210px;
  height: auto;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.audit-clue .audit-clue-selected {
  font-weight: 600;
  background: hsl(var(--primary) / 8%);
  border-radius: calc(var(--radius) * 0.5);
}

@media (max-width: 1000px) {
  .audit-insight-counts {
    max-width: 350px;
  }
}
</style>
