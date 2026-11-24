<script setup lang="ts">
import type { MailTemplateSummary } from '#/api/mail-template';
import type { LoadFailure } from '#/api/request-error';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { registerTabCloseGuard, useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Alert, Button, FormItem, Select, Space, Tag } from 'ant-design-vue';

import {
  createMailTemplate,
  deleteMailTemplate,
  listMailTemplates,
} from '#/api/mail-template';
import { loadFailure } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import LoadWarning from '#/components/load-warning.vue';
import SearchAutocomplete from '#/components/search-autocomplete.vue';
import { searchSuggestionGroups } from '#/components/search-suggestions';
import Table from '#/components/skeleton-table.vue';
import TableColumnSelector from '#/components/table-column-selector.vue';
import { useDefaultPageSize } from '#/composables/use-default-page-size';
import { useOperationConfirmation } from '#/composables/use-operation-confirmation';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';

import ManagementCard from '../components/management-card.vue';
import ManagementSearch from '../components/management-search.vue';
import ManagementToolbar from '../components/management-toolbar.vue';
import { emptyContent } from './content';
import MailEditor from './editor.vue';

const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});
const route = useRoute();
const router = useRouter();
const timezone = useTimezoneStore();
const { hasPage, hasButton } = usePermissions();
const canRead = computed(() => hasPage('/system/mail-template'));
const can = (key: string) =>
  hasButton(`admin:btn:system:mail-template:${key}`, '/system/mail-template');
const editor = ref<InstanceType<typeof MailEditor>>();
const editingID = computed(() => Number(route.query.template) || 0);
const root = ref<HTMLElement>();
const error = ref<LoadFailure>(false);
const loading = ref(false);
const records = ref<MailTemplateSummary[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: useDefaultPageSize().value || 20,
  total: 0,
});
const category = ref<string>();
const history = ref<string[]>([]);
const search = ref('');
const suggesting = ref(false);
const suggestions = ref<string[]>([]);
const options = computed(() =>
  searchSuggestionGroups(suggestions.value, history.value),
);
const categoryOptions = computed(() =>
  ['verification', 'confirmation', 'security', 'notification'].map((value) => ({
    value,
    label: t(value),
  })),
);
const bordered = ref(true);
const fullscreen = ref(false);
const size = ref<'large' | 'middle' | 'small'>('middle');
const sticky = ref(true);
const striped = ref(true);
const visible = ref([
  'template_id',
  'name',
  'category',
  'state',
  'published_version',
  'updated_at',
]);
const allColumns = computed(() => [
  {
    key: 'template_id',
    dataIndex: 'template_id',
    title: t('templateID'),
    width: 190,
  },
  { key: 'name', dataIndex: 'name', title: t('name'), width: 180 },
  { key: 'category', dataIndex: 'category', title: t('category'), width: 110 },
  { key: 'state', title: t('status'), width: 120 },
  {
    key: 'published_version',
    dataIndex: 'published_version',
    title: t('version'),
    width: 100,
  },
  {
    key: 'updated_at',
    dataIndex: 'updated_at',
    title: t('updatedAt'),
    width: 180,
  },
]);
const columns = computed(() => [
  ...allColumns.value.filter((column) => visible.value.includes(column.key)),
  { key: 'operation', title: t('operation'), width: 130 },
]);
const date = (value: number) => {
  void timezone.timezone;
  return formatDateTime(value);
};
let listSequence = 0;
let suggestionSequence = 0;
let blurTimer: ReturnType<typeof setTimeout> | undefined,
  suggestionTimer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  if (!canRead.value || editingID.value) return;
  const sequence = ++listSequence;
  loading.value = true;
  error.value = false;
  try {
    const result = await listMailTemplates({
      p: pagination.current,
      s: pagination.pageSize,
      q: search.value.trim(),
      category: category.value,
    });
    if (sequence !== listSequence) return;
    records.value = result.items;
    pagination.total = result.t;
  } catch (requestError) {
    if (sequence === listSequence) error.value = loadFailure(requestError);
  } finally {
    if (sequence === listSequence) loading.value = false;
  }
}
function query() {
  clearTimeout(blurTimer);
  pagination.current = 1;
  const q = search.value.trim();
  if (q)
    history.value = [q, ...history.value.filter((item) => item !== q)].slice(
      0,
      10,
    );
  void load();
}
function onSearch(value: string) {
  clearTimeout(suggestionTimer);
  const sequence = ++suggestionSequence;
  if (!value.trim()) {
    suggestions.value = [];
    suggesting.value = false;
    return;
  }
  suggesting.value = true;
  suggestionTimer = setTimeout(async () => {
    try {
      const result = await listMailTemplates({ p: 1, s: 8, q: value });
      if (sequence === suggestionSequence)
        suggestions.value = result.items
          .flatMap((item) => [item.name, item.template_id])
          .filter((item) => item.toLowerCase().includes(value.toLowerCase()));
    } catch {
      if (sequence === suggestionSequence) suggestions.value = [];
    } finally {
      if (sequence === suggestionSequence) suggesting.value = false;
    }
  }, 200);
}
function blurSearch() {
  blurTimer = setTimeout(query, 250);
}
function reset() {
  search.value = '';
  category.value = undefined;
  query();
}
function openEditor(id: number) {
  return router.replace({ path: route.path, query: { template: id } });
}
function closeEditor() {
  void router.replace({ path: route.path, query: {} });
}
function pageChanged(value: { current?: number; pageSize?: number }) {
  const nextPageSize = value.pageSize || pagination.pageSize;
  pagination.current =
    nextPageSize === pagination.pageSize ? value.current || 1 : 1;
  pagination.pageSize = nextPageSize;
  void load();
}
async function toggleFullscreen() {
  await (document.fullscreenElement
    ? document.exitFullscreen()
    : root.value?.requestFullscreen());
}
function changedFullscreen() {
  fullscreen.value = document.fullscreenElement === root.value;
}
document.addEventListener('fullscreenchange', changedFullscreen);
const { confirmSensitiveOperation } = useOperationConfirmation();
function remove(id: number, templateID: string) {
  confirmSensitiveOperation({
    title: t('deleteConfirm'),
    content: templateID,
    okText: t('delete'),
    cancelText: t('cancel'),
    okButtonProps: { danger: true },
    onOk: async () => {
      await deleteMailTemplate(id);
      if (records.value.length === 1 && pagination.current > 1)
        pagination.current--;
      await load();
    },
  });
}
const createBusy = ref(false);
let pendingDraft:
  | undefined
  | { template_id: string; name: string; key: string };
