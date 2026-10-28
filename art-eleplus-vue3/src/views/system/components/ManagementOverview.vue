<script setup lang="ts">
  import { useStatisticsWarning } from '@/utils/admin/statistics-warning'
  import { computed, ref, watch, onBeforeUnmount } from 'vue'
  import { $t, catalogLabel } from '@/locales'
  import { catalogGroupWords } from '@/locales/catalog'
  import { getAdminSummary } from '@/utils/admin/service'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  import type { AdminResource, AdminSummary, AdminQuery, SummaryDay } from '@/utils/admin/model'
  const props = defineProps<{
    resource: AdminResource
    allowed: boolean
    canQuery: boolean
    canDetail: boolean
    revision: number
    filters: AdminQuery
  }>()
  const emit = defineEmits<{ filter: [AdminQuery]; group: [number] }>()
  const timezone = useAdminTimezone(),
    days = ref(14),
    summary = ref<AdminSummary>(),
    loading = ref(false),
    error = ref(false),
    retry = ref(0)
  let run = 0
  watch(
    () => [props.resource, props.allowed, props.revision, days.value, timezone.value, retry.value],
    async () => {
      const current = ++run
      if (!props.allowed) return
      loading.value = true
      error.value = false
      try {
        const value = await getAdminSummary(
          props.resource,
          props.resource === 'user' ? { days: days.value, time_zone: timezone.value } : {}
        )
        if (run === current) summary.value = value
      } catch {
        if (run === current) {
          summary.value = undefined
          error.value = true
        }
      } finally {
        if (run === current) loading.value = false
      }
    },
    { immediate: true }
  )
  onBeforeUnmount(() => {
    run++
  })
  const count = (key: string) => summary.value?.counts[key] ?? 0
  const text = (key: string) => $t(`pc.system-insights.${key}`)
  const metrics = computed(() => {
    const all = {
      label: text(
        props.resource === 'user'
          ? 'userTotal'
          : props.resource === 'role'
            ? 'roles'
            : props.resource === 'user-group'
              ? 'groups'
              : props.resource === 'action'
                ? 'actionTotal'
                : 'all'
      ),
      value: summary.value?.total ?? 0,
      key: '',
      filter: undefined as string | number | boolean | undefined
    }
    const item = (label: string, value: number, key = '', filter?: string | number | boolean) => ({
      label,
      value,
      key,
      filter
    })
    if (props.resource === 'user')
      return [
        all,
        item($t('system.status.active'), count('active'), 'status', 1),
        item($t('system.status.pending'), count('pending'), 'status', 0),
        item($t('system.status.locked'), count('locked'), 'status', 2),
        item(text('recentLoginUsers'), count('recent_logged_in_users'))
      ]
    if (props.resource === 'role')
      return [
        all,
        item(text('withPermissions'), count('with_permissions'), 'has_permissions', true),
        item(text('withoutPermissions'), count('without_permissions'), 'has_permissions', false)
      ]
    if (props.resource === 'user-group')
      return [
        all,
        item(text('memberships'), count('memberships')),
        item(text('uniqueMembers'), count('unique_members')),
        item(text('withoutMembers'), count('empty_groups'), 'has_members', false)
      ]
    if (props.resource === 'action')
      return [
        all,
        item(text('businessGroups'), summary.value?.groups.length ?? 0),
        ...['resource', 'menu', 'button'].map((key) => item(text(`${key}Configured`), count(key)))
      ]
    if (props.resource === 'dictionary')
      return [
        all,
        item($t('system.enabled.yes'), count('enabled'), 'enabled', true),
        item($t('system.enabled.no'), count('disabled'), 'enabled', false)
      ]
    return [
      all,
      item($t('system.category.permission'), count('permission'), 'category', 0),
      item('JWT', count('jwt'), 'category', 1)
    ]
  })
  const maximum = computed(() =>
    Math.max(
      1,
      ...(summary.value?.trend.flatMap((day) => [day.count, day.recent_logged_in_users]) ?? [])
    )
  )
  const groupMaximum = computed(() =>
    Math.max(1, ...(summary.value?.groups.map((group) => group.count) ?? []))
  )
  const distributionGroups = computed(() => {
    // Catalog refreshes can change names without changing the summary's raw keys.
    void catalogGroupWords()
    return (summary.value?.groups ?? []).map((group) => ({
      ...group,
      label: group.name
        ? props.resource === 'user-group'
          ? group.name
          : catalogLabel('groups', group.name)
        : text('ungrouped')
    }))
  })
  const groupKey = computed(() => (props.resource === 'role' ? 'groups_all' : 'groups_exact'))
  const groups = computed<string[]>(() => {
    try {
      return JSON.parse(String(props.filters[groupKey.value] ?? '[]'))
    } catch {
      return []
    }
  })
  function metricFilter(key: string, value: string | number | boolean | undefined) {
    if (props.canQuery && key)
      emit('filter', {
        [key]: String(props.filters[key] ?? '') === String(value ?? '') ? undefined : value
      })
  }
  function dayFilter(day: SummaryDay, login: boolean) {
    if (!props.canQuery) return
    const key = login ? 'last_logged_in' : 'created'
    const same = Number(props.filters[`${key}_from`]) === day.from
    emit('filter', {
      [`${key}_from`]: same ? undefined : day.from,
      [`${key}_to`]: same ? undefined : day.to
    })
  }
  function groupFilter(group: { id?: number; name: string }) {
    if (props.resource === 'user-group') {
      if (props.canDetail && group.id) emit('group', group.id)
      return
    }
    if (!props.canQuery) return
    const next = groups.value.includes(group.name)
      ? groups.value.filter((value) => value !== group.name)
      : [...groups.value, group.name]
    emit('filter', { [groupKey.value]: next.length ? JSON.stringify(next) : undefined })
  }
  const showWarning = useStatisticsWarning(error)
