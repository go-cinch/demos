<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import MessageHistory from './history.vue';
const router = useRouter();
const open = ref(true);
watch(open, (value) => {
  if (!value) void router.replace('/dashboard/overview');
});
</script>
<template><MessageHistory v-model:open="open" /></template>
