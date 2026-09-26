<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { onMounted, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const { locale, t } = useI18n({ useScope: 'global' });

function renderChart() {
  renderEcharts({
    legend: {
      bottom: 0,
      data: [
        t('page.dashboard.overviewPage.charts.visit'),
        t('page.dashboard.overviewPage.charts.trend'),
      ],
    },
    radar: {
      indicator: [
        {
          name: t('page.dashboard.overviewPage.charts.web'),
        },
        {
          name: t('page.dashboard.overviewPage.charts.mobile'),
        },
        {
          name: t('page.dashboard.overviewPage.charts.tablet'),
        },
        {
          name: t('page.dashboard.overviewPage.charts.client'),
        },
        {
          name: t('page.dashboard.overviewPage.charts.thirdParty'),
        },
        {
          name: t('page.dashboard.overviewPage.charts.other'),
        },
      ],
      radius: '60%',
      splitNumber: 8,
    },
    series: [
      {
        areaStyle: {
          opacity: 1,
          shadowBlur: 0,
          shadowColor: 'rgba(0,0,0,.2)',
          shadowOffsetX: 0,
          shadowOffsetY: 10,
        },
        data: [
          {
            itemStyle: {
              color: '#b6a2de',
            },
            name: t('page.dashboard.overviewPage.charts.visit'),
            value: [90, 50, 86, 40, 50, 20],
          },
          {
            itemStyle: {
              color: '#5ab1ef',
            },
            name: t('page.dashboard.overviewPage.charts.trend'),
            value: [70, 75, 70, 76, 20, 85],
          },
        ],
        itemStyle: {
          // borderColor: '#fff',
          borderRadius: 10,
          borderWidth: 2,
        },
        symbolSize: 0,
        type: 'radar',
      },
    ],
    tooltip: {},
  });
}

onMounted(renderChart);
watch(locale, renderChart);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
