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
      bottom: '2%',
      left: 'center',
    },
    series: [
      {
        animationDelay() {
          return Math.random() * 100;
        },
        animationEasing: 'exponentialInOut',
        animationType: 'scale',
        avoidLabelOverlap: false,
        color: ['#5ab1ef', '#b6a2de', '#67e0e3', '#2ec7c9'],
        data: [
          {
            name: t('page.dashboard.overviewPage.charts.searchEngine'),
            value: 1048,
          },
          {
            name: t('page.dashboard.overviewPage.charts.direct'),
            value: 735,
          },
          {
            name: t('page.dashboard.overviewPage.charts.emailMarketing'),
            value: 580,
          },
          {
            name: t('page.dashboard.overviewPage.charts.affiliateAds'),
            value: 484,
          },
        ],
        emphasis: {
          label: {
            fontSize: '12',
            fontWeight: 'bold',
            show: true,
          },
        },
        itemStyle: {
          // borderColor: '#fff',
          borderRadius: 10,
          borderWidth: 2,
        },
        label: {
          position: 'center',
          show: false,
        },
        labelLine: {
          show: false,
        },
        name: t('page.dashboard.overviewPage.charts.visitSource'),
        radius: ['40%', '65%'],
        type: 'pie',
      },
    ],
    tooltip: {
      trigger: 'item',
    },
  });
}

onMounted(renderChart);
watch(locale, renderChart);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
