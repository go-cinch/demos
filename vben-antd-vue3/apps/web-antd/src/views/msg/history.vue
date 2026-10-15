<script setup lang="ts">
import { onDeactivated } from 'vue';

import { Drawer } from 'ant-design-vue';

import InboxFeed from './inbox-feed.vue';

const open = defineModel<boolean>('open', { default: false });
onDeactivated(() => { open.value = false; });
</script>
<template>
  <Drawer
    v-model:open="open"
    placement="right"
    width="min(600px, 100vw)"
    :closable="false"
    :body-style="{ padding: 0, overflow: 'hidden' }"
    destroy-on-close
    root-class-name="message-history-drawer"
  >
    <InboxFeed v-if="open" @close="open = false" />
  </Drawer>
</template>
