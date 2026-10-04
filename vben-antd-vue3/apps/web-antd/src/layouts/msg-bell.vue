<script setup lang="ts">
import type { Msg } from '#/api/msg';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { VbenIconButton } from '@vben/common-ui';
import { CircleCheckBig, CircleX } from '@vben/icons';
import { Notification } from '@vben/layouts';
import { useUserStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Modal, Spin } from 'ant-design-vue';

import { msgApi, msgChanged } from '#/api/msg';
import { $t } from '#/locales';
import MessageHistory from '#/views/msg/history.vue';

const userStore = useUserStore();
const historyOpen = ref(false);
const popup = ref<InstanceType<typeof Notification>>();
const count = ref<null | number>(null);
const rows = ref<Msg[]>([]);
const open = ref(false);
const loading = ref(false);
const error = ref(false);
const busy = ref(false);
const selected = ref<Msg>();
const detailOpen = ref(false);
const detailLoading = ref(false);
let generation = 0;
let detailGeneration = 0;
let disposed = false;
let timer: ReturnType<typeof setInterval>;

const notifications = computed(() =>
  rows.value.map((item) => ({
    id: item.id,
    avatar: '',
    avatarName: userStore.userInfo?.username || '',
    date: formatDateTime(item.published_at),
    isRead: item.read_at !== null,
    message: item.content,
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
      .count()
      .then((result) => {
        if (current === generation) count.value = result.count;
      })
      .catch(() => {
        if (current === generation) count.value = null;
      }),
    ...(loadList
      ? [
          msgApi
            .list(false, { p: 1, s: 10 })
            .then((result) => {
              if (current === generation) {
                rows.value = result.items.slice(0, 10);
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
  if (value) void refresh();
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
async function openDetail(id: number | string) {
  if (busy.value || loading.value) return;
  const current = ++detailGeneration;
  popup.value?.close();
  selected.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const item = await msgApi.get(Number(id), false);
    if (disposed || current !== detailGeneration || !detailOpen.value) return;
    selected.value = item;
    if (item.read_at === null) await mutate(() => msgApi.read(item.id));
  } catch {
    if (current === detailGeneration) detailOpen.value = false;
  } finally {
    if (current === detailGeneration) detailLoading.value = false;
  }
}
watch(detailOpen, (value) => {
  if (!value) detailGeneration++;
});
onMounted(() => {
  void refresh();
  timer = setInterval(refresh, 30000);
  window.addEventListener('cinch-msg-changed', refresh);
  document.addEventListener('visibilitychange', refresh);
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  detailGeneration++;
  clearInterval(timer);
  window.removeEventListener('cinch-msg-changed', refresh);
  document.removeEventListener('visibilitychange', refresh);
});
</script>

<template>
  <Notification
    ref="popup"
    :dot="(count ?? 0) > 0"
    :notifications="notifications"
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
    @on-click="(item) => openDetail(item.id)"
    @view-all="historyOpen = true"
  >
    <template #empty>
      <div v-if="loading" class="flex items-center gap-2" role="status">
        <Spin size="small" />{{ $t('msg.loading') }}
      </div>
      <div v-else-if="error" class="flex flex-col items-center gap-2" role="alert">
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
  <MessageHistory v-model:open="historyOpen" />
  <Modal v-model:open="detailOpen" :title="$t('msg.detail')" :width="560" :footer="null">
    <div v-if="detailLoading" class="flex min-h-32 items-center justify-center" role="status">
      <Spin :tip="$t('msg.loading')" />
    </div>
    <template v-else-if="selected">
      <h3 class="mb-2 text-base font-semibold break-words">
        {{ selected.title }}
      </h3>
      <p class="mb-4 text-xs text-muted-foreground">
        {{ formatDateTime(selected.published_at) }}
      </p>
      <p class="max-h-96 overflow-auto whitespace-pre-wrap break-words">
        {{ selected.content }}
      </p>
    </template>
    <div class="mt-4 flex justify-end">
      <Button @click="detailOpen = false">{{ $t('msg.close') }}</Button>
    </div>
  </Modal>
</template>
