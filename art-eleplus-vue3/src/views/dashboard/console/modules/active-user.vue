<template>
  <div class="art-card h-105 p-4 box-border mb-5 max-sm:mb-4">
    <ArtBarChart
      class="box-border p-2"
      barWidth="50%"
      height="13.7rem"
      :showAxisLine="false"
      :data="chartData"
      :xAxisData="xAxisLabels"
    />
    <div class="ml-1">
      <h3 class="mt-5 text-lg font-medium">{{ $t('dashboardContent.console.userOverview') }}</h3>
      <p class="mt-1 text-sm"
        >{{ $t('dashboardContent.common.vsLastWeek') }}
        <span class="text-success font-medium">+23%</span></p
      >
      <p class="mt-1 text-sm">{{ $t('dashboardContent.console.userOverviewDescription') }}</p>
    </div>
    <div class="flex-b mt-2">
      <div class="flex-1" v-for="(item, index) in list" :key="index">
        <p class="text-2xl text-g-900">{{ item.num }}</p>
        <p class="text-xs text-g-500">{{ item.name }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { $t } from '@/locales'

  interface UserStatItem {
    name: string
    num: string
  }

  // 最近9个月
  const xAxisLabels = computed(() =>
    Array.from({ length: 9 }, (_, index) =>
      $t('dashboardContent.common.monthNumber').replace('{number}', String(index + 1))
    )
  )

  // 每月活跃用户数
  const chartData = [160, 100, 150, 80, 190, 100, 175, 120, 160]

  /**
   * 用户统计数据列表
   * 包含总用户量、总访问量、日访问量和周同比等关键指标
   */
  const list = computed<UserStatItem[]>(() => [
    { name: $t('dashboardContent.console.totalUsers'), num: '32k' },
    { name: $t('dashboardContent.console.totalVisits'), num: '128k' },
    { name: $t('dashboardContent.console.dailyVisits'), num: '1.2k' },
    { name: $t('dashboardContent.console.weeklyChange'), num: '+5%' }
  ])
</script>
