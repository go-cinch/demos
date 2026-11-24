<script lang="ts" setup>
import type { Recordable } from '@vben/types';

import type {
  FormModel,
  ManagementRecordActions,
  ResourceKind,
  SystemRecord,
} from './management-types';

import type {
  SystemSummaryDay,
  SystemSummaryGroup,
} from '#/api/system/insights';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { useFullscreen } from '@vueuse/core';
import { Button, message, Result, Tag } from 'ant-design-vue';

import { unlockUserAccount } from '#/api';
import { resetUserTOTPApi } from '#/api/core/auth';
import { useOperationConfirmation } from '#/composables/use-operation-confirmation';
import { $t, catalogLabel } from '#/locales';
import {
  catalogGroupNames,
  catalogGroupOrder,
  catalogGroupWords,
} from '#/locales/catalog';
import { useAuthStore } from '#/store';

import { actionListFields } from './action-detail';
import ActionGroupDialog from './action-group-dialog.vue';
import ActionGroupNav from './action-group-nav.vue';
import { applyGroupOrder, deletePermissionGroup } from './action-groups';
import ManagementCard from './management-card.vue';
import ManagementFilterForm from './management-filter-form.vue';
import { resetObject } from './management-model';
import ManagementRecordPanel from './management-record-panel.vue';
import { useManagementResource } from './management-resources';
import ManagementResults from './management-results.vue';
import ManagementUserDialogs from './management-user-dialogs.vue';
import SystemOverview from './system-overview.vue';
import { useManagementData } from './use-management-data';
import { useManagementFilters } from './use-management-filters';
import { useManagementFormatting } from './use-management-formatting';
import { useManagementPermissions } from './use-management-permissions';
const props = defineProps<{ resource: ResourceKind }>();
const route = useRoute();
const permissions = useManagementPermissions(() => props.resource);
const {
  canRead,
  canResetTOTP,
  canCreate,
  canRemoveRecord,
  canSelectRecord,
  hasButtonAccess,
  buttonLabel,
} = permissions;
const config = useManagementResource(() => props.resource);
const { confirmSensitiveOperation } = useOperationConfirmation();
const { getRecordLabel } = useManagementFormatting(() => props.resource);
const recordPanel = ref<InstanceType<typeof ManagementRecordPanel>>();
const userDialogs = ref<InstanceType<typeof ManagementUserDialogs>>();
const selectedRecord = computed(
  () => recordPanel.value?.selectedRecord ?? null,
);
const openEditor = (record?: Recordable<any>) =>
  recordPanel.value?.openEditor(record);
const openDetail = (record: Recordable<any>, field?: string) =>
  recordPanel.value?.openDetail(record, field);
const selectUserGroup = (group: SystemSummaryGroup) =>
  recordPanel.value?.selectUserGroup(group);
const openApproval = (record: Recordable<any>) =>
  userDialogs.value?.openApproval(record);
const openLock = (record: Recordable<any>) =>
  userDialogs.value?.openLock(record);
const filters = reactive<FormModel>({});
const {
  loading,
  records,
  selectedRowKeys,
  loadError,
  summary,
  summaryLoading,
  summaryError,
  summaryDays,
  pagination,
  loadData,
  loadOverview,
  refreshAll,
  handleTableChange,
  isCurrentQuery,
} = useManagementData({
  resource: () => props.resource,
  config,
  canRead,
  filters,
  fields: () => listFields.value,
  clearDetails: () => recordPanel.value?.clearDetails(),
  onRangeChange: () => {
    void clearDay();
  },
  onOverview(result) {
    if (!selectedDay.value) return;
    const day = result.trend.find((item) => item.date === selectedDay.value);
    const prefix =
      selectedDayKind.value === 'login' ? 'last_logged_in' : 'created';
    if (
      day &&
      (filters[`${prefix}_from`] !== day.from ||
        filters[`${prefix}_to`] !== day.to)
    ) {
      setDayRange(day, selectedDayKind.value);
      void loadData();
    }
  },
});

