import type { TablePaginationConfig } from 'ant-design-vue';

import type { ComputedRef, Ref } from 'vue';

import type {
  FormModel,
  ResourceConfig,
  ResourceKind,
  SystemRecord,
} from './management-types';

import type { PageParams } from '#/api';
import type { SystemSummary } from '#/api/system/insights';

import {
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  reactive,
  ref,
  watch,
} from 'vue';

import { useTimezoneStore } from '@vben/stores';

import { getSystemSummary } from '#/api/system/insights';
import { useDefaultPageSize } from '#/composables/use-default-page-size';
export function useManagementData(options: {
  resource: () => ResourceKind;
  config: ComputedRef<ResourceConfig>;
  canRead: Ref<boolean>;
  filters: FormModel;
  fields: () => string;
  clearDetails: () => void;
  onOverview: (summary: SystemSummary) => void;
  onRangeChange: () => void;
}) {
  const { config, canRead, filters } = options;
  const loading = ref(false);
  const records = ref<SystemRecord[]>([]);
  const selectedRowKeys = ref<number[]>([]);
  const loadError = ref(false);
  const summary = ref<SystemSummary>();
  const summaryLoading = ref(false);
  const summaryError = ref(false);
  const summaryDays = ref(14);
  const timezone = useTimezoneStore();
  const defaultPageSize = useDefaultPageSize();
  const pagination = reactive({
    current: 1,
    pageSize: defaultPageSize.value,
    total: 0,
  });
  let listRequest = 0;
  let lastLoadedQuery = '';
  let pendingListQuery = '';
  let summaryRequest = 0;
  let active = true;
  async function loadOverview() {
    const request = ++summaryRequest;
    if (!canRead.value || !active) {
      summary.value = undefined;
      summaryLoading.value = false;
      return;
    }
    summaryLoading.value = true;
    summaryError.value = false;
    try {
      const result = await getSystemSummary(
        options.resource(),
        options.resource() === 'user'
          ? { days: summaryDays.value, time_zone: timezone.timezone }
          : {},
      );
      if (request === summaryRequest && active) {
        summary.value = result;
        options.onOverview(result);
      }
    } catch {
      if (request === summaryRequest && active) {
        summary.value = undefined;
        summaryError.value = true;
      }
    } finally {
      if (request === summaryRequest) summaryLoading.value = false;
    }
  }
  async function refreshAll() {
    await Promise.all([loadData(), loadOverview()]);
  }
  function buildListParams(pageNumber = pagination.current): PageParams {
    const params: PageParams = {
      f: options.fields(),
      p: pageNumber,
      s: pagination.pageSize,
    };
    for (const [key, value] of Object.entries(filters).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (key === 'groups_exact') {
        if (
          (Array.isArray(filters.groups_exact) ? filters.groups_exact : [])
            .length
        )
          params.groups_exact = JSON.stringify(
            Array.isArray(filters.groups_exact) ? filters.groups_exact : [],
          );
      } else if (key === 'groups_all') {
        if (
          (Array.isArray(filters.groups_all) ? filters.groups_all : []).length
        )
          params.groups_all = JSON.stringify(
            Array.isArray(filters.groups_all) ? filters.groups_all : [],
          );
      } else if (Array.isArray(value)) {
        const joined = value
          .filter((item) =>
            ['boolean', 'number', 'string'].includes(typeof item),
          )
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join(',');
        if (joined) params[key] = joined;
      } else if ((value !== '' || key === 'group_exact') && value !== undefined)
        params[key] = value as boolean | number | string;
    }
    return params;
  }
  function listQueryKey(params: PageParams) {
    return JSON.stringify([options.resource(), params]);
  }

  async function loadData() {
    const request = ++listRequest;
    selectedRowKeys.value = [];
    if (!canRead.value || !active) {
      records.value = [];
      pagination.total = 0;
      loading.value = false;
      return;
    }
    loading.value = true;
    loadError.value = false;
    try {
      const params = buildListParams();
      const key = listQueryKey(params);
      pendingListQuery = key;
      const result = await config.value.api.list(params);
      if (request !== listRequest || !active) return;
      lastLoadedQuery = key;
      records.value = result.items.map((item) =>
        'role_summary' in item
          ? ({ ...item, role: item.role_summary ?? undefined } as SystemRecord)
          : item,
      );
      pagination.total = result.t;
      selectedRowKeys.value = [];
    } catch {
      if (request === listRequest && active) {
        lastLoadedQuery = '';
        records.value = [];
        pagination.total = 0;
        selectedRowKeys.value = [];
        options.clearDetails();
        loadError.value = true;
      }
    } finally {
      if (request === listRequest) {
        loading.value = false;
        pendingListQuery = '';
      }
    }
  }

  function handleTableChange(value: TablePaginationConfig) {
    pagination.current = value.current ?? 1;
    pagination.pageSize = value.pageSize ?? pagination.pageSize;
    loadData();
  }

  watch(canRead, (value) => {
    if (value && active) void refreshAll();
    else {
      ++listRequest;
      ++summaryRequest;
      records.value = [];
      summary.value = undefined;
      options.clearDetails();
      loading.value = false;
      summaryLoading.value = false;
    }
  });

  watch(defaultPageSize, (value) => {
    pagination.pageSize = value;
    pagination.current = 1;
    void loadData();
  });

  watch([summaryDays, () => timezone.timezone], () => {
    if (options.resource() !== 'user') return;
    summary.value = undefined;
    summaryError.value = false;
    options.onRangeChange();
    void loadOverview();
  });
  function suspend() {
    active = false;
    listRequest += 1;
    summaryRequest += 1;
  }
  onDeactivated(suspend);
  onBeforeUnmount(suspend);
  onActivated(() => {
    if (!active) {
      active = true;
      void refreshAll();
    }
  });
  function isCurrentQuery(page = 1) {
    const key = listQueryKey(buildListParams(page));
    return key === lastLoadedQuery || key === pendingListQuery;
  }
  return {
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
  };
}
