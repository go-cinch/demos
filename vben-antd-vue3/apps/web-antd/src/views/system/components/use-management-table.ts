import type { TableColumnsType } from 'ant-design-vue';

import type { ComputedRef, Ref } from 'vue';

import type {
  DisplayColumn,
  ResourceConfig,
  ResourceKind,
  SystemRecord,
  TableSize,
} from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import { computed, reactive, ref, watch } from 'vue';

import { useResizeObserver } from '@vueuse/core';

import Table from '#/components/skeleton-table.vue';
import { $t } from '#/locales';

import { memberPreview } from './system-record-format';
import { useManagementFormatting } from './use-management-formatting';
export function useManagementTable(
  props: { resource: ResourceKind },
  config: ComputedRef<Pick<ResourceConfig, 'columns'>>,
  records: Ref<SystemRecord[]>,
  viewMode: Ref<string>,
  visibleColumnKeys: Ref<string[]>,
  selectedRowKeys: Ref<number[]>,
  permissions: ManagementPermissions,
  tableContainerRef: Ref<HTMLElement | undefined>,
  managementTableRef: Ref<InstanceType<typeof Table> | undefined>,
) {
  const { canRead, canUpdate, canDelete, canSelectRecord } = permissions;
  const { columnValue, formatDate, formatJSON, resourceRules, statusLabel } =
    useManagementFormatting(() => props.resource);
  const tableSize = ref<TableSize>('middle');
  const tableSettings = reactive({
    bordered: true,
    sticky: true,
    striped: true,
  });
  const selectionColumnKey = '__selection__';
  const selectionColumnWidth = 48;
  const adaptiveColumnMinWidth = 72;
  const adaptiveColumnMaxWidth = 560;
  const metadataColumnMaxWidth = 320;
  const matrixColumnKeys = ['name', 'menu', 'resource', 'button'];
  const displayColumns = computed(() =>
    props.resource === 'action' && viewMode.value === 'matrix'
      ? matrixColumnKeys.flatMap((key) => {
          const column = config.value.columns.find((item) => item.key === key);
          const titles: Record<string, string> = {
            menu: 'permission-display.relatedMenus',
            resource: 'action-editor.operation',
            button: 'action-editor.features',
          };
          return column
            ? [
                {
                  ...column,
                  title: titles[key] ? $t(titles[key]!) : column.title,
                },
              ]
            : [];
        })
      : config.value.columns,
  );
  const columnOptions = computed(() => [
    { label: $t('system.common.selection'), value: selectionColumnKey },
    ...displayColumns.value.map((column) => ({
      label: column.title,
      value: column.key,
    })),
  ]);
  const showSelectionColumn = computed(() =>
    visibleColumnKeys.value.includes(selectionColumnKey),
  );
  const allColumnsSelected = computed(() =>
    columnOptions.value.every((column) =>
      visibleColumnKeys.value.includes(column.value),
    ),
  );
  const columnsIndeterminate = computed(
    () =>
      columnOptions.value.some((column) =>
        visibleColumnKeys.value.includes(column.value),
      ) && !allColumnsSelected.value,
  );

  function adaptiveColumnValues(
    column: DisplayColumn,
    record: SystemRecord,
  ): string[] {
    if (column.display === 'actions') {
      return 'action_codes' in record && Array.isArray(record.action_codes)
        ? record.action_codes
        : [];
    }
    if (column.display === 'users') {
      return memberPreview(record).map((user) => user.username);
    }
    if (column.display === 'resource-rules') {
      return resourceRules(columnValue(record, column));
    }
    if (column.display === 'json') {
      return formatJSON(columnValue(record, column)).split('\n');
    }
    const value = columnValue(record, column);
    if (column.display === 'date') return [formatDate(value)];
    if (column.display === 'role') {
      return [
        value && typeof value === 'object' && 'name' in value
          ? String(value.name)
          : '-',
      ];
    }
    if (column.display === 'status') return [statusLabel(value) || '-'];
    if (column.display === 'boolean') {
      return [$t(value ? 'system.enabled.yes' : 'system.enabled.no')];
    }
    if (column.display === 'category') {
      return [
        $t(value === 0 ? 'system.category.permission' : 'system.category.jwt'),
      ];
    }
    return [
      value === null || value === undefined || value === ''
        ? '-'
        : String(value),
    ];
  }

  function estimatedTagWidth(value: string, maximumWidth: number) {
    let textWidth = 0;
    for (const character of value) {
      textWidth += (character.codePointAt(0) ?? 0) > 255 ? 14 : 8;
    }
    return Math.min(maximumWidth, Math.max(48, textWidth + 18));
  }

  function adaptiveColumnWidth(column: DisplayColumn) {
    const maximumColumnWidth =
      column.width ??
      (column.display === 'json'
        ? metadataColumnMaxWidth
        : adaptiveColumnMaxWidth);
    let widestRow = Math.min(
      maximumColumnWidth,
      Math.max(
        adaptiveColumnMinWidth,
        estimatedTagWidth(column.title, maximumColumnWidth) + 14,
      ),
    );
    const usesLongestValue =
      column.display === 'json' || column.display === 'resource-rules';
    const maximumValueWidth = usesLongestValue ? maximumColumnWidth - 32 : 220;
    for (const record of records.value) {
      const values = adaptiveColumnValues(column, record);
      if (values.length === 0) continue;
      let tagsWidth = 0;
      for (const value of values) {
        const tagWidth = estimatedTagWidth(value, maximumValueWidth);
        tagsWidth = usesLongestValue
          ? Math.max(tagsWidth, tagWidth)
          : tagsWidth + tagWidth;
      }
      const gapsWidth = usesLongestValue
        ? 0
        : Math.max(0, values.length - 1) * 8;
      widestRow = Math.max(widestRow, tagsWidth + gapsWidth + 32);
    }

    return Math.min(widestRow, maximumColumnWidth);
  }

  const operationActions = ref<HTMLElement[]>([]);
  const operationContentWidth = ref(0);
  const tableViewportWidth = ref(0);
  useResizeObserver(
    () => {
      const root = managementTableRef.value?.$el as HTMLElement | undefined;
      return root?.querySelector<HTMLElement>('.ant-table-container');
    },
    ([entry]) => {
      tableViewportWidth.value = Math.floor(entry?.contentRect.width ?? 0);
    },
  );
  // Reserve the page's complete action set even when a particular row has fewer actions.
  const operationColumnWidth = computed(() => {
    const labels = [
      ...(canRead.value ? [$t('system-insights.details')] : []),
      ...(canUpdate.value ? [$t('system.common.edit')] : []),
      ...(canUpdate.value && props.resource === 'user'
        ? [
            [
              $t('system.user.approve'),
              $t('system.user.lock'),
              $t('system.user.unlock'),
            ].sort((a, b) => b.length - a.length)[0]!,
          ]
        : []),
      ...(canDelete.value ? [$t('system.common.delete')] : []),
      ...(canRead.value && props.resource === 'user' ? [$t('mfa.reset')] : []),
    ];
    const textWidth = labels.reduce(
      (total, label) => total + estimatedTagWidth(label, 1000) - 18 + 16,
      0,
    );
    return Math.max(
      textWidth + Math.max(0, labels.length - 1) * 8 + 32,
      operationContentWidth.value,
    );
  });

  function measureOperationActions() {
    operationContentWidth.value = Math.max(
      0,
      ...operationActions.value.map((element) => {
        if (!element.isConnected) return 0;
        const cell = element.closest('td');
        if (!cell) return 0;
        const style = window.getComputedStyle(cell);
        return Math.ceil(
          element.getBoundingClientRect().width +
            (Number.parseFloat(style.paddingLeft) || 0) +
            (Number.parseFloat(style.paddingRight) || 0),
        );
      }),
    );
  }

  watch(
    [
      records,
      viewMode,
      tableSize,
      canRead,
      canUpdate,
      canDelete,
      tableContainerRef,
      visibleColumnKeys,
      () => tableSettings.sticky,
    ],
    () => {
      operationActions.value = [
        ...(tableContainerRef.value?.querySelectorAll<HTMLElement>(
          '.system-operation-actions',
        ) ?? []),
      ];
      measureOperationActions();
    },
    { flush: 'post' },
  );
  useResizeObserver(operationActions, measureOperationActions);

  const contentTableColumns = computed<TableColumnsType<SystemRecord>>(() => {
    const matrix = props.resource === 'action' && viewMode.value === 'matrix';
    const columns: TableColumnsType<SystemRecord> = displayColumns.value
      .filter((column) =>
        matrix
          ? ['button', 'menu', 'name', 'resource'].includes(column.key) &&
            visibleColumnKeys.value.includes(column.key)
          : visibleColumnKeys.value.includes(column.key),
      )
      .map((column) => ({
        ...column,
        width: matrix
          ? ({ name: 180, resource: 140, menu: 150, button: 240 }[column.key] ??
            120)
          : adaptiveColumnWidth(column),
      }));
    if (canRead.value || canUpdate.value || canDelete.value)
      columns.push({
        fixed: 'right',
        key: 'operation',
        title: $t('system.common.actions'),
        width: operationColumnWidth.value,
      });
    return columns;
  });

  const tableColumns = computed(() => {
    const columns = contentTableColumns.value;
    const dataWidth = columns.reduce(
      (total, column) =>
        total + (column.key === 'operation' ? 0 : Number(column.width)),
      0,
    );
    if (!dataWidth) return columns;
    const fixedWidth =
      (showSelectionColumn.value ? selectionColumnWidth : 0) +
      (columns.some((column) => column.key === 'operation')
        ? operationColumnWidth.value
        : 0);
    // Distribute spare width across data columns, keeping action buttons compact.
    let remainingWidth = Math.max(
      dataWidth,
      tableViewportWidth.value - fixedWidth,
    );
    let remainingContentWidth = dataWidth;
    return columns.map((column) => {
      if (column.key === 'operation') return column;
      const contentWidth = Number(column.width);
      const width = Math.round(
        (contentWidth / remainingContentWidth) * remainingWidth,
      );
      remainingWidth -= width;
      remainingContentWidth -= contentWidth;
      return { ...column, width };
    });
  });

  const tableScrollWidth = computed(() => {
    let width = showSelectionColumn.value ? selectionColumnWidth : 0;
    for (const column of contentTableColumns.value) {
      if ('width' in column && typeof column.width === 'number') {
        width += column.width;
      }
    }
    return width;
  });

  const rowSelection = computed(() => ({
    columnWidth: selectionColumnWidth,
    onChange: (keys: (number | string)[]) => {
      selectedRowKeys.value = keys
        .map(Number)
        .filter((id) =>
          records.value.some(
            (record) => record.id === id && canSelectRecord(record),
          ),
        );
    },
    selectedRowKeys: selectedRowKeys.value,
    getCheckboxProps: (record: SystemRecord) => ({
      disabled: !canSelectRecord(record),
    }),
  }));

  function tableRowClassName(_record: SystemRecord, index: number) {
    return tableSettings.striped && index % 2 === 1
      ? 'system-table-row-striped'
      : '';
  }

  function toggleAllColumns() {
    const keys = new Set(visibleColumnKeys.value);
    const selected = allColumnsSelected.value;
    for (const option of columnOptions.value) {
      if (selected) keys.delete(option.value);
      else keys.add(option.value);
    }
    visibleColumnKeys.value = [...keys];
    if (!showSelectionColumn.value) selectedRowKeys.value = [];
  }

  function toggleColumn(key: string) {
    visibleColumnKeys.value = visibleColumnKeys.value.includes(key)
      ? visibleColumnKeys.value.filter((item) => item !== key)
      : [...visibleColumnKeys.value, key];
    if (key === selectionColumnKey && !showSelectionColumn.value) {
      selectedRowKeys.value = [];
    }
  }

  return {
    tableSize,
    tableSettings,
    contentTableColumns,
    tableColumns,
    tableScrollWidth,
    rowSelection,
    tableRowClassName,
    columnOptions,
    allColumnsSelected,
    columnsIndeterminate,
    showSelectionColumn,
    toggleAllColumns,
    toggleColumn,
  };
}
