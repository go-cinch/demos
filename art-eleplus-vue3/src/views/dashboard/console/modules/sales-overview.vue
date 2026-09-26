<template>
  <div class="art-card h-105 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.console.visits') }}</h4>
        <p
          >{{ $t('dashboardContent.console.growthThisYear')
          }}<span class="text-success">+15%</span></p
        >
      </div>
    </div>
    <ArtLineChart
      height="calc(100% - 56px)"
      :data="data"
      :xAxisData="xAxisData"
      :showAreaColor="true"
      :showAxisLine="false"
    />
  </div>
</template>

<script setup lang="ts">
  import { $t } from '@/locales'

  /**
   * 全年访问量数据
   * 记录每月的访问量统计
   */
  const data = [50, 25, 40, 20, 70, 35, 65, 30, 35, 20, 40, 44]

  /**
   * X 轴月份标签
   */
  const xAxisData = computed(() =>
    Array.from({ length: 12 }, (_, index) =>
      $t('dashboardContent.common.monthNumber').replace('{number}', String(index + 1))
    )
  )
</script>
