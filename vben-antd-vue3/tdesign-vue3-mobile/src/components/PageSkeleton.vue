<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ variant?: 'list' | 'options' | 'overview' | 'page' }>(), {
  variant: 'page',
});

const rows = computed(() => {
  if (props.variant === 'options')
    return Array.from({ length: 4 }, () => [
      { type: 'circle' as const, size: '32px', marginRight: '12px' },
      { type: 'text' as const, width: '68%', height: '16px' },
    ]);
  if (props.variant === 'list')
    return Array.from({ length: 5 }, (_, index) => [
      { type: 'circle' as const, size: '38px', marginRight: '12px' },
      { type: 'text' as const, width: index % 2 ? '58%' : '72%', height: '16px' },
      { type: 'text' as const, width: '18%', height: '14px', marginLeft: 'auto' },
    ]);
  if (props.variant === 'overview')
    return [
      { type: 'rect' as const, width: '100%', height: '238px' },
      [
        { type: 'rect' as const, width: '23%', height: '72px' },
        { type: 'rect' as const, width: '23%', height: '72px', marginLeft: '2%' },
        { type: 'rect' as const, width: '23%', height: '72px', marginLeft: '2%' },
        { type: 'rect' as const, width: '23%', height: '72px', marginLeft: '2%' },
      ],
      { type: 'rect' as const, width: '100%', height: '150px' },
    ];
  return [
    { type: 'text' as const, width: '36%', height: '24px' },
    { type: 'text' as const, width: '68%', height: '14px' },
    { type: 'rect' as const, width: '100%', height: '132px' },
    { type: 'rect' as const, width: '100%', height: '92px' },
  ];
});
</script>

<template>
  <div class="page-skeleton" :class="`page-skeleton-${variant}`" role="status" aria-busy="true">
    <t-skeleton animation="gradient" :row-col="rows" />
  </div>
</template>