let initialView: 'cards' | 'matrix' | 'table' = 'cards';
if (props.resource === 'user') {
  initialView = 'table';
} else if (props.resource === 'action') {
  initialView = 'matrix';
}
const viewMode = ref<'cards' | 'matrix' | 'table'>(initialView);
const groupDialogOpen = ref(false);
const editingGroup = ref<string>();
const permissionGroups = computed(() => {
  const groups = summary.value?.groups ?? [];
  const used = new Set(groups.map((group) => group.name));
  return applyGroupOrder(
    [
      ...groups,
      ...catalogGroupWords()
        .filter((name) => !used.has(name))
        .map((name) => ({ name, count: 0 })),
    ],
    catalogGroupOrder(),
  );
});
function openGroupEditor(word?: string) {
  if (!hasButtonAccess(word ? 'edit-group' : 'create-group')) return;
  editingGroup.value = word;
  groupDialogOpen.value = true;
}
async function groupSaved(word: string) {
  if (editingGroup.value && editingGroup.value !== word) {
    filters.groups_exact = selectedExactGroups.value.map((key) =>
      key === editingGroup.value ? word : key,
    );
  }
  await refreshAll();
}
function removeGroup(word: string) {
  if (!hasButtonAccess('delete-group')) return;
  if (permissionGroups.value.find((group) => group.name === word)?.count !== 0)
    return;
  const expectedNames = catalogGroupNames(word);
  confirmSensitiveOperation({
    title: $t('action-editor.deleteGroup'),
    content: $t('action-editor.deleteGroupConfirm', {
      name: catalogLabel('groups', word),
    }),
    okText: $t('system.common.delete'),
    cancelText: $t('system-editor.cancel'),
    okButtonProps: { danger: true },
    async onOk() {
      if (!hasButtonAccess('delete-group')) return;
      await deletePermissionGroup(word, expectedNames);
      filters.groups_exact = selectedExactGroups.value.filter(
        (key) => key !== word,
      );
      await refreshAll();
    },
  });
}
const selectedDay = ref('');
const selectedDayKind = ref<'created' | 'login'>('created');
const selectedStatus = computed(() => {
  if (Array.isArray(filters.status)) {
    if (filters.status.length === 1) {
      return Number(filters.status[0]);
    }
    return undefined;
  }
  if (typeof filters.status === 'number') {
    return filters.status;
  }
  return undefined;
});
const selectedExactGroups = computed<string[]>(() =>
  Array.isArray(filters.groups_exact) ? filters.groups_exact : [],
);
const selectedRoleGroups = computed<string[]>(() =>
  Array.isArray(filters.groups_all) ? filters.groups_all : [],
);
const selectedRolePermissionLabel = computed(() =>
  ['role', 'user-group'].includes(props.resource) &&
  typeof filters.has_permissions === 'boolean'
    ? $t(
        filters.has_permissions
          ? 'system-insights.withPermissions'
          : 'system-insights.withoutPermissions',
      )
    : '',
);
const selectedPermissionGroups = computed(() =>
  props.resource === 'role'
    ? selectedRoleGroups.value
    : selectedExactGroups.value,
);

