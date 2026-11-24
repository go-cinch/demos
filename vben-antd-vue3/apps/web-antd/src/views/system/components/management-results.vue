<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type {
  DisplayColumn,
  ManagementRecordActions as RecordActions,
  ResourceKind,
  SystemRecord,
} from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import type { LoadFailure } from '#/api/request-error';

import { computed, ref, toRef } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Checkbox, Pagination, Space } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import Table from '#/components/skeleton-table.vue';
import TableColumnSelector from '#/components/table-column-selector.vue';
import { useOperationConfirmation } from '#/composables/use-operation-confirmation';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import ManagementCard from './management-card.vue';
import ManagementRecordActions from './management-record-actions.vue';
import ManagementRecordCell from './management-record-cell.vue';
import ManagementToolbar from './management-toolbar.vue';
import ManagementViewSwitch from './management-view-switch.vue';
import SystemResourceCards from './system-resource-cards.vue';
import { useManagementTable } from './use-management-table';
const props = defineProps<{
  resource: ResourceKind;
  records: SystemRecord[];
  columns: DisplayColumn[];
  permissions: ManagementPermissions;
  actions: RecordActions;
  loading: boolean;
  loadError: LoadFailure;
  pagination: { current: number; pageSize: number; total: number };
  isFullscreen: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
  retry: [];
  fullscreen: [];
  change: [value: TablePaginationConfig];
}>();
const viewMode = defineModel<'cards' | 'matrix' | 'table'>('viewMode', {
  required: true,
});
const visibleColumnKeys = defineModel<string[]>('visibleColumnKeys', {
  required: true,
});
const selectedRowKeys = defineModel<number[]>('selectedRowKeys', {
  required: true,
});
const tableContainerRef = ref<HTMLElement>();
const managementTableRef = ref<InstanceType<typeof Table>>();
const records = toRef(props, 'records');
const {
  canRead,
  canResetTOTP,
  canCreate,
  canUpdate,
  canDelete,
  canDetail,
  canRemoveRecord,
  canSelectRecord,
  hasButtonAccess,
  buttonLabel,
} = props.permissions;
const {
  openEditor,
  openDetail,
  confirmResetTOTP,
  confirmRemove,
  removeSelected,
} = props.actions;
const confirmation = useOperationConfirmation();
const {
  tableSize,
  tableSettings,
  contentTableColumns,
  tableColumns,
  tableScrollWidth,
  rowSelection,
  tableRowClassName,
  columnOptions,
  showSelectionColumn,
  setVisibleColumns,
} = useManagementTable(
  props,
  computed(() => ({ columns: props.columns })),
  records,
  viewMode,
  visibleColumnKeys,
  selectedRowKeys,
  props.permissions,
  tableContainerRef,
  managementTableRef,
);
const viewOptions = computed(() => [
  props.resource === 'action'
    ? {
        value: 'matrix',
        label: $t('system-insights.matrix'),
        icon: 'lucide:table-properties',
      }
    : {
        value: 'cards',
        label: $t('system-insights.cards'),
        icon: 'lucide:layout-grid',
      },
  { value: 'table', label: $t('system-insights.table'), icon: 'lucide:list' },
]);
const refreshAll = () => emit('refresh');
const loadData = () => emit('retry');
const toggleFullscreen = () => emit('fullscreen');
const handleTableChange = (value: TablePaginationConfig) =>
  emit('change', value);
