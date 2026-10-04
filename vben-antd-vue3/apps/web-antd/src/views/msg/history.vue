<script setup lang="ts">
import { Modal } from 'ant-design-vue';

import { $t } from '#/locales';

import MessageTable from './message-table.vue';
const open = defineModel<boolean>('open', { default: false });
</script>
<template>
  <Modal
    v-model:open="open"
    :title="$t('msg.history')"
    :footer="null"
    width="100vw"
    wrap-class-name="msg-history-fullscreen"
    :mask-closable="false"
    :destroy-on-close="true"
  >
    <MessageTable v-if="open" embedded @close="open = false" />
  </Modal>
</template>
<style>
.msg-history-fullscreen .ant-modal {
  top: 0;
  width: 100vw;
  max-width: 100vw;
  margin: 0;
  padding-bottom: 0;
}
.msg-history-fullscreen .ant-modal-content {
  display: flex;
  height: 100dvh;
  flex-direction: column;
  border-radius: 0;
}
.msg-history-fullscreen .ant-modal-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
