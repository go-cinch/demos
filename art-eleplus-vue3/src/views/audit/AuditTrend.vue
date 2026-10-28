<script setup lang="ts">
  import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
  import * as echarts from 'echarts'
  import { $t } from '@/locales'
  import { adminDate, type AuditSummary } from '@/utils/admin/model'
  const props = defineProps<{ summary?: AuditSummary; result: string; timezone: string }>(),
    emit = defineEmits<{ scope: [number, number] }>()
  const root = ref<HTMLElement>()
  let chart: echarts.ECharts | undefined
  let observer: ResizeObserver | undefined
  let themeObserver: MutationObserver | undefined
  function draw() {
    if (!chart) return
    const style = getComputedStyle(document.documentElement),
      points = props.summary?.trend ?? []
    const primary = style.getPropertyValue('--el-color-primary').trim(),
      failure = style.getPropertyValue('--el-color-danger').trim()
    chart.setOption(
      {
        color: props.result === 'failure' ? [failure] : [primary, failure],
        tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => String(value) },
        legend: {
          show: true,
          textStyle: { color: style.getPropertyValue('--el-text-color-secondary') }
        },
        grid: { top: 30, bottom: 60, left: 42, right: 15 },
        xAxis: {
          type: 'time',
          axisLabel: { formatter: (value: number) => adminDate(value, props.timezone).slice(5, 16) }
        },
        yAxis: { type: 'value', minInterval: 1 },
        dataZoom: [{ type: 'slider', bottom: 0, height: 22 }, { type: 'inside' }],
        series: [
          ...(props.result !== 'failure'
            ? [
                {
                  name: $t('pc.audit.success'),
                  type: 'line',
                  smooth: true,
                  areaStyle: { opacity: 0.12 },
                  data: points.map((point) => [point.at, point.success])
                }
              ]
            : []),
          ...(props.result !== 'success'
            ? [
                {
                  name: $t('pc.audit.failure'),
                  type: 'line',
                  smooth: true,
                  areaStyle: { opacity: 0.12 },
                  data: points.map((point) => [point.at, point.failure])
                }
              ]
            : [])
        ]
      },
      { notMerge: true }
    )
  }
  onMounted(() => {
    if (!root.value) return
    chart = echarts.init(root.value)
    draw()
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(root.value)
    themeObserver = new MutationObserver(draw)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })
    chart.on('click', (event) => {
      const point = props.summary?.trend?.[event.dataIndex]
      if (point) emit('scope', point.at, point.at + (props.summary?.bucket_ms ?? 3600000))
    })
    chart.on('datazoom', () => {
      const zoom = (
          chart?.getOption().dataZoom as Array<{ start: number; end: number }> | undefined
        )?.[0],
        points = props.summary?.trend ?? []
      if (!zoom || !points.length) return
      const first = points[Math.floor((zoom.start * (points.length - 1)) / 100)],
        last = points[Math.ceil((zoom.end * (points.length - 1)) / 100)]
      if (first && last) emit('scope', first.at, last.at + (props.summary?.bucket_ms ?? 3600000))
    })
  })
  watch(() => [props.summary, props.result, props.timezone], draw, { deep: true })
  onBeforeUnmount(() => {
    themeObserver?.disconnect()
    observer?.disconnect()
    chart?.dispose()
  })
</script>
<template>
  <div
    ref="root"
    class="audit-trend"
    data-testid="audit-trend"
    :aria-label="$t('pc.audit.trend')"
  />
</template>
<style scoped>
  .audit-trend {
    width: 100%;
    height: 280px;
  }
</style>
