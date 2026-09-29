<script setup lang="ts">
import { preferences as p } from '../lib/preferences';
function safeLink(value: string) {
  return /^https?:\/\//i.test(value) ? value : undefined;
}
</script>
<template>
  <footer v-if="p.copyright" class="copyright">
    Copyright © {{ p.copyrightDate || new Date().getFullYear() }}
    <a :href="safeLink(p.companyLink)" target="_blank" rel="noopener noreferrer">{{ p.company }}</a
    ><a v-if="p.icp" :href="safeLink(p.icpLink)" target="_blank" rel="noopener noreferrer">{{
      p.icp
    }}</a>
  </footer>
</template>