async function quickFilter(input: {
  key: string;
  value: boolean | number | string | undefined;
}) {
  if (input.key === 'status') {
    filters.status =
      input.value !== undefined && selectedStatus.value !== input.value
        ? [input.value]
        : undefined;
  } else {
    filters[input.key] = input.value;
  }
  await search();
}
function setDayRange(day: SystemSummaryDay, kind: 'created' | 'login') {
  filters.created_from = kind === 'created' ? day.from : undefined;
  filters.created_to = kind === 'created' ? day.to : undefined;
  filters.last_logged_in_from = kind === 'login' ? day.from : undefined;
  filters.last_logged_in_to = kind === 'login' ? day.to : undefined;
}
async function selectDay(
  day: SystemSummaryDay,
  kind: 'created' | 'login' = 'created',
) {
  if (selectedDay.value === day.date && selectedDayKind.value === kind) {
    await clearDay();
    return;
  }
  selectedDay.value = day.date;
  selectedDayKind.value = kind;
  setDayRange(day, kind);
  await search();
}
async function clearDay() {
  selectedDay.value = '';
  selectedDayKind.value = 'created';
  filters.created_from = undefined;
  filters.created_to = undefined;
  filters.last_logged_in_from = undefined;
  filters.last_logged_in_to = undefined;
  await search();
}
async function selectPermissionGroup(name?: string) {
  filters.group = undefined;
  filters.group_exact = undefined;
  if (name === undefined) filters.groups_exact = [];
  else
    filters.groups_exact = selectedExactGroups.value.includes(name)
      ? selectedExactGroups.value.filter((group) => group !== name)
      : [...selectedExactGroups.value, name];
  await search();
}
async function toggleRolePermissionGroup(name: string) {
  filters.groups_all = selectedRoleGroups.value.includes(name)
    ? selectedRoleGroups.value.filter((group) => group !== name)
    : [...selectedRoleGroups.value, name];
  await search();
}
async function clearPermissionGroup(name: string) {
  if (props.resource === 'role') {
    filters.groups_all = selectedRoleGroups.value.filter(
      (group) => group !== name,
    );
    await search();
  } else {
    await selectPermissionGroup(name);
  }
}
function permissionGroupLabel(name: string) {
  return name ? catalogLabel('groups', name) : $t('system-insights.ungrouped');
}
function clearPermissionGroupLabel(name: string) {
  return props.resource === 'role'
    ? $t('system-insights.clearRoleGroup', {
        name: permissionGroupLabel(name),
      })
    : $t('system-insights.clearGroup');
}
function confirmRemove(record: SystemRecord) {
  if (!canRemoveRecord(record)) return;
  confirmSensitiveOperation({
    title: $t('system.confirm.delete', { name: getRecordLabel(record) }),
    onOk: () => removeRecords([record.id]),
  });
}
watch(
  () => filters.group,
  (value) => {
    if (value && (!Array.isArray(value) || value.length > 0)) {
      filters.group_exact = undefined;
      filters.groups_exact = undefined;
    }
  },
);
const tableContainerRef = ref<HTMLElement>();
const { isFullscreen, toggle: toggleFullscreen } =
  useFullscreen(tableContainerRef);
const selectionColumnKey = '__selection__';
const visibleColumnKeys = ref<string[]>([
  selectionColumnKey,
  ...(props.resource === 'user'
    ? [
        'username',
        'email',
        'role',
        'status',
        'login_count',
        'last_logged_in_at',
        'metadata',
      ]
    : config.value.columns.map((column) => column.key)),
]);
const listFields = computed(() => {
  const base: Record<ResourceKind, string[]> = {
    user: ['id', 'username', 'code', 'status', 'metadata'],
    action: actionListFields,
    role: ['id', 'name', 'word'],
    'user-group': ['id', 'name', 'word'],
    dictionary: ['id', 'name', 'key'],
  };
  const cards: Partial<Record<ResourceKind, string[]>> = {
    role: ['action_summaries', 'created_at', 'updated_at'],
    'user-group': [
      'action_summaries',
      'member_count',
      'member_preview',
      'created_at',
      'updated_at',
    ],
    dictionary: ['enabled', 'description', 'value', 'created_at', 'updated_at'],
  };
  function resolveColumns(): string[] {
    if (props.resource === 'action' && viewMode.value === 'matrix') {
      return [];
    }
    if (viewMode.value === 'cards') {
      return cards[props.resource] ?? [];
    }
    return config.value.columns
      .filter(
        (column) =>
          visibleColumnKeys.value.includes(column.key) &&
          (viewMode.value !== 'matrix' ||
            ['button', 'menu', 'name', 'resource'].includes(column.key)),
      )
      .flatMap((column) => {
        if (column.display === 'role') {
          return ['role_summary'];
        }
        if (column.display === 'users') {
          return ['member_count', 'member_preview'];
        }
        return [column.dataIndex];
      });
  }
  const columns = resolveColumns();
  return [...new Set([...base[props.resource], ...columns])].join(',');
});
watch(listFields, () => {
  void loadData();
});
const filterController = useManagementFilters(
  () => props.resource,
  config,
  filters,
  async () => {
    if (
      !filterController.filtersDirty.value ||
      !canRead.value ||
      !hasButtonAccess('query')
    )
      return;
    filterController.filtersDirty.value = false;
    if (isCurrentQuery()) return;
    await runSearch();
  },
);
const {
  filtersDirty,
  cancelFilterSearch,
  saveFilterHistory,
  clearBackendFilterSuggestions,
  normalizeMultiFilterValue,
  normalizeTextFilterValue,
} = filterController;
async function runSearch() {
  saveFilterHistory();
  pagination.current = 1;
  await loadData();
}

