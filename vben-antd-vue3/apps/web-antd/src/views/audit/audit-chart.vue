<script setup lang="ts">
import type { EchartsUIType, ECOption } from '@vben/plugins/echarts';
import { nextTick, onMounted, ref, watch } from 'vue';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { usePreferences } from '@vben/preferences';
const props = withDefaults(
  defineProps<{ option: ECOption; label: string; height?: string }>(),
  { height: '210px' }
);
const emit = defineEmits<{
  select: [number];
  zoom: [{ start: number; end: number }];
}>();
const chart = ref<EchartsUIType>();
const { isDark } = usePreferences();
const { renderEcharts } = useEcharts(chart);
let run = 0;
async function render() {
  const generation = ++run;
  const instance = await renderEcharts(props.option, false);
  if (!instance || generation !== run) return;
  instance.off('click');
  instance.off('datazoom');
  instance.on('click', (event: { dataIndex?: number }) => {
    if (typeof event.dataIndex === 'number') emit('select', event.dataIndex);
  });
  instance.on('datazoom', (event: unknown) => {
    const value = event as {
      start?: number;
      end?: number;
      batch?: { start?: number; end?: number }[];
    };
    const range = value.batch?.[0] ?? value;
    if (typeof range.start === 'number' && typeof range.end === 'number')
      emit('zoom', { start: range.start, end: range.end });
  });
}
onMounted(render);
watch(() => props.option, render, { deep: true });
watch(isDark, async () => {
  await nextTick();
  void render();
});
</script>
<template>
  <div role="img" :aria-label="label">
    <EchartsUI ref="chart" :height="height" />
  </div>
</template>
