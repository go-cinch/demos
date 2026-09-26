<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';
import type { TabOption } from '@vben/types';

import { computed } from 'vue';

import {
  AnalysisChartCard,
  AnalysisChartsTabs,
  AnalysisOverview,
} from '@vben/common-ui';
import {
  SvgBellIcon,
  SvgCakeIcon,
  SvgCardIcon,
  SvgDownloadIcon,
} from '@vben/icons';

import { $t } from '#/locales';

import AnalyticsTrends from './analytics-trends.vue';
import AnalyticsVisitsData from './analytics-visits-data.vue';
import AnalyticsVisitsSales from './analytics-visits-sales.vue';
import AnalyticsVisitsSource from './analytics-visits-source.vue';
import AnalyticsVisits from './analytics-visits.vue';

const overviewItems = computed<AnalysisOverviewItem[]>(() => [
  {
    icon: SvgCardIcon,
    title: $t('page.dashboard.overviewPage.metrics.users'),
    totalTitle: $t('page.dashboard.overviewPage.metrics.totalUsers'),
    totalValue: 120_000,
    value: 2000,
  },
  {
    icon: SvgCakeIcon,
    title: $t('page.dashboard.overviewPage.metrics.visits'),
    totalTitle: $t('page.dashboard.overviewPage.metrics.totalVisits'),
    totalValue: 500_000,
    value: 20_000,
  },
  {
    icon: SvgDownloadIcon,
    title: $t('page.dashboard.overviewPage.metrics.downloads'),
    totalTitle: $t('page.dashboard.overviewPage.metrics.totalDownloads'),
    totalValue: 120_000,
    value: 8000,
  },
  {
    icon: SvgBellIcon,
    title: $t('page.dashboard.overviewPage.metrics.usage'),
    totalTitle: $t('page.dashboard.overviewPage.metrics.totalUsage'),
    totalValue: 50_000,
    value: 5000,
  },
]);

const chartTabs = computed<TabOption[]>(() => [
  {
    label: $t('page.dashboard.overviewPage.tabs.trafficTrends'),
    value: 'trends',
  },
  {
    label: $t('page.dashboard.overviewPage.tabs.monthlyVisits'),
    value: 'visits',
  },
]);
</script>

<template>
  <div class="p-5">
    <AnalysisOverview :items="overviewItems" />
    <AnalysisChartsTabs :tabs="chartTabs" class="mt-5">
      <template #trends>
        <AnalyticsTrends />
      </template>
      <template #visits>
        <AnalyticsVisits />
      </template>
    </AnalysisChartsTabs>

    <div class="mt-5 w-full md:flex">
      <AnalysisChartCard
        class="mt-5 md:mt-0 md:mr-4 md:w-1/3"
        :title="$t('page.dashboard.overviewPage.cards.visitCount')"
      >
        <AnalyticsVisitsData />
      </AnalysisChartCard>
      <AnalysisChartCard
        class="mt-5 md:mt-0 md:mr-4 md:w-1/3"
        :title="$t('page.dashboard.overviewPage.cards.visitSource')"
      >
        <AnalyticsVisitsSource />
      </AnalysisChartCard>
      <AnalysisChartCard
        class="mt-5 md:mt-0 md:w-1/3"
        :title="$t('page.dashboard.overviewPage.cards.businessMix')"
      >
        <AnalyticsVisitsSales />
      </AnalysisChartCard>
    </div>
  </div>
</template>