async function search() {
  if (!hasButtonAccess('query')) return;
  cancelFilterSearch();
  filtersDirty.value = false;
  await runSearch();
}

async function resetSearch() {
  if (!hasButtonAccess('reset-query')) return;
  cancelFilterSearch();
  filtersDirty.value = false;
  resetObject(filters);
  selectedDay.value = '';
  selectedDayKind.value = 'created';
  clearBackendFilterSuggestions();
  await runSearch();
}

function applyRouteFilters() {
  const routeFilters = config.value.filters.flatMap((field) => {
    const queryValue = route.query[field.key];
    const value = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    return typeof value === 'string' && value ? [[field, value] as const] : [];
  });
  if (routeFilters.length === 0) return false;
  resetObject(filters);
  selectedDay.value = '';
  selectedDayKind.value = 'created';
  for (const [field, value] of routeFilters) {
    switch (field.type) {
      case 'category':
      case 'status': {
        filters[field.key] = Number(value);
        break;
      }
      case 'enabled': {
        filters[field.key] = value;
        break;
      }
      case 'status-multi-select': {
        const statuses = value
          .split(',')
          .map(Number)
          .filter((item) => Number.isInteger(item) && item >= 0 && item <= 2);
        filters[field.key] = [...new Set(statuses)];
        break;
      }
      case 'input-multi-select': {
        filters[field.key] = normalizeMultiFilterValue(
          field.key,
          value.split(','),
        );
        break;
      }
      default: {
        filters[field.key] = normalizeTextFilterValue(field.key, value);
      }
    }
  }
  return true;
}

async function loadInitialData() {
  applyRouteFilters();
  await refreshAll();
}

watch(
  () => route.fullPath,
  async () => {
    if (route.path !== `/system/${props.resource}` || !applyRouteFilters()) {
      return;
    }
    pagination.current = 1;
    await loadData();
  },
);

const unlockingUserIDs = new Set<number>();

async function unlockUser(record: Recordable<any>) {
  const id = Number(record.id);
  if (!hasButtonAccess('unlock') || unlockingUserIDs.has(id)) return;
  unlockingUserIDs.add(id);
  try {
    await unlockUserAccount(id);
    message.success($t('system.messages.unlocked'));
    await refreshAll();
  } finally {
    unlockingUserIDs.delete(id);
  }
}

function confirmResetTOTP(record: Recordable<any>) {
  if (!canResetTOTP.value) return;
  confirmSensitiveOperation({
    title: `${buttonLabel('reset-totp', 'verification.reset')} · ${record.username}`,
    content: $t('verification.resetConfirm'),
    onOk: async () => {
      await resetUserTOTPApi(Number(record.id));
      message.success($t('verification.resetSuccess'));
      await (Number(useUserStore().userInfo?.userId) === Number(record.id)
        ? useAuthStore().logout()
        : refreshAll());
    },
  });
}

async function removeRecords(ids: number[], control = 'delete') {
  if (
    !hasButtonAccess(control) ||
    ids.some((id) => {
      const record =
        records.value.find((item) => item.id === id) ??
        (selectedRecord.value?.id === id ? selectedRecord.value : undefined);
      return !record || !canRemoveRecord(record, control);
    })
  )
    return;
  await config.value.api.delete(ids);
  if (['action', 'role', 'user', 'user-group'].includes(props.resource))
    window.dispatchEvent(new Event('auth-permissions-changed'));
  message.success($t('system.messages.deleted'));
  if (records.value.length === ids.length && pagination.current > 1) {
    pagination.current -= 1;
  }
  await refreshAll();
}

