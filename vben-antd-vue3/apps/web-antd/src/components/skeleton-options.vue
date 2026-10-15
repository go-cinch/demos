<script setup lang="ts">
import { vSkeleton } from '#/directives/skeleton';

defineProps<{ loading: boolean }>();
</script>

<template>
  <div class="skeleton-options" :aria-busy="loading">
    <div v-if="loading" v-skeleton="true" aria-hidden="true">
      <p v-for="index in 6" :key="index">────────────────</p>
    </div>
    <slot v-else></slot>
  </div>
</template>

<style scoped>
/* Reserve space only for the loading skeleton; the Select menu sizes and
   scrolls its own options once results or search history are available. */
.skeleton-options[aria-busy='true'] {
  height: 224px;
  overflow: auto;
  scrollbar-gutter: stable;
}

.skeleton-options p {
  height: 28px;
  margin: 6px 12px;
}
</style>
