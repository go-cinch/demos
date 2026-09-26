<template>
  <div class="art-card h-100 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.analysis.customerSatisfaction') }}</h4>
      </div>
    </div>
    <ArtLineChart
      height="calc(100% - 30px)"
      :data="chartData"
      :xAxisData="xAxisData"
      :showLegend="true"
      :showAxisLabel="true"
      :showAxisLine="false"
      :showSplitLine="true"
    />
  </div>
</template>

<script setup lang="ts">
  import type { LineDataItem } from '@/types/component/chart'
  import { $t } from '@/locales'

  const AREA_STYLE_CONFIG = {
    startOpacity: 0.08,
    endOpacity: 0
  } as const

  /**
   * X 轴数据配置
   * 表示一周的天数（周一到周日）
   */
  const xAxisData = ['1', '2', '3', '4', '5', '6', '7']

  /**
   * 客户满意度图表数据
   * 对比上个月和本月的满意度趋势
   */
  const chartData = computed<LineDataItem[]>(() => [
    {
      name: $t('dashboardContent.common.lastMonth'),
      data: [65, 72, 68, 75, 82, 78, 85],
      areaStyle: AREA_STYLE_CONFIG
    },
    {
      name: $t('dashboardContent.common.thisMonth'),
      data: [78, 85, 82, 88, 92, 89, 95],
      areaStyle: AREA_STYLE_CONFIG
    }
  ])
</script>