function removeSelected() {
  const ids = [...selectedRowKeys.value];
  if (
    ids.length === 0 ||
    loading.value ||
    !hasButtonAccess('delete-selected') ||
    ids.some(
      (id) =>
        !records.value.some(
          (record) => record.id === id && canSelectRecord(record),
        ),
    )
  )
    return;
  confirmSensitiveOperation({
    content: $t('system.confirm.deleteDescription', { count: ids.length }),
    onOk: () => removeRecords(ids, 'delete-selected'),
    title: $t('system.confirm.deleteSelected'),
  });
}

onMounted(loadInitialData);
const recordActions: ManagementRecordActions = {
  openEditor,
  openDetail,
  openApproval,
  openLock,
  unlockUser,
  openResetPassword: (record) => userDialogs.value?.openResetPassword(record),
  confirmResetTOTP,
  confirmRemove,
  removeRecords,
  removeSelected,
};
</script>

<template>
  <Page>
    <div
      ref="tableContainerRef"
      class="system-management-page flex flex-col gap-4"
      :class="{ 'bg-background p-4': isFullscreen }"
    >
      <SystemOverview
        v-if="canRead && props.resource !== 'dictionary'"
        :resource="props.resource"
        :summary="
          props.resource === 'action' && summary
            ? { ...summary, groups: permissionGroups }
            : summary
        "
        :loading="summaryLoading"
        :error="summaryError"
        :days="summaryDays"
        :selected-status="selectedStatus"
        :selected-enabled="filters.enabled"
        :selected-category="filters.category"
        :selected-groups="selectedRoleGroups"
        :selected-has-permissions="filters.has_permissions"
        :selected-has-members="filters.has_members"
        :selected-day="selectedDayKind === 'created' ? selectedDay : undefined"
        :selected-login-day="
          selectedDayKind === 'login' ? selectedDay : undefined
        "
        @retry="loadOverview"
        @days="summaryDays = $event"
        @filter="quickFilter"
        @day="selectDay"
        @login-day="(day) => selectDay(day, 'login')"
        @group="selectUserGroup"
        @permission-group="toggleRolePermissionGroup"
      />
      <Result
        v-if="!canRead"
        status="403"
        :title="$t('system-insights.noAccess')"
        :sub-title="$t('system-insights.noAccessHint')"
      >
        <template #extra>
          <Button v-if="canCreate" type="primary" @click="openEditor()">
            <IconifyIcon icon="lucide:plus" />{{
              buttonLabel('create', 'system.common.create')
            }}
          </Button>
        </template>
      </Result>
      <ManagementCard v-if="canRead" class="system-section-card shrink-0">
        <div
          v-if="
            selectedDay ||
            selectedPermissionGroups.length ||
            selectedRolePermissionLabel ||
            filters.has_members === false
          "
          class="system-active-scope"
          data-testid="management-active-filters"
        >
          <Tag
            color="blue"
            v-if="selectedRolePermissionLabel"
            closable
            data-testid="management-role-permission-filter"
            :aria-label="$t('system-insights.clearPermissionFilter')"
            @close.prevent="
              quickFilter({ key: 'has_permissions', value: undefined })
            "
          >
            <template #closeIcon>
              <button
                type="button"
                class="system-scope-clear"
                :aria-label="$t('system-insights.clearPermissionFilter')"
              >
                <IconifyIcon icon="lucide:x" aria-hidden="true" />
              </button>
            </template>
            {{
              $t('system-insights.permissionFilter', {
                status: selectedRolePermissionLabel,
              })
            }}
          </Tag>
          <Tag
            color="blue"
            v-if="filters.has_members === false"
            closable
            data-testid="management-members-filter"
            @close.prevent="
              quickFilter({ key: 'has_members', value: undefined })
            "
          >
            {{ $t('system-insights.withoutMembers') }}
          </Tag>
          <Tag
            color="blue"
            v-if="selectedDay"
            class="system-day-filter"
            data-testid="management-day-filter"
          >
            {{
              $t(
                selectedDayKind === 'login'
                  ? 'system-insights.loginDayFilter'
                  : 'system-insights.dayFilter',
                { date: selectedDay },
              )
            }}
            <button
              type="button"
              class="system-scope-clear"
              :aria-label="$t('system-insights.clearDay')"
              @click="clearDay"
            >
              <IconifyIcon icon="lucide:x" aria-hidden="true" />
            </button>
          </Tag>
          <Tag
            color="blue"
            v-for="group in selectedPermissionGroups"
            :key="group"
            closable
            data-testid="management-group-filter"
            :aria-label="clearPermissionGroupLabel(group)"
            @close.prevent="clearPermissionGroup(group)"
          >
            <template #closeIcon>
              <button
                type="button"
                class="system-scope-clear"
                :aria-label="clearPermissionGroupLabel(group)"
              >
                <IconifyIcon icon="lucide:x" aria-hidden="true" />
              </button>
            </template>
            {{
              $t(
                props.resource === 'role'
                  ? 'system-insights.roleGroupFilter'
                  : 'system-insights.groupFilter',
                {
                  name: permissionGroupLabel(group),
                },
              )
            }}
          </Tag>
        </div>
        <ManagementFilterForm
          :fields="config.filters"
          :controller="filterController"
          :permissions="permissions"
          :loading="loading"
          @search="search"
          @reset="resetSearch"
        />
      </ManagementCard>

      <div
        v-if="canRead"
        class="system-results-layout"
        :class="{ 'with-group-nav': props.resource === 'action' }"
      >
        <ActionGroupNav
          v-if="props.resource === 'action'"
          :groups="permissionGroups"
          :selected="selectedExactGroups"
          :total="summary?.total"
          editable
          :show-create="hasButtonAccess('create-group')"
          :show-delete="hasButtonAccess('delete-group')"
          :show-edit="hasButtonAccess('edit-group')"
          :allow-reorder="hasButtonAccess('reorder-groups')"
          :loading="summaryLoading"
          @select="selectPermissionGroup"
          @create="openGroupEditor()"
          @edit="openGroupEditor"
          @remove="removeGroup"
        />
        <ManagementResults
          v-model:view-mode="viewMode"
          v-model:visible-column-keys="visibleColumnKeys"
          v-model:selected-row-keys="selectedRowKeys"
          :resource="resource"
          :records="records"
          :columns="config.columns"
          :permissions="permissions"
          :actions="recordActions"
          :loading="loading"
          :load-error="loadError"
          :pagination="pagination"
          :is-fullscreen="isFullscreen"
          @refresh="refreshAll"
          @retry="loadData"
          @fullscreen="toggleFullscreen()"
          @change="handleTableChange"
        />
      </div>
    </div>

    <ManagementRecordPanel
      ref="recordPanel"
      :resource="resource"
      :permissions="permissions"
      :records="records"
      :loading="loading"
      :groups="permissionGroups.map((group) => group.name)"
      :refresh="refreshAll"
      :reset-totp="confirmResetTOTP"
    />
    <ManagementUserDialogs
      v-if="resource === 'user'"
      ref="userDialogs"
      :permissions="permissions"
      :refresh="refreshAll"
    />

    <ActionGroupDialog
      v-if="props.resource === 'action'"
      v-model:open="groupDialogOpen"
      :original-word="editingGroup"
      :existing-words="permissionGroups.map((group) => group.name)"
      @saved="groupSaved"
    />
  </Page>
</template>

<style scoped>
.system-management-page:fullscreen {
  overflow: auto;
}

.system-management-page {
  min-width: 0;
  padding: 3px 0 8px;
}

.system-results-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.system-results-layout.with-group-nav {
  grid-template-columns: 190px minmax(0, 1fr);
}

.system-day-filter {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.system-scope-clear {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: calc(var(--radius) * 0.375);
}

.system-scope-clear :deep(svg) {
  display: block;
  width: 12px;
  height: 12px;
}

.system-scope-clear:hover {
  background: hsl(var(--muted));
}

.system-scope-clear:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

.system-active-scope {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  margin-bottom: 16px;
}

.system-active-scope :deep(.ant-tag) {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 100%;
  padding-inline: 6px;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.system-active-scope :deep(.ant-tag-close-icon) {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  margin-inline-start: 0;
  line-height: 1;
}

@media (max-width: 1000px) {
  .system-results-layout.with-group-nav {
    grid-template-columns: 160px minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .system-results-layout.with-group-nav {
    grid-template-columns: 1fr;
  }
}
</style>
