<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MsgInboxPage from './MsgInboxPage.vue';
import MsgManagementPage from './MsgManagementPage.vue';
const route = useRoute();
const sent = computed(() => route.path === '/system/msg');
</script>
<template>
  <MsgManagementPage v-if="sent" />
  <MsgInboxPage v-else />
</template>
