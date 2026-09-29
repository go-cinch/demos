<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });

// Shared 24px optical grid, rounded strokes, and existing semantic names.
const paths: Record<string, string[]> = {
  add: ['M12 5v14M5 12h14'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  'eye-off': [
    'm3 3 18 18M9.5 5.3C10.3 5.1 11.1 5 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6.8A22 22 0 0 0 2 12s3.5 7 10 7c2 0 3.7-.6 5.2-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ],
  app: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  book: ['M5 3.5h14v17H6a2.5 2.5 0 0 1 0-5h13M5 3.5v12.2M8.5 7.5h7M8.5 11h5'],
  check: ['m5 12 4.5 4.5L19 7'],
  'check-double': ['m3 12 4 4L17 6M12 16l9-9'],
  'check-rectangle': [
    'M9 3.5H6a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-7',
    'm8 10 4 4 8-10',
  ],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-left': ['m14.5 5-7 7 7 7'],
  'chevron-right': ['m9.5 5 7 7-7 7'],
  'chevron-right-double': ['m6 7 5 5-5 5m7-10 5 5-5 5'],
  'chevron-up': ['m6 15 6-6 6 6'],
  close: ['m6 6 12 12M6 18 18 6'],
  ellipsis: [
    'M5 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1M19 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1',
  ],
  delete: ['M4 6.5h16M9 6.5v-3h6v3M6 6.5l1 14h10l1-14M10 10v7M14 10v7'],
  filter: [
    'M4 7h9m4 0h3M4 17h3m4 0h9',
    'M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0M11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  ],
  home: ['m3 10 9-7 9 7M5.5 8.5V20h4v-7h5v7h4V8.5'],
  key: ['M13.5 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0', 'm12.2 10.8 8.3 8.2v2h-3v-3h-3v-3'],
  layout: [
    'M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5ZM9 4.5v15',
  ],
  'lock-on': [
    'M7.5 10V7a4.5 4.5 0 0 1 9 0v3',
    'M6 10h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 6 10ZM12 14v2',
  ],
  mobile: [
    'M7 2.5h10A1.5 1.5 0 0 1 18.5 4v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5ZM10 18.5h4M10 5h4',
  ],
  moon: ['M20.5 14.5A8.8 8.8 0 0 1 9.5 3.5a8.8 8.8 0 1 0 11 11Z'],
  notification: ['M18 8a6 6 0 0 0-12 0v5l-2 4h16l-2-4ZM9.5 20a3 3 0 0 0 5 0'],
  palette: [
    'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.4-3h2.6A2.5 2.5 0 0 0 21 12a9 9 0 0 0-9-9Z',
    'M7 10h.01M10 6.5h.01M15 7h.01M18 10.5h.01',
  ],
  pin: ['m9 3 12 12-3 1.5-4-.5-4 4-6-6 4-4-.5-4ZM3 21l4-4'],
  refresh: ['M20 10a8 8 0 0 0-13.7-4L3 9M3 4v5h5M4 14a8 8 0 0 0 13.7 4L21 15m0 5v-5h-5'],
  rollback: ['M4 5v5h5M4 10a8 8 0 1 1 1 7'],
  search: ['M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'm16 16 4.5 4.5'],
  secured: ['m12 3 8 3v5c0 4.5-3.3 8-8 10-4.7-2-8-5.5-8-10V6Z', 'm8 11.5 2.5 2.5 5.5-5'],
  setting: [
    'M4 6h3m4 0h9M4 12h9m4 0h3M4 18h3m4 0h9',
    'M11 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0M17 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0M11 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  ],
  sunny: [
    'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0',
    'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  ],
  table: [
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 9h16M4 14.5h16M10 9v11',
  ],
  time: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 6.5V12l3.5 2'],
  translate: ['M3 6h12M9 3v3m3 0c-.8 5-3.8 8-8 10M6 9c1.2 3 3.2 5 6 6m1 6 4.5-12L22 21m-7.5-4h6'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4.5 21v-2a7.5 5 0 0 1 15 0v2'],
  usergroup: [
    'M13 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
    'M3 21v-2a6.5 5 0 0 1 13 0v2M17 4.5a3.5 3.5 0 0 1 0 6.5M19 15a4.5 4.5 0 0 1 2 4v2',
  ],
  'view-column': [
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM9.3 4v16M14.7 4v16',
  ],
  'view-list': ['M5 5h14M5 12h14M5 19h14'],
};
const icon = computed(() => paths[props.name] || paths.app);
</script>

<template>
  <svg
    class="cinch-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(path, index) in icon" :key="index" :d="path" />
  </svg>
</template>
