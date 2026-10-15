<script setup lang="ts">
import type { Msg } from '#/api/msg';

import {
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';

import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';
import { useTimezoneStore, useUserStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Card, Drawer, Empty, Skeleton, Tag } from 'ant-design-vue';

import { msgApi, msgChanged } from '#/api/msg';
import LoadWarning from '#/components/load-warning.vue';
import MessageTypeIcon from '#/components/message-type-icon.vue';
import { $t } from '#/locales';

const emit = defineEmits<{ count: [number | undefined]; inbox: [] }>();
const user = useUserStore();
const timezone = useTimezoneStore();
const rows = ref<Msg[]>([]);
const unread = ref<number>();
const loading = ref(true);
const error = ref(false);
const busy = ref(false);
const selected = ref<Msg>();
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref(false);
let active = true;
let generation = 0;
let detailGeneration = 0;
let timer: ReturnType<typeof setInterval> | undefined;
function time(value: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
async function load() {
  if (!active || !user.userInfo?.userId) return;
  const run = ++generation;
  loading.value = true;
  error.value = false;
  try {
    const [messages, status] = await Promise.all([
      msgApi.list(false, { f: 'id,title,type,scope,sender_id,published_at,expired_at,read_at', p: 1, s: 3 }),
      msgApi.count(Number(user.userInfo.userId)),
    ]);
    if (run !== generation || !active) return;
    rows.value = messages.items;
    unread.value = status.count;
    emit('count', status.count);
  } catch {
    if (run !== generation || !active) return;
    error.value = true;
    rows.value = [];
    unread.value = undefined;
    emit('count', undefined);
  } finally {
    if (run === generation) loading.value = false;
  }
}
async function openMessage(row: Msg) {
  if (busy.value) return;
  const run = ++detailGeneration;
  selected.value = row;
  detailOpen.value = true;
  detailError.value = false;
  detailLoading.value = true;
  try {
    const record = await msgApi.get(row.id, false);
    if (run !== detailGeneration || !active) return;
    selected.value = record;
    if (!record.read_at) {
      await msgApi.read(record.id);
      msgChanged();
      if (run !== detailGeneration || !active) return;
      selected.value = { ...record, read_at: Date.now() };
    }
  } catch {
    if (run === detailGeneration && active) detailError.value = true;
  } finally {
    if (run === detailGeneration) detailLoading.value = false;
  }
}
function closeDetail() {
  ++detailGeneration;
  detailOpen.value = false;
  selected.value = undefined;
  detailLoading.value = false;
}
async function readAll() {
  if (busy.value || !unread.value) return;
  busy.value = true;
  try {
    await msgApi.readAll();
    msgChanged();
  } catch {
    /* The request client reports the failure; keep the unread state. */
  } finally {
    busy.value = false;
  }
}
function refreshVisible() {
  if (!document.hidden && active) void load();
}
function deactivate() {
  active = false;
  ++generation;
  closeDetail();
}
watch(
  () => user.userInfo?.userId,
  () => {
    ++generation;
    closeDetail();
    rows.value = [];
    unread.value = undefined;
    emit('count', undefined);
    void load();
  },
);
watch(
  () => preferences.app.locale,
  () => {
    void load();
  },
);
onMounted(() => {
  void load();
  window.addEventListener('cinch-msg-changed', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  timer = setInterval(() => {
    if (!loading.value) refreshVisible();
  }, 30_000);
});
onActivated(() => {
  if (!active) {
    active = true;
    void load();
  }
});
onDeactivated(deactivate);
onBeforeUnmount(() => {
  deactivate();
  clearInterval(timer);
  window.removeEventListener('cinch-msg-changed', refreshVisible);
  document.removeEventListener('visibilitychange', refreshVisible);
});
</script>
<template>
  <Card
    class="profile-panel"
    :body-style="{ padding: 0 }"
    data-testid="profile-messages"
    :aria-busy="loading"
  >
    <template #title>
<div class="message-heading">
        <h2>{{ $t('msg.inbox') }}</h2>
        <Tag
          v-if="unread !== undefined"
          color="blue"
          data-testid="profile-unread"
          >
{{ $t('msg.count', { count: unread }) }}
</Tag>
      </div>
</template>
    <template #extra>
<Button type="link" size="small" @click="emit('inbox')">
{{
        $t('profile-center.viewAll')
      }}
</Button>
</template>
    <div class="message-list">
      <LoadWarning v-if="error">
<template #action>
<Button size="small" @click="load">
{{
            $t('msg.retry')
          }}
</Button>
</template>
</LoadWarning>
      <Skeleton
        v-else-if="loading && !rows.length"
        active
        :paragraph="{ rows: 5 }"
      />
      <template v-else-if="rows.length">
        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="message-row"
          :data-read="Boolean(row.read_at)"
          :aria-label="row.title"
          :disabled="busy"
          data-testid="profile-message"
          @click="openMessage(row)"
        >
          <MessageTypeIcon :type="row.type" />
          <span class="message-copy"><span class="message-title">{{ row.title }}</span><span class="message-meta"><span>{{ $t(`msg.${row.type}`) }}</span><time>{{ time(row.published_at) }}</time></span></span>
          <span
            v-if="!row.read_at"
            class="unread-dot"
            :aria-label="$t('msg.unread')"
          ></span>
        </button>
      </template>
      <Empty
        v-else
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="$t('msg.empty')"
      />
    </div>
    <div v-if="unread && !error" class="message-footer">
      <Button
        type="link"
        size="small"
        :loading="busy"
        :disabled="loading"
        @click="readAll"
        >
{{ $t('msg.readAll') }}
</Button>
    </div>
  </Card>
  <Drawer
    :open="detailOpen"
    :closable="false"
    width="min(520px, 100vw)"
    destroy-on-close
    @close="closeDetail"
  >
    <section data-testid="profile-message-detail" role="dialog" aria-modal="true" :aria-label="$t('msg.detail')" :aria-busy="detailLoading">
      <header class="message-detail-heading">
        <h2>{{ $t('msg.detail') }}</h2>
        <Button type="text" :aria-label="$t('msg.close')" @click="closeDetail">
          <IconifyIcon icon="lucide:x" />
        </Button>
      </header>
      <LoadWarning v-if="detailError">
<template #action>
<Button
            v-if="selected"
            size="small"
            @click="openMessage(selected)"
            >
{{ $t('msg.retry') }}
</Button>
</template>
</LoadWarning>
      <Skeleton v-else-if="detailLoading" active :paragraph="{ rows: 5 }" />
      <article v-else-if="selected" class="message-detail">
        <Tag color="blue">{{ $t(`msg.${selected.type}`) }}</Tag>
        <h2>{{ selected.title }}</h2>
        <time>{{ time(selected.published_at) }}</time>
        <p>{{ selected.content }}</p>
        <Tag :color="selected.read_at ? 'success' : 'blue'">
{{
          $t(selected.read_at ? 'msg.read' : 'msg.unread')
        }}
</Tag>
      </article>
    </section>
  </Drawer>
</template>
<style scoped>
.message-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  margin-bottom: 24px;
  border-bottom: 1px solid hsl(var(--border));
}
.message-detail-heading h2 { margin: 0; font-size: 16px; font-weight: 600; }
.message-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.message-heading h2 {
  margin: 0;
}
.message-heading :deep(.ant-tag) {
  margin: 0;
  font-size: 12px;
}
.message-list {
  min-height: 200px;
  padding: 0 24px 8px;
}
.message-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 18px 0;
  border: 0;
  border-bottom: 1px solid hsl(var(--border));
  background: none;
  text-align: left;
  cursor: pointer;
}
.message-row:last-child {
  border-bottom: 0;
}
.message-row:hover .message-title {
  color: hsl(var(--primary));
}
.message-row:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 3px;
  border-radius: calc(var(--radius) * 0.5);
}
.message-row:disabled {
  cursor: wait;
  opacity: 0.6;
}
.message-copy {
  flex: 1;
  min-width: 0;
}
.message-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: hsl(var(--foreground));
  font-size: 14px;
  font-weight: 500;
}
.message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  margin-top: 7px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.message-meta time {
  font-variant-numeric: tabular-nums;
}
.unread-dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 8px;
  border-radius: 50%;
  background: hsl(var(--primary));
}
.message-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 24px;
  border-top: 1px solid hsl(var(--border));
}
.message-detail h2 {
  margin: 18px 0 10px;
  font-size: 21px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.message-detail time {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.message-detail p {
  padding-top: 24px;
  margin: 24px 0;
  border-top: 1px solid hsl(var(--border));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
@media (max-width: 760px) {
  .message-list {
    padding-inline: 18px;
  }
  .message-row {
    gap: 10px;
  }
}
</style>