function selectAllCards(checked: boolean) {
  selectedRowKeys.value = checked
    ? records.value.filter(canSelectRecord).map((record) => record.id)
    : [];
}
</script>
<template>
  <div ref="tableContainerRef" class="min-w-0">
    <ManagementCard class="system-section-card system-results-card">
      <div
        v-if="props.resource !== 'user'"
        class="system-result-caption"
        data-testid="management-result-caption"
      >
        <ManagementViewSwitch
          v-model="viewMode"
          class="system-view-switch"
          test-id="management-view"
          :options="viewOptions"
        />
      </div>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Space wrap>
          <Button v-if="canCreate" type="primary" @click="openEditor()">
            <IconifyIcon icon="lucide:plus" />
            {{ buttonLabel('create', 'system.common.create') }}
          </Button>
          <Button
            v-if="
              (viewMode === 'cards' || showSelectionColumn) &&
              hasButtonAccess('delete-selected') &&
              selectedRowKeys.length > 0
            "
            :disabled="loading"
            danger
            @click="removeSelected"
          >
            {{ buttonLabel('delete-selected', 'system.common.deleteSelected') }}
          </Button>
        </Space>

        <div
          v-if="viewMode === 'cards'"
          class="ml-auto flex items-center gap-2"
        >
          <Button
            v-if="canRead"
            size="small"
            class="management-tool-button"
            :aria-label="$t('system.common.refresh')"
            :title="$t('system.common.refresh')"
            :disabled="loading"
            v-skeleton="loading"
            :aria-busy="loading"
            @click="refreshAll"
          >
            <IconifyIcon icon="lucide:refresh-cw" />
          </Button>
          <Button
            size="small"
            class="management-tool-button"
            :aria-label="$t('system.table.fullscreen')"
            :title="
              $t(
                isFullscreen
                  ? 'system.table.exitFullscreen'
                  : 'system.table.fullscreen',
              )
            "
            @click="toggleFullscreen()"
          >
            <IconifyIcon
              :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'"
            />
          </Button>
        </div>
        <ManagementToolbar
          v-else
          v-model:size="tableSize"
          v-model:bordered="tableSettings.bordered"
          v-model:striped="tableSettings.striped"
          v-model:sticky="tableSettings.sticky"
          :can-read="hasButtonAccess('refresh')"
          :refresh-label="buttonLabel('refresh', 'system.common.refresh')"
          :loading="loading"
          :is-fullscreen="isFullscreen"
          @refresh="refreshAll"
          @fullscreen="toggleFullscreen()"
        >
          <template #columns>
            <TableColumnSelector
              class="w-48"
              :model-value="visibleColumnKeys"
              :options="columnOptions"
              select-all
              @update:model-value="setVisibleColumns"
            />
          </template>
        </ManagementToolbar>
      </div>

      <LoadWarning
        v-if="loadError"
        :failure="loadError"
        data-testid="management-load-error"
        :retry-label="$t('system-insights.retry')"
        retry-size="small"
        @retry="loadData"
      />
      <template v-else-if="viewMode === 'cards'">
        <div class="system-card-selection">
          <Checkbox
            :checked="
              records.filter(canSelectRecord).length > 0 &&
              selectedRowKeys.length === records.filter(canSelectRecord).length
            "
            :indeterminate="
              selectedRowKeys.length > 0 &&
              selectedRowKeys.length < records.filter(canSelectRecord).length
            "
            :disabled="loading"
            :aria-label="$t('system-insights.selectAllPage')"
            @change="selectAllCards($event.target.checked)"
          />
          <span v-if="selectedRowKeys.length">{{
            $t('system-insights.selected', {
              count: selectedRowKeys.length,
            })
          }}</span>
        </div>
        <SystemResourceCards
          :resource="props.resource"
          :records="records"
          :selected-keys="selectedRowKeys"
          :selectable="true"
          :can-update="canUpdate"
          :can-delete="canDelete"
          :can-remove-record="canRemoveRecord"
          :can-select-record="canSelectRecord"
          :can-detail="canDetail"
          :reset-totp-label="
            canResetTOTP
              ? buttonLabel('reset-totp', 'verification.reset')
              : undefined
          "
          :loading="loading"
          @reset-totp="confirmResetTOTP"
          @detail="openDetail"
          @edit="openEditor"
          @remove="confirmRemove"
          @selection="selectedRowKeys = $event"
        />
        <Pagination
          class="system-card-pagination"
          :current="pagination.current"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          show-size-changer
          :show-total="
            (total: number) => $t('system.table.total', { count: total })
          "
          @change="
            (current, pageSize) => handleTableChange({ current, pageSize })
          "
        />
      </template>
      <Table
        v-else
        ref="managementTableRef"
        data-testid="management-table"
        :bordered="tableSettings.bordered"
        :columns="tableColumns"
        :data-source="records"
        :loading="loading"
        :pagination="{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showTotal: (total: number) =>
            $t('system.table.total', { count: total }),
          total: pagination.total,
        }"
        row-key="id"
        :row-class-name="tableRowClassName"
        :row-selection="showSelectionColumn ? rowSelection : undefined"
        :scroll="{ x: tableScrollWidth }"
        :size="tableSize"
        :sticky="tableSettings.sticky"
        :style="
          !contentTableColumns.some((column) => column.key !== 'operation')
            ? { maxWidth: `${tableScrollWidth}px` }
            : undefined
        "
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <ManagementRecordActions
            v-if="column.key === 'operation'"
            :resource="resource"
            :record="record"
            :permissions="permissions"
            :actions="actions"
            :confirmation="confirmation"
          />
          <ManagementRecordCell
            v-else
            :resource="resource"
            :record="record"
            :column="column"
            :view-mode="viewMode"
            :permissions="permissions"
            @detail="openDetail(record, $event)"
          />
        </template>
      </Table>
    </ManagementCard>
  </div>
</template>
<style scoped>
.system-results-card {
  min-width: 0;
}

.system-results-card :deep(.ant-card-body) {
  padding: 18px;
}

.system-result-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.system-view-switch {
  margin-left: auto;
}

.system-card-selection {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 4px 0 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.system-card-pagination {
  display: flex;
  flex-wrap: wrap;
  row-gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

:deep(.system-table-row-striped > td) {
  background-color: rgb(127 127 127 / 6%) !important;
}

:deep(.ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}

:deep(.ant-table-cell) {
  overflow-wrap: anywhere;
  white-space: normal;
}

:deep(.system-table-row-striped > .ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}

@media (max-width: 700px) {
  .system-card-pagination {
    justify-content: flex-start;
  }
}
</style>
