<template>
  <div class="art-card h-100 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.analysis.totalRevenue') }}</h4>
      </div>
    </div>
    <ArtBarChart
      height="calc(100% - 30px)"
      :data="revenueData"
      :xAxisData="weekDays"
      :showLegend="true"
      :showAxisLine="false"
      barWidth="18%"
    />
  </div>
</template>

<script setup lang="ts">
  interface RevenueDataItem {
    name: string
    data: number[]
  }

  /**
   * 一周的日期标签
   */
  import { $t } from '@/locales'

  const weekDays = computed(() =>
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) =>
      $t(`dashboardContent.common.weekdays.${day}`)
    )
  )

  /**
   * 总收入数据
   * 对比线上和线下销售的一周收入情况
   */
  const revenueData = computed<RevenueDataItem[]>(() => [
    {
      name: $t('dashboardContent.analysis.onlineSales'),
      data: [12, 13, 5, 15, 10, 15, 18]
    },
    {
      name: $t('dashboardContent.analysis.offlineSales'),
      data: [10, 11, 20, 5, 11, 13, 10]
    }
  ])
</script>
