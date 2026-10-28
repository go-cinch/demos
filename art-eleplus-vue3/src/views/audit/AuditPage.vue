<script setup lang="ts">
  import { useStatisticsWarning } from '@/utils/admin/statistics-warning'
  import { computed, ref, watch } from 'vue'
  import { $t } from '@/locales'
  import { useAudit } from './use-audit'
  import { adminDate, type AuditHeatCell, type AuditEvent } from '@/utils/admin/model'
  import AuditHeatmap from './AuditHeatmap.vue'
  import AuditTrend from './AuditTrend.vue'
  import AuditDetail from './AuditDetail.vue'
  import ResultToolbar from '@/views/system/components/ResultToolbar.vue'
  const props = defineProps<{ kind: 'login' | 'operation' }>()
  const a = useAudit(props.kind)
  const {
    days,
    q,
    result,
    module,
    sort,
    exact,
    cell,
    heatmapDay,
    dayHeatmap,
    heatmapPlaceholder,
    overview,
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
    history,
    canRead,
    canExport,
    hasScope,
    timezone
  } = a
  const text = (key: string, params: Record<string, string | number> = {}) =>
    $t(`pc.audit.${key}`, params)
  const expanded = ref(false),
    view = ref('heat'),
    level = ref<'day' | 'hour'>('day'),
    exporting = ref(false),
    exportError = ref(false)
  const root = ref<HTMLElement>(),
    fullscreen = ref(false),
    tableSize = ref<'small' | 'default' | 'large'>('default'),
    visible = ref([
      'occurred_at',
      'username',
      'status',
      'ip',
      ...(props.kind === 'operation' ? ['module', 'path', 'duration_ms'] : ['user_agent'])
    ]),
    bordered = ref(false),
    striped = ref(false)
  watch(
    visible,
    (keys) => {
      a.listFields.value = [
        ...new Set([
          'id',
          'occurred_at',
          ...(props.kind === 'operation' ? ['module', 'method', 'path'] : []),
          ...keys
        ])
      ].join(',')
    },
    { immediate: true, deep: true }
  )
  const fields = computed(() => visible.value.map((key) => ({ key, title: text(key) })))
  const heatData = computed(() =>
    level.value === 'hour' && heatmapDay.value
      ? (dayHeatmap.value?.heatmap ?? [])
      : overviewLoading.value || (!overview.value && !overviewError.value)
        ? heatmapPlaceholder.value
        : (overview.value?.heatmap ?? [])
  )
  const metricItems = computed(() => [
    { key: 'total', value: overview.value?.total ?? 0 },
    { key: 'successRate', value: `${Math.round(overview.value?.success_rate ?? 0)}%` },
    { key: 'failed', value: overview.value?.failed ?? 0 },
    { key: 'uniqueUsers', value: overview.value?.unique_users ?? 0 },
    { key: 'p95', value: `${Math.round(overview.value?.p95_ms ?? 0)} ms` }
  ])
  const ranks = computed(() =>
    props.kind === 'login'
      ? [
          {
            key: 'accounts',
            title: 'failedAccounts',
            field: 'username' as const,
            rows: context.value?.accounts ?? []
          },
          {
            key: 'sources',
            title: 'sourceFocus',
            field: 'ip' as const,
            rows: context.value?.sources ?? []
          }
        ]
      : [
          {
            key: 'modules',
            title: 'moduleDistribution',
            field: undefined,
            rows: context.value?.modules ?? []
          }
        ]
  )
  function selectHeat(value: AuditHeatCell) {
    if (days.value === 30 && level.value === 'day') heatmapDay.value = value
    void a.selectCell(value)
  }
  function changePeriod() {
    level.value = 'day'
    heatmapDay.value = undefined
    a.changePeriod()
  }
  function changeLevel() {
    if (level.value === 'day' && heatmapDay.value) void a.selectCell(heatmapDay.value, false)
  }
  const hoveredHeatCell = ref<AuditHeatCell>()
  let wheelLockedUntil = 0,
    wheelDelta = 0,
    lastWheelAt = 0
  watch(cell, (value) => {
    if (!value) {
      heatmapDay.value = undefined
      hoveredHeatCell.value = undefined
      level.value = 'day'
    }
  })
  async function wheel(event: WheelEvent) {
    if (
      days.value !== 30 ||
      view.value !== 'heat' ||
      overviewLoading.value ||
      overviewError.value ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    )
      return
    const target = level.value === 'day' ? hoveredHeatCell.value : undefined
    const day = target ?? heatmapDay.value
    if (!day) return
    const now = performance.now()
    if (now < wheelLockedUntil) {
      event.preventDefault()
      return
    }
    const next = event.deltaY < 0 ? 'hour' : 'day'
    if (next === level.value) return
    event.preventDefault()
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 312 : 1)
    if (now - lastWheelAt > 180 || Math.sign(delta) !== Math.sign(wheelDelta)) wheelDelta = 0
    lastWheelAt = now
    wheelDelta += delta
    if (Math.abs(wheelDelta) < 30) return
    wheelDelta = 0
    wheelLockedUntil = now + 600
    if (next === 'hour') {
      heatmapDay.value = day
      await a.selectCell(day, false)
      if (
        days.value !== 30 ||
        view.value !== 'heat' ||
        heatmapDay.value?.started_at !== day.started_at
      )
        return
      level.value = 'hour'
    } else {
      level.value = 'day'
      changeLevel()
    }
    hoveredHeatCell.value = undefined
  }
  function suggest(query: string, callback: (items: Array<Record<string, unknown>>) => void) {
    void a.suggest(query).then((values) => {
      // An older response must never replace suggestions for the current input.
      if (q.value.trim() !== query.trim()) return
      const needle = query.trim().toLocaleLowerCase()
      const matches = values.flatMap((event, index) =>
        ['username', 'ip', 'path', 'trace_id']
          .filter(
            (key) =>
              needle &&
              String(event[key as keyof typeof event] ?? '')
                .toLocaleLowerCase()
                .includes(needle)
          )
          .map((key) => ({ value: String(event[key as keyof typeof event]), field: key, index }))
      )
      callback([
        ...new Map(matches.map((item) => [`${item.field}:${item.value}`, item])).values(),
        ...history.value
          .filter((value) => value.toLocaleLowerCase().includes(needle))
          .map((value) => ({ value, field: 'search' }))
      ])
    })
  }
  function segments(value: string) {
    const needle = q.value.trim()
    if (!needle) return [{ text: value, match: false }]
    const index = value.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase())
    return index < 0
      ? [{ text: value, match: false }]
      : [
          { text: value.slice(0, index), match: false },
          { text: value.slice(index, index + needle.length), match: true },
          { text: value.slice(index + needle.length), match: false }
        ]
  }
  async function download() {
    exporting.value = true
    exportError.value = false
    try {
      const csv = await a.exportEvents()
      if (csv === undefined) return
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
        anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `audit-${props.kind}-${adminDate(Date.now(), timezone.timezone).slice(0, 13).replace(' ', '-')}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      exportError.value = true
    } finally {
      exporting.value = false
    }
  }
  function selectRecord(row: AuditEvent) {
    void a.detail(row.id)
    if (props.kind === 'login') expanded.value = true
  }
  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await root.value?.requestFullscreen()
      fullscreen.value = true
    } else {
      await document.exitFullscreen()
      fullscreen.value = false
    }
  }
  const showOverviewWarning = useStatisticsWarning(overviewError)
  const showScopeWarning = useStatisticsWarning(scopeError)
</script>
<template>
  <div ref="root" class="audit-page" :class="{ fullscreen }" data-testid="audit-page"
    ><ElAlert v-if="!canRead" :title="text('noAccess')" type="warning" :closable="false" /><template
      v-else
      ><ElCard shadow="never"
        ><div class="section-heading"
          ><h2>{{ text(kind) }}</h2
          ><ElRadioGroup v-model="days" :aria-label="text('period')" @change="changePeriod"
            ><ElRadioButton v-for="value in [1, 7, 30]" :key="value" :value="value">{{
              text(`period${value}`)
            }}</ElRadioButton></ElRadioGroup
          ></div
        ><ElAlert
          v-if="showOverviewWarning"
          :title="text('loadError')"
          type="error"
          :closable="false"
          ><ElButton @click="a.refresh()">{{ text('retry') }}</ElButton></ElAlert
        ><div class="audit-metrics" :aria-busy="overviewLoading"
          ><div v-for="metric in metricItems" :key="metric.key"
            ><span>{{ text(metric.key) }}</span
            ><strong>{{ overviewLoading || overviewError ? '—' : metric.value }}</strong></div
          ></div
        ><div class="success-rate"
          ><div :style="{ width: `${overview?.success_rate ?? 0}%` }" /></div
      ></ElCard>
      <div class="audit-visuals"
        ><ElCard shadow="never"
          ><div class="section-heading"
            ><h3>{{ text(kind === 'login' && view === 'heat' ? 'heatmap' : 'trend') }}</h3
            ><div class="view-controls"
              ><ElRadioGroup v-if="kind === 'login'" v-model="view" size="small"
                ><ElRadioButton value="heat">{{ text('heatView') }}</ElRadioButton
                ><ElRadioButton value="trend">{{ text('trendView') }}</ElRadioButton></ElRadioGroup
              ><ElRadioGroup
                v-if="days === 30 && heatmapDay && view === 'heat'"
                v-model="level"
                size="small"
                :aria-label="text('heatmapLevel')"
                @change="changeLevel"
                ><ElRadioButton value="day">{{ text('dayView') }}</ElRadioButton
                ><ElRadioButton value="hour">{{ text('hourView') }}</ElRadioButton></ElRadioGroup
              ></div
            ></div
          ><ElSkeleton
            v-if="overviewLoading && !(kind === 'login' && view === 'heat')"
            animated
            :rows="8"
            class="visual-skeleton" /><div
            v-else-if="kind === 'login' && view === 'heat'"
            @wheel="wheel"
            ><AuditHeatmap
              :data="heatData"
              :days="days"
              :selected="cell"
              :drill-day="level === 'hour' ? heatmapDay : undefined"
              :result="result"
              :loading="!overviewError && (overviewLoading || (level === 'hour' && scopeLoading))"
              @select="selectHeat"
              @hover="(value) => (hoveredHeatCell = value)" /></div
          ><AuditTrend
            v-else
            :summary="overview"
            :result="result"
            :timezone="timezone.timezone"
            @scope="a.selectInterval"
        /></ElCard>
        <ElCard shadow="never" :aria-label="text('insight')"
          ><h3>{{ text('insight') }}</h3
          ><div class="scope-title"
            ><template v-if="hasScope"
              ><span>{{
                adminDate(
                  a.scope.value?.from ?? cell?.started_at ?? a.interval.value?.from,
                  timezone.timezone
                )
              }}</span
              ><span>—</span
              ><span>{{
                adminDate(
                  a.scope.value?.to ?? cell?.ended_at ?? a.interval.value?.to,
                  timezone.timezone
                )
              }}</span
              ><ElButton text @click="a.clearScope()">{{ text('allPeriods') }}</ElButton></template
            ><span v-else>{{ text(`period${days}`) }}</span></div
          ><ElAlert
            v-if="showScopeWarning"
            :title="text('loadError')"
            type="error"
            :closable="false"
          /><section v-for="rank in ranks" :key="rank.key" class="rank-section"
            ><h4>{{ text(rank.title) }} · {{ text('topEntries', { count: 10 }) }}</h4
            ><div v-loading="scopeLoading" class="rank-list"
              ><button
                v-for="entry in rank.rows.slice(0, 10)"
                :key="entry.name"
                type="button"
                :aria-pressed="
                  rank.field ? exact[rank.field] === entry.name : module === entry.name
                "
                @click="
                  rank.field
                    ? a.related(rank.field, entry.name, true)
                    : ((module = module === entry.name ? '' : entry.name), a.applyFilters())
                "
                ><span>{{ entry.name || text('anonymous') }}</span
                ><b>{{ rank.key === 'accounts' ? entry.failed : entry.total }}</b></button
              ><p v-if="!rank.rows.length">{{
                text(rank.key === 'accounts' ? 'noFailures' : 'empty')
              }}</p></div
            ></section
          ></ElCard
        ></div
      >
      <ElCard shadow="never"
        ><div class="filter-tags"
          ><ElTag v-for="(value, key) in exact" :key="key" closable @close="a.removeExact(key)"
            >{{ text(key) }}: {{ value }}</ElTag
          ><ElTag v-if="hasScope" closable @close="a.clearScope()">{{
            text('selectedPeriod')
          }}</ElTag></div
        ><ElForm inline @submit.prevent="a.applyFilters()"
          ><ElFormItem :label="text('search')"
            ><ElAutocomplete
              v-model="q"
              :aria-label="text('search')"
              :placeholder="text('searchHint')"
              :fetch-suggestions="suggest"
              :debounce="200"
              clearable
              class="audit-search"
              @clear="
                () => {
                  void a.suggest('')
                }
              "
              @blur="a.searchSoon"
              @select="a.applyFilters()"
              @keyup.enter="a.applyFilters()"
              ><template #default="{ item }"
                ><span class="suggestion-label">{{ text(item.field) }}: </span
                ><span
                  v-for="(segment, index) in segments(item.value)"
                  :key="index"
                  :class="{ match: segment.match }"
                  >{{ segment.text }}</span
                ></template
              ></ElAutocomplete
            ></ElFormItem
          ><ElFormItem :label="text('status')"
            ><ElSelect
              v-model="result"
              :aria-label="text('status')"
              class="audit-select"
              @change="a.applyFilters()"
              ><ElOption
                v-for="value in ['', 'success', 'failure']"
                :key="value"
                :value="value"
                :label="text(value || 'all')" /></ElSelect></ElFormItem
          ><ElFormItem v-if="kind === 'operation'" :label="text('module')"
            ><ElSelect
              v-model="module"
              :aria-label="text('module')"
              class="audit-select"
              @change="a.applyFilters()"
              ><ElOption
                v-for="value in [
                  '',
                  'auth',
                  'user',
                  'role',
                  'action',
                  'user-group',
                  'dictionary',
                  'whitelist',
                  'msg',
                  'session'
                ]"
                :key="value"
                :value="value"
                :label="
                  value ? text(`modules.${value}`) : text('allModules')
                " /></ElSelect></ElFormItem
          ><ElFormItem
            ><ElButton type="primary" @click="a.applyFilters()">{{ text('search') }}</ElButton
            ><ElButton @click="a.reset()">{{ text('reset') }}</ElButton></ElFormItem
          ></ElForm
        ></ElCard
      >
      <ElCard shadow="never"
        ><div class="section-heading"
          ><h3>{{ text(kind === 'login' ? 'loginRecords' : 'operationRecords') }}</h3
          ><div class="view-controls"
            ><ElSelect
              v-model="sort"
              :aria-label="text('recordOrder')"
              class="audit-select"
              @change="a.loadRecords(true)"
              ><ElOption
                v-for="(value, index) in ['newest', 'failure', 'duration']"
                :key="value"
                :value="value"
                :label="text(['allRecords', 'failureFirst', 'byDuration'][index])" /></ElSelect
            ><ElButton
              v-if="canExport"
              :loading="exporting"
              :disabled="loading || error || total === 0"
              @click="download"
              >{{ text('export') }}</ElButton
            ><ResultToolbar
              v-model:size="tableSize"
              v-model:visible="visible"
              v-model:bordered="bordered"
              v-model:striped="striped"
              :columns="fields"
              :fullscreen="fullscreen"
              @refresh="a.refresh()"
              @fullscreen="toggleFullscreen" /></div></div
        ><ElAlert
          v-if="error || exportError"
          :title="text(exportError ? 'exportError' : 'loadError')"
          type="error"
          :closable="false"
          ><ElButton @click="a.loadRecords()">{{ text('retry') }}</ElButton></ElAlert
        ><div class="audit-results" :class="{ operation: kind === 'operation' }"
          ><div class="audit-table"
            ><ElTable
              v-loading="loading"
              :data="rows"
              :height="kind === 'operation' ? 660 : 420"
              :size="tableSize"
              :border="bordered"
              :stripe="striped"
              highlight-current-row
              @row-click="selectRecord"
              ><ElTableColumn
                v-for="field in fields"
                :key="field.key"
                :prop="field.key"
                :label="field.title"
                :min-width="field.key === 'path' ? 240 : field.key === 'occurred_at' ? 175 : 120"
                ><template #default="{ row }"
                  ><span v-if="field.key === 'occurred_at'">{{
                    adminDate(row.occurred_at, timezone.timezone)
                  }}</span
                  ><ElTag
                    v-else-if="field.key === 'status'"
                    :type="row.status < 400 ? 'primary' : 'danger'"
                    >{{ text(row.status < 400 ? 'success' : 'failure') }}</ElTag
                  ><span v-else>{{ row[field.key] ?? '—' }}</span></template
                ></ElTableColumn
              ><ElTableColumn :label="text('details')" width="90"
                ><template #default="{ row }"
                  ><ElButton
                    link
                    type="primary"
                    :aria-label="text('openEvent', { id: row.id })"
                    @click.stop="selectRecord(row)"
                    >{{ text('details') }}</ElButton
                  ></template
                ></ElTableColumn
              ></ElTable
            ><ElPagination
              v-model:current-page="page"
              v-model:page-size="size"
              :total="total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total,sizes,prev,pager,next"
              @change="a.loadRecords()" /></div
          ><aside v-if="kind === 'operation'" class="detail-pane"
            ><AuditDetail
              :event="selected"
              :loading="detailLoading"
              :error="detailError"
              @close="a.closeDetail()"
              @expand="expanded = true"
              @retry="selectedID && a.detail(selectedID)"
              @related="(field, value) => a.related(field, value)" /></aside></div></ElCard
      ><ElDrawer v-model="expanded" :title="text('eventDetail')" size="min(680px,100vw)"
        ><AuditDetail
          :event="selected"
          :loading="detailLoading"
          :error="detailError"
          expanded
          @close="expanded = false"
          @retry="selectedID && a.detail(selectedID)"
          @related="(field, value) => a.related(field, value)" /></ElDrawer></template
  ></div>
</template>
<style scoped>
  .audit-page {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .audit-page.fullscreen {
    height: 100vh;
    overflow: auto;
    padding: 20px;
    background: var(--el-bg-color-page);
  }
  .audit-page h2,
  .audit-page h3,
  .audit-page h4 {
    font-weight: 600;
  }
  .section-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .view-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .audit-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }
  .audit-metrics > div {
    padding: 16px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
  }
  .audit-metrics span {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  .audit-metrics strong {
    display: block;
    font-size: 26px;
    font-variant-numeric: tabular-nums;
    margin-top: 8px;
  }
  .success-rate {
    height: 6px;
    overflow: hidden;
    background: var(--el-color-danger);
    border-radius: 4px;
    margin-top: 16px;
  }
  .success-rate > div {
    height: 100%;
    background: var(--el-color-primary);
  }
  .audit-visuals {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
    gap: 16px;
  }
  .visual-skeleton {
    height: 280px;
    padding: 20px;
  }
  .scope-title {
    display: grid;
    align-content: start;
    min-height: 80px;
    margin: 12px 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .rank-section h4 {
    margin-bottom: 8px;
    font-size: 13px;
  }
  .rank-list {
    height: 132px;
    overflow: auto;
    margin-bottom: 18px;
    scrollbar-width: thin;
  }
  .rank-list button {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 24px;
    padding: 3px;
    border: 0;
    background: transparent;
    color: var(--el-text-color-primary);
    text-align: start;
    font-size: 12px;
    cursor: pointer;
  }
  .rank-list button span {
    overflow-wrap: anywhere;
  }
  .rank-list button[aria-pressed='true'] {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  .rank-list p {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    padding: 12px 0;
  }
  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .audit-search {
    width: min(360px, 100%);
  }
  .audit-select {
    width: 150px;
  }
  .suggestion-label {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .match {
    color: var(--el-color-danger);
    font-weight: 600;
  }
  .audit-results {
    min-width: 0;
  }
  .audit-results.operation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 16px;
  }
  .audit-table {
    min-width: 0;
  }
  .audit-table .el-pagination {
    margin-top: 16px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .detail-pane {
    height: 720px;
    overflow: auto;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    padding: 16px;
  }
  @media (max-width: 1100px) {
    .audit-visuals {
      grid-template-columns: 1fr;
    }
    .audit-results.operation {
      grid-template-columns: 1fr;
    }
    .detail-pane {
      height: 480px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
