<script setup lang="ts">
import { ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { Page } from '@vben/common-ui';

import MessageTable from './message-table.vue';
const table = ref<InstanceType<typeof MessageTable>>();
onBeforeRouteLeave(
  (to) => to.path.startsWith('/auth/') || table.value?.closeCompose(),
);
</script>
<template>
  <Page auto-content-height><MessageTable ref="table" sent /></Page>
</template>
