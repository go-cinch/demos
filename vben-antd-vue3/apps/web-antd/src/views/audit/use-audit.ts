import type {
  AuditEvent,
  AuditHeatCell,
  AuditKind,
  AuditParams,
  AuditSummary,
} from '#/api/audit';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { useTimezoneStore, useUserStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import dayjs from 'dayjs';

import { auditApi } from '#/api/audit';
import { useDefaultPageSize } from '#/composables/use-default-page-size';
import { $t } from '#/locales';
export function useAudit(kind: AuditKind) {
  const route = useRoute();
  function profileFilter() {
    return route.path === `/audit/${kind}` && typeof route.query.username === 'string'
      ? route.query.username.trim() : '';
  }
  const { hasAccessByCodes } = useAccess();
  const timezone = useTimezoneStore();
  const user = useUserStore();
  const canRead = computed(() => hasAccessByCodes([`audit.${kind}.read`]));
  const canExport = computed(() => hasAccessByCodes([`audit.${kind}.export`]));
  const days = ref(profileFilter() && route.query.days === '30' ? 30 : 1);
  const module = ref('');
    const q = ref('');
    const result = ref('');
    const sort = ref('newest');
  const exact = ref<{ username?: string; ip?: string; path?: string }>(
    profileFilter() ? { username: profileFilter() } : {},
  );
  const cell = ref<AuditHeatCell>();
  const heatmapDay = ref<AuditHeatCell>();
  const dayHeatmap = ref<AuditSummary>();
  const interval = ref<{ from: number; to: number }>();
  const overview = ref<AuditSummary>();
    const scope = ref<AuditSummary>();
  const page = ref(1);
    const rows = shallowRef<AuditEvent[]>([]);
  const defaultPageSize = useDefaultPageSize();
  const size = ref(defaultPageSize.value);
    const total = ref(0);
  const loading = ref(false);
    const overviewLoading = ref(false);
    const scopeLoading = ref(false);
  const error = ref(false);
    const overviewError = ref(false);
    const scopeError = ref(false);
  const detailError = ref(false);
    const detailLoading = ref(false);
    const selected = shallowRef<AuditEvent>();
    const selectedID = ref<number>();
  const optionsLoading = ref(false);
  const history = ref<string[]>([]);
    const options = ref<Pick<AuditEvent, 'username' | 'ip' | 'path' | 'trace_id'>[]>([]);
  const windowEnd = ref(Date.now());
  const active = ref(true);
  let mounted = false;
  let dayHeatmapKey: string | undefined;
  let detailRun = 0;
    let listRun = 0;
    let optionRun = 0;
    let overviewRun = 0;
    let scopeRun = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let optionTimer: ReturnType<typeof setTimeout> | undefined;
  let displayedFilters: AuditParams | undefined;
  let pendingFilters: AuditParams | undefined;
  const hasScope = computed(() => !!cell.value || !!interval.value);
  const context = computed(() =>
    hasScope.value ? scope.value : overview.value
  );
  const scopeLabel = computed(() => {
    if (cell.value)
      return `${formatDateTime(cell.value.started_at)} — ${formatDateTime(cell.value.ended_at)}`;
    if (interval.value)
      return `${formatDateTime(interval.value.from)} — ${formatDateTime(
        interval.value.to
      )}`;
    return $t(`audit.period${days.value}`);
  });
  function globalParams(): AuditParams {
    const localDate = dayjs(windowEnd.value).tz(timezone.timezone).format('YYYY-MM-DD');
    const firstDate = dayjs.utc(localDate).subtract(days.value - 1, 'day').format('YYYY-MM-DD');
    return {
      from: days.value === 1
        ? windowEnd.value - 86400000
        : dayjs.tz(firstDate, timezone.timezone).valueOf(),
      to: windowEnd.value,
      time_zone: timezone.timezone,
    };
  }
  function scopeParams(): AuditParams {
    return {
      ...globalParams(),
      ...interval.value,
      ...(cell.value ? { from: cell.value.started_at, to: cell.value.ended_at } : {}),
    };
  }
  function filterParams(): AuditParams {
    return {
      ...(q.value.trim() ? { q: q.value.trim() } : {}),
      ...(result.value ? { result: result.value } : {}),
      ...(module.value ? { module: module.value } : {}),
      ...exact.value,
    };
  }
  function recordParams(): AuditParams {
    return { ...scopeParams(), ...filterParams(), sort: sort.value };
  }
  function applyFilters() {
    page.value = 1;
    closeDetail();
    return refresh(false);
  }
  function closeDetail() {
    ++detailRun;
    selected.value = undefined;
    selectedID.value = undefined;
    detailLoading.value = false;
    detailError.value = false;
  }
  async function detail(id: number) {
    const run = ++detailRun;
    selectedID.value = id;
    selected.value = rows.value.find((row) => row.id === id) ?? selected.value;
    detailLoading.value = true;
    detailError.value = false;
    try {
      const data = await auditApi.get(kind, id);
      if (run === detailRun && active.value) selected.value = data;
    } catch {
      if (run === detailRun) detailError.value = true;
    } finally {
      if (run === detailRun) detailLoading.value = false;
    }
  }
  async function loadRecords(resetPage = false) {
    clearTimeout(searchTimer);
    const run = ++listRun;
    if (!canRead.value || !active.value) return;
    if (resetPage) page.value = 1;
    loading.value = true;
    error.value = false;
    const filters = recordParams();
    displayedFilters = undefined;
    pendingFilters = filters;
    try {
      const data = await auditApi.list(kind, {
        ...filters,
        p: page.value,
        s: size.value,
      });
      if (run !== listRun || !active.value) return;
      rows.value = data.items;
      total.value = data.t;
      displayedFilters = filters;
      if (
        selectedID.value &&
        !rows.value.some((e) => e.id === selectedID.value)
      )
        closeDetail();
      if (q.value.trim())
        history.value = [
          q.value.trim(),
          ...history.value.filter((v) => v !== q.value.trim()),
        ].slice(0, 6);
    } catch {
      if (run === listRun) {
        error.value = true;
        rows.value = [];
        total.value = 0;
        closeDetail();
      }
    } finally {
      if (run === listRun) {
        loading.value = false;
        pendingFilters = undefined;
      }
    }
  }
  async function loadScope() {
    const run = ++scopeRun;
    scope.value = undefined;
    scopeError.value = false;
    if (!hasScope.value || !canRead.value || !active.value) {
      scopeLoading.value = false;
      dayHeatmap.value = undefined;
      return;
    }
    scopeLoading.value = true;
    try {
      const params = { ...scopeParams(), ...filterParams() };
      const day = heatmapDay.value;
      const sameDay = day?.started_at === params.from && day?.ended_at === params.to;
      const key = day ? JSON.stringify({ ...filterParams(), from: day.started_at, to: day.ended_at, time_zone: params.time_zone }) : undefined;
      if (key !== dayHeatmapKey) dayHeatmap.value = undefined;
      const needsDay = kind === 'login' && day && !sameDay && !dayHeatmap.value;
      const [data, dayData] = await Promise.all([
        auditApi.summary(kind, {
          ...params,
          f: kind === 'login' ? 'metrics,heatmap,accounts,sources' : 'modules',
        }),
        needsDay ? auditApi.summary(kind, {
          ...params, from: day.started_at, to: day.ended_at, f: 'heatmap',
        }) : undefined,
      ]);
      if (run === scopeRun && active.value) {
        scope.value = data;
        dayHeatmap.value = day ? (sameDay ? data : dayData ?? dayHeatmap.value) : undefined;
        dayHeatmapKey = key;
      }
    } catch {
      if (run === scopeRun) scopeError.value = true;
    } finally {
      if (run === scopeRun) scopeLoading.value = false;
    }
  }
  async function refresh(updateWindow = true) {
    const run = ++overviewRun;
    if (!canRead.value || !active.value) return;
    if (updateWindow) windowEnd.value = Date.now();
    overviewLoading.value = true;
    overviewError.value = false;
    const recordTask = loadRecords();
    // Explicit refreshes and filter changes invalidate the cached parent day.
    dayHeatmap.value = undefined;
    const scopeTask = loadScope();
    try {
      const data = await auditApi.summary(kind, {
        ...globalParams(),
        ...filterParams(),
        f: kind === 'login'
          ? 'metrics,trend,heatmap,accounts,sources'
          : 'metrics,trend,modules',
      });
      if (run === overviewRun && active.value) overview.value = data;
    } catch {
      if (run === overviewRun) {
        overviewError.value = true;
        overview.value = undefined;
      }
    } finally {
      if (run === overviewRun) overviewLoading.value = false;
    }
    await Promise.all([recordTask, scopeTask]);
  }
  function selectCell(value: AuditHeatCell, toggle = true) {
    cell.value =
      toggle && cell.value?.started_at === value.started_at && cell.value.ended_at === value.ended_at
        ? undefined
        : value;
    interval.value = undefined;
    closeDetail();
    return Promise.all([loadScope(), loadRecords(true)]);
  }
  function selectInterval(from: number, to: number) {
    const global = globalParams();
    const end = Math.min(Number(global.to), to);
      const start = Math.max(Number(global.from), from);
    if (end <= start) return;
    interval.value = { from: start, to: end };
    cell.value = undefined;
    closeDetail();
    void loadScope();
    void loadRecords(true);
  }
  function clearScope() {
    cell.value = undefined;
    interval.value = undefined;
    closeDetail();
    void loadScope();
    void loadRecords(true);
  }
  function changePeriod() {
    cell.value = undefined;
    interval.value = undefined;
    page.value = 1;
    closeDetail();
    void refresh();
  }
  function searchSoon() {
    clearTimeout(searchTimer);
    if (
      (pendingFilters ?? displayedFilters)?.q === (q.value.trim() || undefined)
    )
      return;
    searchTimer = setTimeout(applyFilters, 300);
  }
  function reset() {
    q.value = '';
    result.value = '';
    module.value = '';
    sort.value = 'newest';
    exact.value = {};
    cell.value = undefined;
    interval.value = undefined;
    void applyFilters();
  }
  function related(field: 'ip' | 'path' | 'username', value: string, toggle = false) {
    if (!value) return;
    if (toggle && exact.value[field] === value) {
      delete exact.value[field];
    } else {
      exact.value = { ...exact.value, [field]: value };
      q.value = '';
    }
    void applyFilters();
  }
  function removeExact(field: 'ip' | 'path' | 'username') {
    delete exact.value[field];
    void applyFilters();
  }
  function suggest(value: string) {
    const run = ++optionRun;
    clearTimeout(optionTimer);
    options.value = [];
    optionsLoading.value = !!value.trim();
    if (!value.trim()) return;
    optionTimer = setTimeout(async () => {
      if (!canRead.value || !active.value) { optionsLoading.value = false; return; }
      try {
        const filters = recordParams();
        delete filters.q;
        const data = await auditApi.list(kind, {
          ...filters,
          ...(value.trim() ? { q: value.trim() } : {}),
          f: 'username,ip,path,trace_id', p: 1, s: 10,
        });
        if (run === optionRun && active.value) options.value = data.items;
      } catch {
        if (run === optionRun) options.value = [];
      } finally {
        if (run === optionRun) optionsLoading.value = false;
      }
    }, 200);
  }
  watch([exact, cell, interval, days, result, module, () => timezone.timezone], () => {
    ++optionRun;
    optionsLoading.value = false;
    clearTimeout(optionTimer);
    options.value = [];
  }, { deep: true });
  async function exportEvents() {
    if (!canExport.value || !displayedFilters || loading.value) return;
    return auditApi.export(kind, displayedFilters);
  }
  function invalidate() {
    listRun++;
    overviewRun++;
    scopeRun++;
    detailRun++;
    optionRun++;
    optionsLoading.value = false;
    clearTimeout(searchTimer);
    clearTimeout(optionTimer);
  }
  watch(
    () => timezone.timezone,
    () => {
      cell.value = undefined;
      interval.value = undefined;
      page.value = 1;
      closeDetail();
      void refresh(false);
    }
  );
  watch(
    () => user.userInfo?.userId,
    () => {
      invalidate();
      rows.value = [];
      total.value = 0;
      overview.value = undefined;
      scope.value = undefined;
      options.value = [];
      history.value = [];
      exact.value = {};
      cell.value = undefined;
      interval.value = undefined;
      q.value = '';
      displayedFilters = undefined;
      pendingFilters = undefined;
      closeDetail();
      if (user.userInfo && active.value) void refresh();
    }
  );
  watch(canRead, (allowed) => {
    if (allowed) void refresh();
    else {
      invalidate();
      rows.value = [];
      overview.value = undefined;
      scope.value = undefined;
      displayedFilters = undefined;
      closeDetail();
    }
  });
  watch(() => [route.path, route.query.username, route.query.days], () => {
    if (route.path !== `/audit/${kind}` || !profileFilter()) return;
    exact.value = { username: profileFilter() };
    if (route.query.days === '30') days.value = 30;
    cell.value = undefined;
    interval.value = undefined;
    q.value = '';
    result.value = '';
    module.value = '';
    page.value = 1;
    closeDetail();
    if (active.value && mounted) void refresh();
  });
  watch(defaultPageSize, (value) => {
    size.value = value;
    page.value = 1;
    closeDetail();
    void loadRecords();
  });
  onMounted(() => {
    mounted = true;
    void refresh();
  });
  onDeactivated(() => {
    active.value = false;
    invalidate();
  });
  onActivated(() => {
    if (mounted && !active.value) {
      active.value = true;
      void refresh();
    }
  });
  onBeforeUnmount(invalidate);
  return {
    canRead,
    canExport,
    timezone,
    days,
    q,
    result,
    module,
    sort,
    exact,
    cell,
    heatmapDay,
    dayHeatmap,
    interval,
    overview,
    scope,
    context,
    rows,
    page,
    size,
    total,
    loading,
    overviewLoading,
    scopeLoading,
    error,
    overviewError,
    scopeError,
    selected,
    selectedID,
    detailLoading,
    detailError,
    options,
    optionsLoading,
    history,
    hasScope,
    scopeLabel,
    refresh,
    loadRecords,
    applyFilters,
    loadScope,
    detail,
    closeDetail,
    selectCell,
    selectInterval,
    clearScope,
    changePeriod,
    searchSoon,
    reset,
    related,
    removeExact,
    suggest,
    exportEvents,
  };
}
