<script setup lang="ts">
import type { MsgPreview, MsgInput, MsgSentSummary } from '#/api/msg';

import {
  computed,
  h,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useTimezoneStore, useUserStore } from '@vben/stores';
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
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { visitMessages } from '#/api/message-attention';
import { msgApi, msgChanged } from '#/api/msg';
import LoadWarning from '#/components/load-warning.vue';
import Table from '#/components/skeleton-table.vue';
import { vSkeleton } from '#/directives/skeleton';
import { useDefaultPageSize } from '#/composables/use-default-page-size';
import SearchAutocomplete from '#/components/search-autocomplete.vue';
import { searchSuggestionGroups } from '#/components/search-suggestions';
import { $t } from '#/locales';

import AssociationEditor from '../system/components/association-editor.vue';
import ManagementCard from '../system/components/management-card.vue';
import ManagementDrawer from '../system/components/management-drawer.vue';
import ManagementForm from '../system/components/management-form.vue';
import ManagementSearch from '../system/components/management-search.vue';
import ManagementToolbar from '../system/components/management-toolbar.vue';
import ManagementViewSwitch from '../system/components/management-view-switch.vue';
import MessageRecordBody from './message-record-body.vue';
import SentSummary from './sent-summary.vue';
import SentWorkspace from './sent-workspace.vue';
const props = withDefaults(defineProps<{ sent?: boolean; embedded?: boolean }>(), {
  sent: false,
  embedded: false,
});
const emit = defineEmits<{ close: [] }>();
const attentionUser = useUserStore();
const timezone = useTimezoneStore();
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
  getCheckboxProps: (row: MsgPreview) => ({
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
const rows = ref<MsgPreview[]>([]);
const defaultPageSize = useDefaultPageSize();
const size = ref(defaultPageSize.value);
const total = ref(0);
const busy = ref(false);
const error = ref(false);
const loading = ref(false);
const status = ref('');
const type = ref('');
const scope = ref('');
const queryDraft = ref('');
const query = ref('');
const sentView = ref<'split' | 'table'>('split');
const sentViewOptions = computed(() => [
  { value: 'split', label: $t('msg.splitView'), icon: 'lucide:panel-left' },
  { value: 'table', label: $t('msg.tableView'), icon: 'lucide:table-2' },
]);
const summary = ref<MsgSentSummary>();
const summaryLoading = ref(false);
const summaryError = ref(false);
const selectedId = ref<number>();
const detailError = ref(false);
const suggestionsLoading = ref(false);
const suggestionTitles = ref<string[]>([]);
const queryHistory = ref<string[]>([]);
const suggestionOptions = computed(() => searchSuggestionGroups(queryDraft.value.trim() ? suggestionTitles.value : [], queryHistory.value));
function removeQueryHistory(value: string) { queryHistory.value = queryHistory.value.filter((item) => item !== value); }
const detailLoading = ref(false);
const detailOpen = ref(false);
const selected = ref<MsgPreview>();
const panelMessage = ref<MsgPreview>();
const attempted = ref(false);
const compose = ref(false);
const sendError = ref('');
const composeSnapshot = ref('');
const form = ref<MsgInput>({
  title: '',
  content: '',
  type: 'notice',
  scope: 'all',
  recipient_ids: [],
  expired_at: null,
});
const density = ref<'large' | 'middle' | 'small'>('middle');
const bordered = ref(true);
const striped = ref(true);
const sticky = ref(true);
const visible = ref(['type', 'scope', 'published_at']);
const isFullscreen = ref(false);
let summaryGeneration = 0;
let suggestionGeneration = 0;
let suggestionTimer: ReturnType<typeof setTimeout> | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let detailGeneration = 0;
let generation = 0;
let sendKey = '';
let lastPayload = '';
const messageActionWidth = computed(() => {
  const labels = [
    $t('msg.view'),
    ...(!sent.value ? [$t('msg.markRead')] : []),
    ...(canDelete.value ? [$t(sent.value ? 'msg.deleteGlobal' : 'msg.delete')] : []),
  ];
  return labels.reduce((total, label) => total + [...label].reduce(
    (width, character) => width + ((character.codePointAt(0) ?? 0) > 255 ? 14 : 8), 0,
  ) + 16, 32 + Math.max(0, labels.length - 1) * 8);
});
const listFields = computed(() => [...new Set([
  'id', 'title', ...visible.value,
  ...(sent.value ? ['expired_at'] : []),
  ...(sent.value && sentView.value === 'split' ? ['summary'] : []),
  ...(!sent.value ? ['read_at'] : []),
])].join(','));
const fields = computed(() => [
  // The title absorbs spare space; the actions keep their explicit width.
  { title: $t('msg.title'), key: 'title', dataIndex: 'title' },
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
    width: messageActionWidth.value,
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
function displayTime(value?: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
function invalidateSentDetail() {
  if (!sent.value) return;
  detailGeneration++;
  detailLoading.value = false;
  detailError.value = false;
  detailOpen.value = false;
  selected.value = undefined;
  selectedId.value = undefined;
}
async function loadSummary() {
  const current = ++summaryGeneration;
  if (!sent.value || !canRead.value || !active.value) return;
  summaryLoading.value = true;
  summaryError.value = false;
  try {
    const value = await msgApi.sentSummary();
    if (current === summaryGeneration && canRead.value && active.value) summary.value = value;
  } catch {
    if (current === summaryGeneration) {
      summary.value = undefined;
      summaryError.value = true;
    }
  } finally {
    if (current === summaryGeneration) summaryLoading.value = false;
  }
}
function searchSuggestions(value: string) {
  clearTimeout(suggestionTimer);
  const current = ++suggestionGeneration;
  const text = value.trim();
  suggestionTitles.value = [];
  suggestionsLoading.value = !!text && canRead.value && sent.value;
  if (!suggestionsLoading.value) return;
  suggestionTimer = setTimeout(async () => {
    try {
      const result = await msgApi.list(true, { f: 'title', p: 1, s: 8, q: text });
      if (current === suggestionGeneration && canRead.value && active.value) {
        suggestionTitles.value = [...new Set(result.items.map((item) => item.title))];
      }
    } catch {
      if (current === suggestionGeneration) suggestionTitles.value = [];
    } finally {
      if (current === suggestionGeneration) suggestionsLoading.value = false;
    }
  }, 250);
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  // AutoComplete can emit blur after the form's submit event.
  // A submitted draft must not schedule the same query again.
  if (queryDraft.value.trim() === query.value) return;
  searchTimer = setTimeout(() => {
    if (queryDraft.value.trim() !== query.value) search();
  }, 300);
}
function cancelScheduledSearch() {
  clearTimeout(searchTimer);
}
function chooseSuggestion(value: unknown) {
  queryDraft.value = String(value);
  search();
}
function setSentPage(nextPage: number, nextSize: number) {
  if (nextSize !== size.value) size.value = nextSize;
  else page.value = nextPage;
}
function checkSentRow(id: number, checked: boolean) {
  checkedKeys.value = checked
    ? [...new Set([...checkedKeys.value, id])]
    : checkedKeys.value.filter((value) => value !== id);
}
function retryDetail() {
  const row = rows.value.find((item) => item.id === selectedId.value);
  if (row) void openDetail(row);
}
async function refresh() {
  await Promise.all([load(), loadSummary()]);
}
async function load() {
  if (!active.value) return;
  const current = ++generation;
  if (!canRead.value) {
    rows.value = [];
    total.value = 0;
    loading.value = false;
    if (sent.value) {
      suggestionGeneration++;
  suggestionsLoading.value = false;
      clearTimeout(suggestionTimer);
      suggestionTitles.value = [];
      summaryGeneration++;
      summary.value = undefined;
      summaryLoading.value = false;
      summaryError.value = false;
      invalidateSentDetail();
    }
    return;
  }
  loading.value = true;
  error.value = false;
  try {
    const result = await msgApi.list(sent.value, {
      f: listFields.value,
      p: page.value,
      s: size.value,
      ...(type.value ? { type: type.value } : {}),
      ...(sent.value && scope.value ? { scope: scope.value } : {}),
      ...(sent.value && query.value ? { q: query.value } : {}),
      ...(!sent.value && status.value ? { read: status.value === 'read' } : {}),
    });
    if (current !== generation) return;
    if (!result.items.length && page.value > 1 && result.t <= (page.value - 1) * size.value) {
      page.value--;
      return;
    }
    rows.value = result.items as MsgPreview[];
    total.value = result.t;
    if (sent.value && sentView.value === 'split') {
      const row = rows.value.find((item) => item.id === selectedId.value) ?? rows.value[0];
      if (!row) invalidateSentDetail();
      else if (selectedId.value !== row.id || (!selected.value && !detailLoading.value))
        void openDetail(row);
    }
  } catch {
    if (current === generation) {
      error.value = true;
      rows.value = [];
      if (sent.value) invalidateSentDetail();
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function openDetail(row: MsgPreview) {
  const current = ++detailGeneration;
  const inline = sent.value && sentView.value === 'split';
  if (!inline && sent.value) panelMessage.value = row;
  selected.value = row;
  selectedId.value = row.id;
  detailOpen.value = !inline;
  detailError.value = false;
  detailLoading.value = true;
  try {
    const value = await msgApi.get(row.id, sent.value);
    if (
      current !== detailGeneration ||
      !active.value ||
      !canRead.value ||
      (!inline && !detailOpen.value)
    )
      return;
    selected.value = value;
    if (!inline && sent.value) panelMessage.value = value;
    if (!sent.value && !value.read_at) {
      await msgApi.read(value.id);
      value.read_at = Date.now();
      msgChanged();
      await refresh();
    }
  } catch {
    if (current === detailGeneration) {
      detailError.value = true;
      if (!inline) detailOpen.value = false;
    }
  } finally {
    if (current === detailGeneration) detailLoading.value = false;
  }
}
function openSentPanel(row: MsgPreview) {
  panelMessage.value = row;
  detailOpen.value = true;
}
function closeMessagePanel() {
  if (busy.value) return;
  if (compose.value) void closeCompose();
  else detailOpen.value = false;
}
async function mark(row: MsgPreview) {
  busy.value = true;
  try {
    await msgApi.read(row.id);
    msgChanged();
    await refresh();
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
        await refresh();
        busy.value = false;
      }
    },
  });
}
function remove(row: MsgPreview) {
  if (busy.value || loading.value || !canDelete.value) return;
  const management = sent.value;
  Modal.confirm({
    title: $t(management ? 'msg.deleteGlobalConfirm' : 'msg.deleteConfirm'),
    okText: $t('msg.confirm'),
    cancelText: $t('msg.cancel'),
    okButtonProps: { danger: true },
    async onOk() {
      busy.value = true;
      try {
        await msgApi.remove(row.id, management);
        detailOpen.value = false;
        if (management) invalidateSentDetail();
        msgChanged();
        await refresh();
      } finally {
        busy.value = false;
      }
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
    await refresh();
    busy.value = false;
  }
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
  composeSnapshot.value = JSON.stringify(form.value);
  compose.value = true;
}
async function send() {
  if (busy.value) return;
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
    const published = await msgApi.send(payload, sendKey);
    message.success($t('msg.sent'));
    msgChanged();
    if (page.value !== 1) {
      page.value = 1;
      await nextTick();
    }
    await refresh();
    if (active.value && canRead.value) {
      panelMessage.value = published;
      detailOpen.value = true;
    }
    compose.value = false;
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
    JSON.stringify(form.value) === composeSnapshot.value
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
  clearTimeout(searchTimer);
  if (sent.value) {
    query.value = queryDraft.value.trim();
    if (query.value)
      queryHistory.value = [
        query.value,
        ...queryHistory.value.filter((value) => value !== query.value),
      ].slice(0, 8);
    invalidateSentDetail();
  }
  page.value = 1;
  listRevision.value++;
}
function resetSearch() {
  status.value = '';
  type.value = '';
  scope.value = '';
  queryDraft.value = '';
  query.value = '';
  suggestionTitles.value = [];
  suggestionGeneration++;
  suggestionsLoading.value = false;
  clearTimeout(suggestionTimer);
  search();
}
defineExpose({ closeCompose });
watch(defaultPageSize, (value) => { size.value = value; });
const listRevision = ref(0);
// Reset pagination synchronously; the single batched watcher below owns requests.
watch([sent, status, type, scope, size, query], () => {
  page.value = 1;
}, { flush: 'sync' });
watch([sent, page, size, status, type, scope, query, canRead, listRevision, listFields], () => {
  checkedKeys.value = [];
  detailOpen.value = false;
  invalidateSentDetail();
  void load();
}, { immediate: true });
watch([sent, canRead], () => { void loadSummary(); }, { immediate: true });
let timer: ReturnType<typeof setInterval>;
function refreshVisible() {
  if (active.value && !document.hidden && !busy.value) void refresh();
}
onMounted(() => {
  if (!sent.value) visitMessages(Number(attentionUser.userInfo?.userId));
  timer = setInterval(refreshVisible, 30000);
  window.addEventListener('cinch-msg-changed', refreshVisible);
});
onActivated(() => {
  if (!sent.value) visitMessages(Number(attentionUser.userInfo?.userId));
  if (active.value) return;
  active.value = true;
  void refresh();
});
onDeactivated(() => {
  active.value = false;
  if (sent.value) compose.value = false;
  generation++;
  summaryGeneration++;
  suggestionGeneration++;
  suggestionsLoading.value = false;
  clearTimeout(searchTimer);
  clearTimeout(suggestionTimer);
  loading.value = false;
  summaryLoading.value = false;
  invalidateSentDetail();
});
onBeforeUnmount(() => {
  active.value = false;
  clearInterval(timer);
  window.removeEventListener('cinch-msg-changed', refreshVisible);
  generation++;
  detailGeneration++;
  summaryGeneration++;
  suggestionGeneration++;
  suggestionsLoading.value = false;
  clearTimeout(searchTimer);
  clearTimeout(suggestionTimer);
});
</script>
<template>
  <div class="msg-region flex h-full flex-col gap-4" :class="{ 'msg-fullscreen': isFullscreen }">
    <header v-if="sent" class="msg-management-heading"><h1>{{ $t('msg.manage') }}</h1></header>
    <SentSummary
      v-if="sent && canRead"
      :summary="summary"
      :loading="summaryLoading"
      :error="summaryError"
      @retry="loadSummary"
    />
    <ManagementCard class="shrink-0">
      <ManagementSearch @submit.prevent="search">
        <FormItem v-if="sent" :label="$t('msg.keyword')" class="w-full sm:w-auto">
          <SearchAutocomplete
            v-model:value="queryDraft"
            class="system-filter-control"
            style="--filter-width: 280px"
            data-testid="message-search"
            :aria-label="$t('msg.keyword')"
            :placeholder="$t('msg.searchMessages')"
            :options="suggestionOptions"
            :loading="suggestionsLoading"
            @search="searchSuggestions"
            @select="chooseSuggestion"
            @submit="search"
            @focus="cancelScheduledSearch"
            @blur="scheduleSearch"
            @remove-history="removeQueryHistory"
          />
        </FormItem>
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
        <FormItem v-if="sent" :label="$t('msg.scope')" class="w-full sm:w-auto">
          <Select
            v-model:value="scope"
            data-testid="message-scope"
            :aria-label="$t('msg.scope')"
            class="system-filter-control"
            style="--filter-width: 200px"
            :options="[
              { value: '', label: $t('msg.allScopes') },
              { value: 'all', label: $t('msg.all') },
              { value: 'targeted', label: $t('msg.targeted') },
            ]"
          />
        </FormItem>
        <template #actions>
          <Button @click="resetSearch">{{ $t('system.common.reset') }}</Button>
          <Button html-type="submit" type="primary" :loading="loading" :aria-busy="loading">
            {{ $t('system.common.search') }}
          </Button>
        </template>
      </ManagementSearch>
    </ManagementCard>
    <ManagementCard class="min-h-0 flex-1">
      <div v-if="sent" class="mb-4 flex justify-end" data-testid="message-result-caption">
        <ManagementViewSwitch
          v-model="sentView"
          test-id="message-view"
          :options="sentViewOptions"
        />
      </div>
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
              >
{{ $t('msg.deleteSelected') }}
</Button>
            <Button
              data-testid="message-bulk-read"
              v-if="!sent"
              :disabled="busy || loading"
              @click="requestBulk(true)"
              >
{{ $t('msg.markRead') }}
</Button>
          </template>
</Space>
        <ManagementToolbar
          v-model:size="density"
          v-model:bordered="bordered"
          v-model:striped="striped"
          v-model:sticky="sticky"
          :loading="loading"
          :can-read="canRead"
          :is-fullscreen="embedded || isFullscreen"
          @refresh="refresh"
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
      <LoadWarning v-else-if="error">
        <template #action>
          <Button @click="refresh">{{ $t('msg.retry') }}</Button>
        </template>
      </LoadWarning>

      <SentWorkspace
        v-if="sent && sentView === 'split' && canRead && !error"
        :rows="rows"
        :selected="selected"
        :selected-id="selectedId"
        :detail-error="detailError"
        :detail-loading="detailLoading"
        :loading="loading"
        :busy="busy"
        :can-delete="canDelete"
        :checked-keys="checkedVisible"
        :page="page"
        :size="size"
        :total="total"
        :density="density"
        :bordered="bordered"
        :striped="striped"
        :sticky="sticky"
        :visible="visible"
        @select="openDetail"
        @view="openSentPanel"
        @retry="retryDetail"
        @remove="remove"
        @check="checkSentRow"
        @check-all="checkedKeys = $event ? rows.map((row) => row.id) : []"
        @page="setSentPage"
      />
      <Table
        v-if="canRead && !error && (!sent || sentView === 'table')"
        row-key="id"
        :data-source="rows"
        :row-selection="rowSelection"
        :columns="fields"
        :loading="loading"
        :size="density"
        :bordered="bordered"
        :sticky="sticky"
        :row-class-name="
          (_record: MsgPreview, index: number) =>
            striped && index % 2 === 1 ? 'system-table-row-striped' : ''
        "
        :scroll="{ x: 320 + 48 + fields.reduce((total, field) => total + (field.width ?? 0), 0) }"
        :pagination="{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => $t('system.table.total', { count }),
        }"
        @change="
          (p: { pageSize?: number; current?: number }) => {
            size = p.pageSize ?? size;
            page = p.current ?? 1;
          }
        "
      >
        <template #emptyText><Empty :description="$t('msg.empty')" /></template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <Button size="small" type="link" class="msg-title" @click="openDetail(record as MsgPreview)">
              {{ record.title }}
</Button><Tag v-if="record.expired_at && record.expired_at <= Date.now()">
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
            {{ displayTime(record.published_at) }}
          </template>
          <Space v-else-if="column.key === 'actions'" class="whitespace-nowrap">
            <Button size="small" type="link" @click="openDetail(record as MsgPreview)">
              {{ $t('msg.view') }}
</Button><Button
              v-if="!sent && !record.read_at"
              size="small"
              type="link"
              :disabled="busy"
              @click="mark(record as MsgPreview)"
            >
              {{ $t('msg.markRead') }}
</Button><Button
              v-if="canDelete"
              size="small"
              danger
              type="link"
              @click="remove(record as MsgPreview)"
            >
              {{ $t(sent ? 'msg.deleteGlobal' : 'msg.delete') }}
            </Button>
          </Space>
        </template>
      </Table>
    </ManagementCard>
  </div>
  <Modal v-if="!sent" v-model:open="detailOpen" :title="$t('msg.detail')" :width="560" :footer="null">
    <div v-if="selected" v-skeleton="detailLoading" class="message-detail-viewport">
      <h2 class="mb-3 text-xl font-semibold">{{ selected.title }}</h2>
      <p>{{ displayTime(selected.published_at) }}</p>
      <p class="msg-content my-5">{{ selected.content }}</p>
      <p>
        {{ $t('msg.expiry') }}:
        {{ selected.expired_at ? displayTime(selected.expired_at) : $t('msg.noExpiry') }}
      </p>
      <Button v-if="canDelete" danger class="mt-5" @click="remove(selected)">
        {{ $t(sent ? 'msg.deleteGlobal' : 'msg.delete') }}
      </Button>
    </div>
  </Modal>
  <ManagementDrawer
    v-if="sent"
    :open="compose || detailOpen"
    :title="$t(compose ? 'msg.send' : 'msg.detail')"
    :entity="$t('msg.manage')"
    :record-id="compose ? undefined : panelMessage?.id"
    :mode="compose ? 'create' : 'detail'"
    :busy="busy"
    @close="closeMessagePanel"
  >
    <template v-if="!compose">
      <LoadWarning v-if="detailError" />
      <div v-else v-skeleton="detailLoading"><MessageRecordBody v-if="panelMessage" :record="panelMessage" /></div>
    </template>
    <ManagementForm v-else :disabled="busy" vertical data-testid="message-editor">
      <MessageRecordBody editing :targeted="form.scope === 'targeted'">
<template #title>
<FormItem
        :label="$t('msg.title')"
        required
        :validate-status="attempted && issues.title ? 'error' : ''"
        :help="attempted ? issues.title : ''"
      >
        <Input v-model:value="form.title" :aria-label="$t('msg.title')" />
      </FormItem>
</template>
<template #content>
<FormItem
        :label="$t('msg.content')"
        required
        :validate-status="attempted && issues.content ? 'error' : ''"
        :help="attempted ? issues.content : ''"
      >
        <Input.TextArea v-model:value="form.content" :aria-label="$t('msg.content')" :auto-size="{ minRows: 5, maxRows: 12 }" />
      </FormItem>
</template>
<template #type>
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
</template>
<template #scope>
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
</template>
<template #recipients>
<FormItem
        v-show="form.scope === 'targeted'"
        html-for="msg-recipients"
        :label="$t('msg.recipients')"
        required
        :validate-status="attempted && issues.recipients ? 'error' : ''"
        :help="attempted ? issues.recipients : ''"
      >
        <AssociationEditor
          id="msg-recipients"
          :value="form.recipient_ids"
          kind="recipient"
          :disabled="busy"
          @update:value="form.recipient_ids = $event.map(Number)"
        />
      </FormItem>
</template>
<template #expiry>
<FormItem
        :label="$t('msg.expiry')"
        :validate-status="attempted && issues.expiry ? 'error' : ''"
        :help="attempted ? issues.expiry : ''"
      >
        <DatePicker
          :value="form.expired_at ? dayjs(formatDateTime(form.expired_at)) : undefined"
          format="YYYY-MM-DD HH:mm:ss"
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
</template>
      </MessageRecordBody>
      <Alert class="mt-5" v-if="sendError" type="error" :message="sendError" />
    </ManagementForm>
    <template #footer>
      <Button :disabled="busy" @click="closeMessagePanel">{{ $t(compose ? 'msg.cancel' : 'system-cards.backToList') }}</Button>
      <Button v-if="compose" type="primary" :loading="busy" :aria-busy="busy" @click="send"><IconifyIcon icon="lucide:send" />{{ $t('msg.send') }}</Button>
      <Button v-else-if="canDelete && panelMessage" danger :disabled="busy" @click="remove(panelMessage)">{{ $t('msg.deleteGlobal') }}</Button>
    </template>
  </ManagementDrawer>
</template>
<style scoped>
.message-detail-facts { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px; margin: 0; }
.message-detail-facts dt { color: hsl(var(--muted-foreground)); }
.message-detail-facts dd { margin: 0; overflow-wrap: anywhere; }
.message-recipient-tags { display: flex; flex-wrap: wrap; gap: 6px; }

.msg-management-heading{flex-shrink:0;padding:3px 0 2px}.msg-management-heading h1{font-size:24px;line-height:1.35;font-weight:650;margin:0}

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

<style scoped>
.message-detail-viewport { height: min(480px, 65vh); overflow: auto; scrollbar-gutter: stable; }
</style>
