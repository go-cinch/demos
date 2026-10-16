<script setup lang="ts">
import type { MsgFeedPreview } from '#/api/msg';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { VbenIconButton } from '@vben/common-ui';
import { CircleCheckBig, CircleX } from '@vben/icons';
import { Notification } from '@vben/layouts';
import { useUserStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Modal } from 'ant-design-vue';

import { messageAttention, visitMessages } from '#/api/message-attention';
import { msgApi, msgChanged, msgPreviewFields } from '#/api/msg';
import MessageTypeIcon from '#/components/message-type-icon.vue';
import { $t } from '#/locales';
import MessageHistory from '#/views/msg/history.vue';

const userStore = useUserStore();
const historyOpen = ref(false);
const historyMessageId = ref<number>();
const historyMessageTitle = ref('');
const popup = ref<InstanceType<typeof Notification>>();
const count = ref<null | number>(null);
const rows = ref<MsgFeedPreview[]>([]);
const open = ref(false);
const loading = ref(false);
const error = ref(false);
const busy = ref(false);
let generation = 0;
let disposed = false;
function syncSeen() { count.value = messageAttention.count(Number(userStore.userInfo?.userId)); }
let timer: ReturnType<typeof setInterval>;

const notifications = computed(() =>
  (loading.value && !rows.value.length ? Array.from({ length: 4 }, (_, index) => ({ id: -index - 1, published_at: 0, read_at: null, summary: '────────────────', title: '────────', type: 'system' })) : rows.value).map((item) => ({
    id: item.id,
    avatar: '',
    type: item.type,
    date: formatDateTime(item.published_at),
    isRead: item.read_at !== null,
    message: item.summary ?? '',
    title: item.title,
  })),
);

async function refresh() {
  if (disposed || document.hidden || busy.value) return;
  const current = ++generation;
  const loadList = open.value;
  if (loadList) loading.value = true;
  await Promise.all([
    msgApi
      .count(Number(userStore.userInfo?.userId))
      .then((result) => {
        if (current === generation) { messageAttention.update(result); count.value = messageAttention.count(Number(userStore.userInfo?.userId)); };
      })
      .catch(() => {
        if (current === generation) count.value = null;
      }),
    ...(loadList
      ? [
          msgApi
            .list(false, { f: msgPreviewFields, p: 1, s: 5 })
            .then((result) => {
              if (current === generation) {
                rows.value = result.items.slice(0, 5);
                error.value = false;
              }
            })
            .catch(() => {
              if (current === generation) {
                rows.value = [];
                error.value = true;
              }
            }),
        ]
      : []),
  ]);
  if (current === generation) loading.value = false;
}
function onOpenChange(value: boolean) {
  open.value = value;
  if (value) { visitMessages(Number(userStore.userInfo?.userId)); void refresh(); }
}
async function mutate(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  generation++;
  try {
    await action();
    msgChanged();
  } finally {
    busy.value = false;
    await refresh();
  }
}
async function markRead(id: number | string) {
  try {
    await mutate(() => msgApi.read(Number(id)));
  } catch {
    // The shared request client presents the localized API error.
  }
}
async function readAll() {
  try {
    await mutate(() => msgApi.readAll());
  } catch {
    /* The request client presents API errors. */
  }
}
function confirmRemove(ids: number[], clear = false) {
  Modal.confirm({
    title: clear ? $t('msg.clearPreviewConfirm', { count: ids.length }) : $t('msg.deleteConfirm'),
    okText: $t('msg.confirm'),
    cancelText: $t('msg.cancel'),
    okButtonProps: { danger: true },
    onOk: () =>
      mutate(async () => {
        for (const id of ids) await msgApi.remove(id, false);
      }),
  });
}
function openHistory(id?: number | string) {
  if (busy.value || loading.value) return;
  popup.value?.close();
  historyMessageId.value = id === undefined ? undefined : Number(id);
  historyMessageTitle.value = rows.value.find((row) => row.id === historyMessageId.value)?.title ?? '';
  historyOpen.value = true;
}
onMounted(() => {
  void refresh();
  timer = setInterval(refresh, 30000);
  window.addEventListener('cinch-msg-seen', syncSeen);
  window.addEventListener('storage', syncSeen);
  window.addEventListener('cinch-msg-changed', refresh);
  document.addEventListener('visibilitychange', refresh);
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  clearInterval(timer);
  window.removeEventListener('cinch-msg-seen', syncSeen);
  window.removeEventListener('storage', syncSeen);
  window.removeEventListener('cinch-msg-changed', refresh);
  document.removeEventListener('visibilitychange', refresh);
});
</script>

<template>
  <Notification
    ref="popup"
    :dot="(count ?? 0) > 0"
    :notifications="notifications"
    :loading="loading"
    :disabled="busy || loading || error"
    :trigger-label="$t('msg.inbox')"
    @open-change="onOpenChange"
    @make-all="readAll"
    @clear="
      confirmRemove(
        rows.map((item) => item.id),
        true,
      )
    "
    @on-click="(item) => openHistory(item.id)"
    @view-all="openHistory()"
  >
    <template #avatar="{ item }">
      <MessageTypeIcon :type="item.type" />
    </template>
    <template #empty>
      <div v-if="error" class="flex flex-col items-center gap-2" role="alert">
        <span>{{ $t('msg.error') }}</span>
        <Button type="link" @click="refresh">{{ $t('msg.retry') }}</Button>
      </div>
      <span v-else>{{ $t('msg.empty') }}</span>
    </template>
    <template #action="{ item }">
      <VbenIconButton
        size="xs"
        variant="ghost"
        class="h-6 w-6 p-0"
        :class="{ 'text-destructive': item.isRead }"
        :disabled="busy || loading"
        :tooltip="$t(item.isRead ? 'msg.delete' : 'msg.markRead')"
        :aria-label="$t(item.isRead ? 'msg.delete' : 'msg.markRead')"
        @click.stop="item.isRead ? confirmRemove([Number(item.id)]) : markRead(item.id)"
      >
        <span class="sr-only">{{ $t(item.isRead ? 'msg.delete' : 'msg.markRead') }}</span>
        <CircleX v-if="item.isRead" class="size-4" />
        <CircleCheckBig v-else class="size-4" />
      </VbenIconButton>
    </template>
  </Notification>
  <MessageHistory v-model:open="historyOpen" v-model:message-id="historyMessageId" :message-title="historyMessageTitle" />
</template>
