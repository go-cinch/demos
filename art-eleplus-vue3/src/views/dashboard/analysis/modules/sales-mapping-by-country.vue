<template>
  <div class="art-card h-82 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.analysis.salesDistribution') }}</h4>
      </div>
    </div>

    <ArtRingChart
      :data="salesData"
      :color="['#4C87F3', '#93F1B4', '#8BD8FC']"
      :radius="['46%', '60%']"
    />
  </div>
</template>

<script setup lang="ts">
  import { $t } from '@/locales'

  const salesData = computed(() => [
    { value: 30, name: $t('dashboardContent.analysis.beijing') },
    { value: 25, name: $t('dashboardContent.analysis.shanghai') },
    { value: 45, name: $t('dashboardContent.analysis.guangzhou') }
  ])
</script>