async function create() {
  if (createBusy.value) return;
  createBusy.value = true;
  pendingDraft ??= {
    template_id: `draft.${crypto.randomUUID()}`,
    name: t('untitled'),
    key: crypto.randomUUID(),
  };
  try {
    const value = await createMailTemplate(
      {
        template_id: pendingDraft.template_id,
        name: pendingDraft.name,
        category: 'notification',
        content: emptyContent(),
      },
      pendingDraft.key,
    );
    pendingDraft = undefined;
    await openEditor(value.id);
  } catch (error) {
    showRequestErrorToast(error);
  } finally {
    createBusy.value = false;
  }
}
const navigationError = ref<LoadFailure>(false);
const navigationIDs = ref<number[]>([]);
const navigationLoading = ref(false);
const navigationIndex = computed(() =>
  navigationIDs.value.indexOf(editingID.value),
);
const previousID = computed(
  () => navigationIDs.value[navigationIndex.value - 1],
);
const nextID = computed(() =>
  navigationIndex.value < 0
    ? undefined
    : navigationIDs.value[navigationIndex.value + 1],
);
let navigationSequence = 0;
async function loadNavigation() {
  const sequence = ++navigationSequence;
  const currentID = editingID.value;
  navigationLoading.value = true;
  navigationError.value = false;
  navigationIDs.value = [];
  const ids: number[] = [];
  const filters = { q: search.value.trim(), category: category.value };
  try {
    for (let page = 1; ; page++) {
      const result = await listMailTemplates({ ...filters, p: page, s: 100 });
      if (sequence !== navigationSequence) return;
      ids.push(...result.items.map((item) => item.id));
      if (result.items.length === 0 || page * result.s >= result.t) break;
    }
    // A newly created draft may not match the current list filters.
    if (!ids.includes(currentID)) ids.unshift(currentID);
    navigationIDs.value = [...new Set(ids)];
  } catch (requestError) {
    if (sequence === navigationSequence)
      navigationError.value = loadFailure(requestError);
  } finally {
    if (sequence === navigationSequence) navigationLoading.value = false;
  }
}
onBeforeRouteUpdate((to, from) =>
  to.query.template === from.query.template
    ? true
    : (editor.value?.confirmLeave() ?? true),
);
onBeforeRouteLeave(() => editor.value?.confirmLeave() ?? true);
const unregister = registerTabCloseGuard(
  route.path,
  () => editor.value?.confirmLeave() ?? true,
);
watch(
  [canRead, editingID],
  () => {
    if (canRead.value && editingID.value) {
      if (!navigationIDs.value.includes(editingID.value)) void loadNavigation();
    } else {
      navigationSequence++;
      navigationIDs.value = [];
      void load();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  unregister();
  navigationSequence++;
  listSequence++;
  suggestionSequence++;
  clearTimeout(blurTimer);
  clearTimeout(suggestionTimer);
  document.removeEventListener('fullscreenchange', changedFullscreen);
});
</script>

<template>
  <Page>
    <Alert v-if="!canRead" type="error" :message="t('noPermission')" />
    <MailEditor
      v-else-if="editingID"
      :key="editingID"
      ref="editor"
      :id="editingID"
      :can-edit="can('edit')"
      :can-publish="can('publish')"
      :previous-id="previousID"
      :next-id="nextID"
      :navigation-loading="navigationLoading"
      :navigation-error="navigationError"
      @navigate="openEditor"
      @retry-navigation="loadNavigation"
      @close="closeEditor"
    />
    <div
      v-else
      ref="root"
      class="mail-template-list"
      :class="{ expanded: fullscreen }"
    >
      <ManagementCard>
        <ManagementSearch @finish="query">
          <FormItem :label="t('name')">
            <SearchAutocomplete
              v-model:value="search"
              :aria-label="t('searchPlaceholder')"
              :placeholder="t('searchPlaceholder')"
              :options="options"
              :loading="suggesting"
              style="width: 208px"
              @search="onSearch"
              @select="query"
              @submit="query"
              @blur="blurSearch"
              @remove-history="
                history = history.filter((item) => item !== $event)
              "
            />
          </FormItem>
          <FormItem :label="t('category')">
            <Select
              v-model:value="category"
              :aria-label="t('category')"
              :placeholder="t('selectCategory')"
              :options="categoryOptions"
              allow-clear
              style="width: 160px"
              @change="query"
            />
          </FormItem>
          <template #actions>
            <Button @click="reset">{{ t('reset') }}</Button
            ><Button type="primary" @click="query">
              {{ t('query') }}
            </Button>
          </template>
        </ManagementSearch>
      </ManagementCard>
      <ManagementCard class="mail-results">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <Button
            v-if="can('create')"
            type="primary"
            :loading="createBusy"
            @click="create"
          >
            <IconifyIcon icon="lucide:plus" />{{ t('create') }}
          </Button>
          <ManagementToolbar
            v-model:size="size"
            v-model:bordered="bordered"
            v-model:striped="striped"
            v-model:sticky="sticky"
            :loading="loading"
            :is-fullscreen="fullscreen"
            @refresh="load"
            @fullscreen="toggleFullscreen"
          >
            <template #columns>
              <TableColumnSelector
                v-model="visible"
                :options="
                  allColumns.map(({ key, title }) => ({
                    value: key,
                    label: title,
                  }))
                "
              />
            </template>
          </ManagementToolbar>
        </div>
        <LoadWarning
          v-if="error"
          :failure="error"
          class="mb-4"
          :retry-label="t('retry')"
          retry-size="small"
          @retry="load"
        />
        <Table
          :columns="columns"
          :data-source="records"
          :loading="loading"
          :bordered="bordered"
          :size="size"
          :sticky="sticky"
          :row-class-name="
            (_: unknown, i: number) => (striped && i % 2 ? 'mail-striped' : '')
          "
          row-key="id"
          :scroll="{ x: 'max-content' }"
          :pagination="{
            ...pagination,
            showSizeChanger: true,
            showTotal: (count: number) => t('total', { count }),
          }"
          @change="pageChanged"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'state'">
              <Tag :color="record.has_draft ? 'orange' : 'green'">
                {{
                  t(
                    !record.published_version
                      ? 'draft'
                      : record.has_draft
                        ? 'pending'
                        : 'published',
                  )
                }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'category'">
              {{ t(record.category) }}
            </template>
            <template v-else-if="column.key === 'published_version'">
              {{
                record.published_version ? `v${record.published_version}` : '—'
              }}
            </template>
            <template v-else-if="column.key === 'updated_at'">
              {{ date(record.updated_at) }}
            </template>
            <template v-else-if="column.key === 'operation'">
              <Space>
                <Button type="link" size="small" @click="openEditor(record.id)">
                  {{ t(can('edit') ? 'edit' : 'view') }} </Button
                ><Button
                  v-if="can('delete')"
                  type="link"
                  danger
                  size="small"
                  @click="remove(record.id, record.template_id)"
                >
                  {{ t('delete') }}
                </Button>
              </Space>
            </template>
          </template>
        </Table>
      </ManagementCard>
    </div>
  </Page>
</template>
<style scoped>
.mail-template-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 3px 0 8px;
}

.mail-template-list.expanded {
  padding: 16px;
  overflow: auto;
  background: hsl(var(--background));
}

.mail-results :deep(.ant-card-body) {
  padding: 18px;
}

:deep(.mail-striped > td) {
  background: rgb(127 127 127 / 6%);
}

:deep(.ant-table-cell) {
  max-width: 320px;
  overflow-wrap: anywhere;
}
</style>
