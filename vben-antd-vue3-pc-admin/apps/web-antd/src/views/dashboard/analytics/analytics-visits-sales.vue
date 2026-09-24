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
    series: [
      {
        animationDelay() {
          return Math.random() * 400;
        },
        animationEasing: 'exponentialInOut',
        animationType: 'scale',
        center: ['50%', '50%'],
        color: ['#5ab1ef', '#b6a2de', '#67e0e3', '#2ec7c9'],
        data: [
          {
            name: t('page.dashboard.overviewPage.charts.outsourcing'),
            value: 500,
          },
          {
            name: t('page.dashboard.overviewPage.charts.customization'),
            value: 310,
          },
          {
            name: t('page.dashboard.overviewPage.charts.technicalSupport'),
            value: 274,
          },
          {
            name: t('page.dashboard.overviewPage.charts.remote'),
            value: 400,
          },
        ].toSorted((a, b) => {
          return a.value - b.value;
        }),
        name: t('page.dashboard.overviewPage.charts.businessMix'),
        radius: '80%',
        roseType: 'radius',
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
