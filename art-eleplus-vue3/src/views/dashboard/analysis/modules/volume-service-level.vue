<template>
  <div class="art-card h-82 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.analysis.volumeService') }}</h4>
      </div>
    </div>

    <ArtBarChart
      class="mt-6"
      height="14.3rem"
      :data="volumeServiceData"
      :xAxisData="serviceCategories"
      :showLegend="true"
      :showAxisLine="false"
      :stack="true"
      barWidth="22%"
    />
  </div>
</template>

<script setup lang="ts">
  import { $t } from '@/locales'

  interface VolumeServiceDataItem {
    name: string
    data: number[]
    stack: string
  }

  /**
   * 服务类别数据
   * 不同产品的分类标签
   */
  const serviceCategories = computed(() =>
    ['A', 'B', 'C', 'D', 'E'].map((name) =>
      $t('dashboardContent.analysis.productNamed').replace('{name}', name)
    )
  )

  /**
   * 业务量与服务量数据
   * 展示各产品的业务量和服务量对比，使用堆叠柱状图展示
   */
  const volumeServiceData = computed<VolumeServiceDataItem[]>(() => [
    {
      name: $t('dashboardContent.analysis.businessVolume'),
      data: [20, 25, 30, 35, 40],
      stack: 'total'
    },
    {
      name: $t('dashboardContent.analysis.serviceVolume'),
      data: [30, 35, 40, 45, 50],
      stack: 'total'
    }
  ])
</script>
