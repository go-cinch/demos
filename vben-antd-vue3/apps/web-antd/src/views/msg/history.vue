<script setup lang="ts">
import { onDeactivated } from 'vue';

import { Drawer } from 'ant-design-vue';

import InboxFeed from './inbox-feed.vue';

defineProps<{ messageTitle?: string }>();
const messageId = defineModel<number>('messageId');
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
    <InboxFeed v-if="open" v-model:message-id="messageId" :message-title="messageTitle" @close="open = false" />
  </Drawer>
</template>