</script>
<template>
  <ElCard
    v-if="allowed"
    shadow="never"
    class="overview"
    data-testid="management-overview"
    :aria-label="text('overview')"
    :aria-busy="loading"
  >
    <div class="overview-heading"
      ><h2>{{ text('overview') }}</h2
      ><ElRadioGroup
        v-if="resource === 'user'"
        v-model="days"
        size="small"
        :aria-label="text('period')"
        ><ElRadioButton v-for="value in [14, 30]" :key="value" :value="value">{{
          $t('pc.system-insights.lastDays', { count: value })
        }}</ElRadioButton></ElRadioGroup
      ></div
    >
    <ElAlert v-if="showWarning" :title="text('overviewError')" type="warning" :closable="false"
      ><ElButton text @click="retry++">{{ text('retry') }}</ElButton></ElAlert
    >
    <div class="overview-metrics"
      ><button
        v-for="metric in metrics"
        :key="metric.label"
        type="button"
        :disabled="loading || error || !metric.key || !canQuery"
        :aria-pressed="
          metric.key ? String(filters[metric.key] ?? '') === String(metric.filter ?? '') : undefined
        "
        @click="metricFilter(metric.key, metric.filter)"
        ><span>{{ metric.label }}</span
        ><strong>{{ loading || error ? '—' : metric.value.toLocaleString() }}</strong></button
      ></div
    >
    <div v-if="resource === 'user'" class="overview-trend"
      ><h3>{{ text('userTrend') }}</h3
      ><div class="trend-viewport"
        ><div v-for="day in summary?.trend" :key="day.date" class="trend-day"
          ><div class="trend-bars"
            ><button
              v-for="login in [false, true]"
              :key="String(login)"
              type="button"
              :disabled="loading || !canQuery"
              :class="{ 'login-bar': login }"
              :style="{
                height: `${Math.max(3, (100 * (login ? day.recent_logged_in_users : day.count)) / maximum)}%`
              }"
              :aria-label="
                $t(`pc.system-insights.${login ? 'recentLoginDay' : 'newUserDay'}`, {
                  date: day.date,
                  count: login ? day.recent_logged_in_users : day.count
                })
              "
              :title="
                $t(`pc.system-insights.${login ? 'recentLoginDay' : 'newUserDay'}`, {
                  date: day.date,
                  count: login ? day.recent_logged_in_users : day.count
                })
              "
              @click="dayFilter(day, login)" /></div
          ><span>{{ day.date.slice(5) }}</span></div
        ></div
      ></div
    >
    <div v-if="['role', 'action', 'user-group'].includes(resource)" class="overview-groups"
      ><button
        v-for="group in distributionGroups"
        :key="`${group.id}:${group.name}`"
        type="button"
        :disabled="resource === 'user-group' ? !canDetail : !canQuery"
        :aria-pressed="resource !== 'user-group' ? groups.includes(group.name) : undefined"
        :aria-label="
          $t(`pc.system-insights.${resource === 'user-group' ? 'groupMembers' : 'selectGroup'}`, {
            name: group.label,
            count: group.count
          })
        "
        @click="groupFilter(group)"
        ><span
          >{{ group.label }}<b>{{ group.count }}</b></span
        ><i><i :style="{ width: `${(100 * group.count) / groupMaximum}%` }" /></i></button
    ></div>
  </ElCard>
</template>
<style scoped>
  .overview-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .overview h2,
  .overview h3 {
    font-weight: 600;
  }
  .overview-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px;
  }
  .overview-metrics button,
  .overview-groups button {
    padding: 16px;
    text-align: start;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
    cursor: pointer;
  }
  .overview-metrics button:disabled {
    cursor: default;
  }
  .overview-metrics button[aria-pressed='true'],
  .overview-groups button[aria-pressed='true'] {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  .overview-metrics span {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  .overview-metrics strong {
    display: block;
    font-size: 26px;
    margin-top: 8px;
    font-variant-numeric: tabular-nums;
  }
  .overview-trend {
    margin-top: 24px;
  }
  .trend-viewport {
    display: flex;
    gap: 5px;
    overflow: auto;
    padding: 16px 0;
  }
  .trend-day {
    flex: 1;
    min-width: 30px;
    text-align: center;
    font-size: 11px;
  }
  .trend-bars {
    display: flex;
    height: 112px;
    align-items: end;
    justify-content: center;
    gap: 3px;
    margin-bottom: 8px;
  }
  .trend-bars button {
    width: 8px;
    min-height: 3px;
    background: var(--el-color-primary);
    border: 0;
    border-radius: 3px 3px 0 0;
    cursor: pointer;
  }
  .trend-bars .login-bar {
    background: var(--el-color-success);
  }
  .overview-groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
    margin-top: 20px;
  }
  .overview-groups span {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .overview-groups i {
    display: block;
    height: 6px;
    border-radius: 4px;
    background: var(--el-fill-color);
    margin-top: 10px;
  }
  .overview-groups i i {
    margin: 0;
    background: var(--el-color-primary);
  }
</style>
