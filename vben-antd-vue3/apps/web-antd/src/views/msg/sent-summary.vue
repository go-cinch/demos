<script setup lang="ts">
import type { MsgSentSummary } from '#/api/msg';

import { computed } from 'vue';

import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { useStatisticsWarning } from '#/composables/use-statistics-warning';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

const props = defineProps<{
  error: boolean;
  loading: boolean;
  summary?: MsgSentSummary;
}>();
const emit = defineEmits<{ retry: [] }>();
const summary = computed<MsgSentSummary>(() => props.summary ?? {
  total: 0, counts: { notice: 0, system: 0, all: 0, targeted: 0, latest_published_at: null },
});
const warningVisible = useStatisticsWarning(() => props.error);
const timezone = useTimezoneStore();
function displayTime(value: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}
</script>

<template>
  <div v-if="!error || warningVisible" data-testid="message-sent-summary" class="shrink-0">
    <LoadWarning kind="statistics" v-if="error">
      <template #action>
<Button @click="emit('retry')">{{ $t('msg.retry') }}</Button>
</template>
    </LoadWarning>
    <div v-else v-skeleton="loading" class="sent-summary-grid" :aria-busy="loading">
<section class="sent-summary-card">
          <h2>{{ $t('msg.publishedCount') }}</h2>
          <strong class="sent-summary-number">{{ summary.total.toLocaleString() }}</strong>
          <div class="sent-summary-note">
            <span>{{ $t('msg.latestPublished') }}</span>
            <span>{{
              summary.counts.latest_published_at
                ? displayTime(summary.counts.latest_published_at)
                : '—'
            }}</span>
          </div>
        </section>
        <section class="sent-summary-card">
          <h2>{{ $t('msg.type') }}</h2>
          <div class="sent-summary-value">
            <strong>{{ summary.counts.notice.toLocaleString() }}</strong>
            <span>{{ $t('msg.notice') }} / {{ summary.counts.system.toLocaleString() }}
              {{ $t('msg.system') }}</span>
          </div>
          <div
            class="sent-distribution"
            role="img"
            :aria-label="
              $t('msg.typeDistribution', {
                notice: summary.counts.notice,
                system: summary.counts.system,
              })
            "
          >
            <span
              class="sent-notice-bar"
              :style="{ width: `${percent(summary.counts.notice, summary.total)}%` }"
            ></span>
            <span
              class="sent-system-bar"
              :style="{ width: `${percent(summary.counts.system, summary.total)}%` }"
            ></span>
          </div>
          <div class="sent-summary-note">
            <span>{{ $t('msg.notice') }} {{ percent(summary.counts.notice, summary.total) }}%</span>
            <span>{{ $t('msg.system') }} {{ percent(summary.counts.system, summary.total) }}%</span>
          </div>
        </section>
        <section class="sent-summary-card">
          <h2>{{ $t('msg.scope') }}</h2>
          <div class="sent-summary-value">
            <strong>{{ summary.counts.all.toLocaleString() }}</strong>
            <span>{{ $t('msg.all') }} / {{ summary.counts.targeted.toLocaleString() }}
              {{ $t('msg.targeted') }}</span>
          </div>
          <div
            class="sent-distribution"
            role="img"
            :aria-label="
              $t('msg.scopeDistribution', {
                all: summary.counts.all,
                targeted: summary.counts.targeted,
              })
            "
          >
            <span
              class="sent-all-bar"
              :style="{ width: `${percent(summary.counts.all, summary.total)}%` }"
            ></span>
            <span
              class="sent-targeted-bar"
              :style="{ width: `${percent(summary.counts.targeted, summary.total)}%` }"
            ></span>
          </div>
        </section>
    </div>
  </div>
</template>

<style scoped>
.sent-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.sent-summary-card {
  min-width: 0;
  padding: 20px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
}
.sent-summary-card h2 {
  margin: 0 0 10px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 400;
}
.sent-summary-number,
.sent-summary-value strong {
  font-size: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
.sent-summary-number {
  display: block;
  margin-bottom: 18px;
}
.sent-summary-value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.sent-summary-value span {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.sent-summary-note {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  margin: 10px 0 0;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  line-height: 1.8;
}
.sent-distribution {
  display: flex;
  gap: 3px;
  height: 7px;
  overflow: hidden;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) * 0.625);
}
.sent-distribution span {
  display: block;
  height: 100%;
}
.sent-notice-bar {
  background: hsl(var(--primary));
}
.sent-system-bar {
  background: #a28ad8;
}
.sent-all-bar {
  background: #168198;
}
.sent-targeted-bar {
  background: #83bfc5;
}
@media (max-width: 1000px) {
  .sent-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sent-summary-card:last-child {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .sent-summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
