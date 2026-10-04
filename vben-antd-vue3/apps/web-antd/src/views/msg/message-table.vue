<script setup lang="ts">
import type { Msg, MsgInput, MsgUser } from '#/api/msg';

import {
  computed,
  h,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { formatDateTime, getCurrentTimezone } from '@vben/utils';

import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { msgApi, msgChanged } from '#/api/msg';
import { $t } from '#/locales';

import ManagementCard from '../system/components/management-card.vue';
import ManagementForm from '../system/components/management-form.vue';
import ManagementSearch from '../system/components/management-search.vue';
import ManagementToolbar from '../system/components/management-toolbar.vue';
const props = withDefaults(defineProps<{ sent?: boolean; embedded?: boolean }>(), {
  sent: false,
  embedded: false,
});
const emit = defineEmits<{ close: [] }>();
const active = ref(true);
const sent = computed(() => props.sent);
const { hasAccessByCodes } = useAccess();
const canRead = computed(() => !sent.value || hasAccessByCodes(['system.msg.read']));
const canSend = computed(() => sent.value && hasAccessByCodes(['system.msg.send']));
const canDelete = computed(() => !sent.value || hasAccessByCodes(['system.msg.delete']));
const checkedKeys = ref<number[]>([]);
const checkedVisible = computed(() =>
  checkedKeys.value.filter((id) => rows.value.some((row) => row.id === id)),
);
const rowSelection = computed(() => ({
  selectedRowKeys: checkedVisible.value,
  onChange: (keys: (number | string)[]) => {
    checkedKeys.value = keys.map(Number);
  },
  getCheckboxProps: (row: Msg) => ({
    disabled: loading.value,
    'aria-label': `${$t('msg.select')} ${row.title}`,
  }),
  columnTitle: h(Checkbox, {
    checked: rows.value.length > 0 && checkedVisible.value.length === rows.value.length,
    indeterminate:
      checkedVisible.value.length > 0 && checkedVisible.value.length < rows.value.length,
    disabled: loading.value || !rows.value.length,
    'aria-label': $t('msg.selectAll'),
    onChange: (event: { target: { checked: boolean } }) => {
      checkedKeys.value = event.target.checked ? rows.value.map((row) => row.id) : [];
    },
  }),
}));
const page = ref(1);
const rows = ref<Msg[]>([]);
const size = ref(10);
const total = ref(0);
const busy = ref(false);
const error = ref(false);
const loading = ref(false);
const status = ref('');
const type = ref('');
const detailLoading = ref(false);
const detailOpen = ref(false);
const selected = ref<Msg>();
const attempted = ref(false);
const compose = ref(false);
const sendError = ref('');
const form = ref<MsgInput>({
  title: '',
  content: '',
  type: 'notice',
  scope: 'all',
  recipient_ids: [],
  expired_at: null,
});
const userLoading = ref(false);
const users = ref<MsgUser[]>([]);
const density = ref<'large' | 'middle' | 'small'>('middle');
const bordered = ref(true);
const striped = ref(true);
const sticky = ref(true);
const visible = ref(['type', 'scope', 'published_at']);
const isFullscreen = ref(false);
let detailGeneration = 0;
let generation = 0;
let userGeneration = 0;
let userTimer: ReturnType<typeof setTimeout> | undefined;
let sendKey = '';
let lastPayload = '';
const fields = computed(() => [
  { title: $t('msg.title'), key: 'title', dataIndex: 'title', width: 320 },
  ...['type', 'scope', 'published_at']
    .filter((k) => visible.value.includes(k))
    .map((k) => ({
      title: $t(`msg.${k === 'published_at' ? 'published' : k}`),
      key: k,
      dataIndex: k,
      width: k === 'published_at' ? 190 : 130,
    })),
  ...(!sent.value ? [{ title: $t('msg.read'), key: 'read_at', width: 100 }] : []),
  {
    title: $t('msg.actions'),
    key: 'actions',
    width: 220,
    fixed: 'right' as const,
  },
]);
const issues = computed(() => ({
  title:
    !form.value.title.trim() || [...form.value.title.trim()].length > 200
      ? $t('msg.titleError')
      : '',
  content:
    !form.value.content.trim() || [...form.value.content.trim()].length > 20000
      ? $t('msg.contentError')
      : '',
  recipients:
    form.value.scope === 'targeted' &&
    (!form.value.recipient_ids?.length || form.value.recipient_ids.length > 1000)
      ? $t('msg.recipientError')
      : '',
  expiry:
    form.value.expired_at !== null &&
    (!Number.isFinite(form.value.expired_at) || form.value.expired_at <= Date.now())
      ? $t('msg.expiryError')
      : '',
}));
async function load() {
  if (!active.value) return;
  const current = ++generation;
  if (!canRead.value) {
    rows.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  error.value = false;
  try {
    const result = await msgApi.list(sent.value, {
      p: page.value,
      s: size.value,
      ...(type.value ? { type: type.value } : {}),
      ...(!sent.value && status.value ? { read: status.value === 'read' } : {}),
    });
    if (current !== generation) return;
    if (!result.items.length && page.value > 1 && result.t <= (page.value - 1) * size.value) {
      page.value--;
      return;
    }
    rows.value = result.items;
    total.value = result.t;
  } catch {
    if (current === generation) {
      error.value = true;
      rows.value = [];
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function openDetail(row: Msg) {
  const current = ++detailGeneration;
  selected.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const value = await msgApi.get(row.id, sent.value);
    if (current !== detailGeneration || !detailOpen.value) return;
    selected.value = value;
    if (!sent.value && !value.read_at) {
      await msgApi.read(value.id);
      value.read_at = Date.now();
      msgChanged();
      await load();
    }
  } catch {
    if (current === detailGeneration) detailOpen.value = false;
  } finally {
    if (current === detailGeneration) detailLoading.value = false;
  }
}
async function mark(row: Msg) {
  busy.value = true;
  try {
    await msgApi.read(row.id);
    msgChanged();
    await load();
  } finally {
    busy.value = false;
  }
}
function requestBulk(read = false) {
  if (
    busy.value ||
    loading.value ||
    !checkedVisible.value.length ||
    (read ? sent.value : !canDelete.value)
  )
    return;
  const management = sent.value;
  const remaining = [...checkedVisible.value];
  Modal.confirm({
    title: $t(
      read
        ? 'msg.readSelectedConfirm'
        : management
          ? 'msg.deleteSelectedGlobalConfirm'
          : 'msg.deleteSelectedConfirm',
    ),
    okText: $t('msg.confirm'),
    cancelText: $t('msg.cancel'),
    okButtonProps: { danger: !read },
    async onOk() {
      busy.value = true;
      try {
        for (const id of [...remaining]) {
          if (read) await msgApi.read(id);
          else await msgApi.remove(id, management);
          remaining.splice(remaining.indexOf(id), 1);
          checkedKeys.value = checkedKeys.value.filter((value) => value !== id);
        }
      } catch (e) {
        message.error((e as Error).message);
        throw e;
      } finally {
        msgChanged();
        await load();
        busy.value = false;
      }
    },
  });
}
function remove(row: Msg) {
  const management = sent.value;
  Modal.confirm({
    title: $t(management ? 'msg.deleteGlobalConfirm' : 'msg.deleteConfirm'),
    okText: $t('msg.confirm'),
    cancelText: $t('msg.cancel'),
    okButtonProps: { danger: true },
    async onOk() {
      await msgApi.remove(row.id, management);
      detailOpen.value = false;
      msgChanged();
      await load();
    },
  });
}
async function readAll() {
  if (busy.value || sent.value) return;
  busy.value = true;
  try {
    await msgApi.readAll();
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    msgChanged();
    await load();
    busy.value = false;
  }
}

function searchUsers(q: string) {
  clearTimeout(userTimer);
  const current = ++userGeneration;
  userTimer = setTimeout(async () => {
    userLoading.value = true;
    try {
      const result = await msgApi.users(q);
      if (current === userGeneration) users.value = result;
    } catch {
      if (current === userGeneration) users.value = [];
    } finally {
      if (current === userGeneration) userLoading.value = false;
    }
  }, 250);
}
function newMessage() {
  form.value = {
    title: '',
    content: '',
    type: 'notice',
    scope: 'all',
    recipient_ids: [],
    expired_at: null,
  };
  attempted.value = false;
  sendError.value = '';
  sendKey = crypto.randomUUID();
  lastPayload = '';
  compose.value = true;
  void searchUsers('');
}
async function send() {
  attempted.value = true;
  if (Object.values(issues.value).some(Boolean)) return;
  busy.value = true;
  sendError.value = '';
  try {
    const payload = {
      ...form.value,
      recipient_ids: form.value.scope === 'targeted' ? form.value.recipient_ids : [],
    };
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload) {
      sendKey = crypto.randomUUID();
      lastPayload = serialized;
    }
    await msgApi.send(payload, sendKey);
    compose.value = false;
    message.success($t('msg.sent'));
    msgChanged();
    if (page.value !== 1) page.value = 1;
    else await load();
  } catch (e) {
    sendError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function closeCompose(): Promise<boolean> {
  if (busy.value) return Promise.resolve(false);
  if (
    !compose.value ||
    (!form.value.title && !form.value.content && !form.value.recipient_ids?.length)
  ) {
    compose.value = false;
    return Promise.resolve(true);
  }
  return new Promise((resolve) =>
    Modal.confirm({
      title: $t('msg.unsaved'),
      okText: $t('msg.confirm'),
      cancelText: $t('msg.cancel'),
      onOk() {
        compose.value = false;
        resolve(true);
      },
      onCancel() {
        resolve(false);
      },
    }),
  );
}
function fullscreen() {
  isFullscreen.value = !isFullscreen.value;
}
function search() {
  if (page.value === 1) void load();
  else page.value = 1;
}
function resetSearch() {
  status.value = '';
  type.value = '';
  search();
}
defineExpose({ closeCompose });
watch([sent, status, type, size], () => {
  page.value = 1;
  detailOpen.value = false;
  void load();
});
watch([sent, page, size, status, type], () => {
  checkedKeys.value = [];
});
watch(page, load);
watch(canRead, load, { immediate: true });
let timer: ReturnType<typeof setInterval>;
function refreshVisible() {
  if (active.value && !document.hidden && !busy.value) void load();
}
onMounted(() => {
  timer = setInterval(refreshVisible, 30000);
  window.addEventListener('cinch-msg-changed', refreshVisible);
});
onActivated(() => {
  active.value = true;
  void load();
});
onDeactivated(() => {
  active.value = false;
  generation++;
  loading.value = false;
});
onBeforeUnmount(() => {
  active.value = false;
  clearInterval(timer);
  window.removeEventListener('cinch-msg-changed', refreshVisible);
  generation++;
  userGeneration++;
  detailGeneration++;
  clearTimeout(userTimer);
});
</script>
<template>
  <div class="msg-region flex h-full flex-col gap-4" :class="{ 'msg-fullscreen': isFullscreen }">
    <ManagementCard class="shrink-0">
      <ManagementSearch @finish="search">
        <FormItem v-if="!sent" :label="$t('msg.read')" class="w-full sm:w-auto">
          <Select
            v-model:value="status"
            :aria-label="$t('msg.read')"
            class="system-filter-control"
            style="--filter-width: 280px"
            :options="[
              { value: '', label: $t('msg.allStatus') },
              { value: 'unread', label: $t('msg.unread') },
              { value: 'read', label: $t('msg.read') },
            ]"
          />
        </FormItem>
        <FormItem :label="$t('msg.type')" class="w-full sm:w-auto">
          <Select
            v-model:value="type"
            :aria-label="$t('msg.type')"
            class="system-filter-control"
            style="--filter-width: 280px"
            :options="[
              { value: '', label: $t('msg.allTypes') },
              { value: 'system', label: $t('msg.system') },
              { value: 'notice', label: $t('msg.notice') },
            ]"
          />
        </FormItem>
        <template #actions>
          <Button @click="resetSearch">{{ $t('system.common.reset') }}</Button>
          <Button html-type="submit" type="primary">
            {{ $t('system.common.search') }}
          </Button>
        </template>
      </ManagementSearch>
    </ManagementCard>
    <ManagementCard class="min-h-0 flex-1">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Space wrap>
          <Button v-if="canSend" type="primary" @click="newMessage">
            <IconifyIcon icon="lucide:plus" />{{ $t('msg.send') }}
          </Button>
          <Button v-if="!sent" :disabled="loading || busy" @click="readAll">
            {{ $t('msg.readAll') }}
          </Button>
          <template v-if="canRead && checkedVisible.length">
            <Button
              data-testid="message-bulk-delete"
              v-if="canDelete"
              danger
              :disabled="busy || loading"
              @click="requestBulk()"
              >{{ $t('msg.deleteSelected') }}</Button
            >
            <Button
              data-testid="message-bulk-read"
              v-if="!sent"
              :disabled="busy || loading"
              @click="requestBulk(true)"
              >{{ $t('msg.markRead') }}</Button
            >
          </template></Space
        >
        <ManagementToolbar
          v-model:size="density"
          v-model:bordered="bordered"
          v-model:striped="striped"
          v-model:sticky="sticky"
          :loading="loading"
          :can-read="canRead"
          :is-fullscreen="embedded || isFullscreen"
          @refresh="load"
          @fullscreen="embedded ? emit('close') : fullscreen()"
        >
          <template #columns>
            <Checkbox.Group
              v-model:value="visible"
              class="flex flex-col gap-2"
              :options="
                ['type', 'scope', 'published_at'].map((value) => ({
                  value,
                  label: $t(`msg.${value === 'published_at' ? 'published' : value}`),
                }))
              "
            />
          </template>
        </ManagementToolbar>
      </div>
      <Alert v-if="!canRead" :message="$t('msg.noPermission')" type="info" />
      <Alert v-else-if="error" :message="$t('msg.error')" type="error" show-icon>
        <template #action>
          <Button @click="load">{{ $t('msg.retry') }}</Button>
        </template>
      </Alert>

      <Table
        v-if="canRead && !error"
        row-key="id"
        :data-source="rows"
        :row-selection="rowSelection"
        :columns="fields"
        :loading="loading"
        :size="density"
        :bordered="bordered"
        :sticky="sticky"
        :row-class-name="
          (_record: Msg, index: number) =>
            striped && index % 2 === 1 ? 'system-table-row-striped' : ''
        "
        :scroll="{ x: 900 }"
        :pagination="{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => $t('system.table.total', { count }),
        }"
        @change="
          (p) => {
            size = p.pageSize ?? 10;
            page = p.current ?? 1;
          }
        "
      >
        <template #emptyText><Empty :description="$t('msg.empty')" /></template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <Button size="small" type="link" class="msg-title" @click="openDetail(record as Msg)">
              {{ record.title }} </Button
            ><Tag v-if="record.expired_at && record.expired_at <= Date.now()">
              {{ $t('msg.expired') }}
            </Tag>
          </template>
          <Tag v-else-if="column.key === 'type'" color="blue">
            {{ $t(`msg.${record.type}`) }}
          </Tag>
          <Tag v-else-if="column.key === 'scope'" color="purple">
            {{ $t(`msg.${record.scope}`) }}
          </Tag>
          <Tag v-else-if="column.key === 'read_at'" :color="record.read_at ? 'default' : 'blue'">
            {{ $t(record.read_at ? 'msg.read' : 'msg.unread') }}
          </Tag>
          <template v-else-if="column.key === 'published_at'">
            {{ formatDateTime(record.published_at) }}
          </template>
          <Space v-else-if="column.key === 'actions'" wrap>
            <Button size="small" type="link" @click="openDetail(record as Msg)">
              {{ $t('msg.view') }} </Button
            ><Button
              v-if="!sent && !record.read_at"
              size="small"
              type="link"
              :disabled="busy"
              @click="mark(record as Msg)"
            >
              {{ $t('msg.markRead') }} </Button
            ><Button
              v-if="canDelete"
              size="small"
              danger
              type="link"
              @click="remove(record as Msg)"
            >
              {{ $t(sent ? 'msg.deleteGlobal' : 'msg.delete') }}
            </Button>
          </Space>
        </template>
      </Table>
    </ManagementCard>
  </div>
  <Modal v-model:open="detailOpen" :title="$t('msg.detail')" :width="560" :footer="null">
    <Spin v-if="detailLoading" /><template v-else-if="selected">
      <h2 class="mb-3 text-xl font-semibold">{{ selected.title }}</h2>
      <p>{{ formatDateTime(selected.published_at) }}</p>
      <p class="msg-content my-5">{{ selected.content }}</p>
      <p>
        {{ $t('msg.expiry') }}:
        {{ selected.expired_at ? formatDateTime(selected.expired_at) : $t('msg.noExpiry') }}
      </p>
      <p v-if="sent && selected.recipient_ids">
        {{ $t('msg.recipientIDs') }}: {{ selected.recipient_ids.join(', ') }}
      </p>
      <Button v-if="canDelete" danger class="mt-5" @click="remove(selected)">
        {{ $t(sent ? 'msg.deleteGlobal' : 'msg.delete') }}
      </Button>
    </template>
  </Modal>
  <Modal
    :open="compose"
    width="680px"
    :title="$t('msg.send')"
    :confirm-loading="busy"
    :ok-text="$t('msg.send')"
    :cancel-text="$t('msg.cancel')"
    :mask-closable="false"
    @ok="send"
    @cancel="closeCompose"
  >
    <ManagementForm :disabled="busy">
      <FormItem
        :label="$t('msg.title')"
        :validate-status="attempted && issues.title ? 'error' : ''"
        :help="attempted ? issues.title : ''"
      >
        <Input v-model:value="form.title" :aria-label="$t('msg.title')" />
      </FormItem>
      <FormItem
        :label="$t('msg.content')"
        :validate-status="attempted && issues.content ? 'error' : ''"
        :help="attempted ? issues.content : ''"
      >
        <Input.TextArea v-model:value="form.content" :aria-label="$t('msg.content')" :rows="5" />
      </FormItem>
      <FormItem html-for="msg-type" :label="$t('msg.type')">
        <Select
          id="msg-type"
          v-model:value="form.type"
          :aria-label="$t('msg.type')"
          :options="
            ['system', 'notice'].map((value) => ({
              value,
              label: $t(`msg.${value}`),
            }))
          "
        />
      </FormItem>
      <FormItem html-for="msg-scope" :label="$t('msg.scope')">
        <Select
          id="msg-scope"
          v-model:value="form.scope"
          :aria-label="$t('msg.scope')"
          :options="
            ['all', 'targeted'].map((value) => ({
              value,
              label: $t(`msg.${value}`),
            }))
          "
        />
      </FormItem>
      <FormItem
        v-if="form.scope === 'targeted'"
        html-for="msg-recipients"
        :label="$t('msg.recipients')"
        :validate-status="attempted && issues.recipients ? 'error' : ''"
        :help="attempted ? issues.recipients : ''"
      >
        <Select
          id="msg-recipients"
          v-model:value="form.recipient_ids"
          mode="multiple"
          show-search
          :aria-label="$t('msg.recipients')"
          :filter-option="false"
          :loading="userLoading"
          :options="users.map((u) => ({ value: u.id, label: u.username }))"
          @search="searchUsers"
        />
      </FormItem>
      <FormItem
        :label="$t('msg.expiry')"
        :validate-status="attempted && issues.expiry ? 'error' : ''"
        :help="attempted ? issues.expiry : ''"
      >
        <DatePicker
          :value="form.expired_at ? dayjs(formatDateTime(form.expired_at)) : undefined"
          show-time
          :placeholder="$t('msg.noExpiry')"
          @change="
            (v) =>
              (form.expired_at = v
                ? dayjs.tz(dayjs(v).format('YYYY-MM-DD HH:mm:ss'), getCurrentTimezone()).valueOf()
                : null)
          "
        />
      </FormItem>
      <Alert v-if="sendError" type="error" :message="sendError" />
    </ManagementForm>
  </Modal>
</template>
<style scoped>
.msg-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 900;
  padding: 24px;
  overflow: auto;
  background: hsl(var(--background));
}
.msg-title {
  height: auto;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
  padding-left: 0;
}
.msg-content {
  max-height: 384px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
:deep(.system-table-row-striped > td) {
  background: hsl(var(--muted));
}
</style>
