<script setup lang="ts">
  import { useStatisticsWarning } from '@/utils/admin/statistics-warning'
  import { ref, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue'
  import { $t } from '@/locales'
  import { msgApi, type MsgSentSummary } from '@/api/msg'
  import { adminDate } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  const props = defineProps<{ allowed: boolean; revision: number }>(),
    data = ref<MsgSentSummary>(),
    loading = ref(true),
    error = ref(false),
    timezone = useAdminTimezone()
  const text = (key: string) => $t(`pc.msg.${key}`)
  let generation = 0,
    active = true,
    timer: ReturnType<typeof setInterval>
  async function load() {
    if (!props.allowed || !active || document.hidden) return
    const run = ++generation
    loading.value = true
    error.value = false
    try {
      const value = await msgApi.sentSummary()
      if (active && run === generation) data.value = value
    } catch {
      if (run === generation) {
        data.value = undefined
        error.value = true
      }
    } finally {
      if (run === generation) loading.value = false
    }
  }
  function count(key: string) {
    return Number((data.value?.counts as unknown as Record<string, number>)?.[key] ?? 0)
  }
  watch(() => [props.allowed, props.revision], load, { immediate: true })
  onMounted(() => {
    timer = setInterval(load, 30000)
    window.addEventListener('cinch-msg-changed', load)
    document.addEventListener('visibilitychange', load)
  })
  onActivated(() => {
    if (!active) {
      active = true
      void load()
    }
  })
  onDeactivated(() => {
    active = false
    generation++
  })
  onBeforeUnmount(() => {
    active = false
    generation++
    clearInterval(timer)
    window.removeEventListener('cinch-msg-changed', load)
    document.removeEventListener('visibilitychange', load)
  })
  const showWarning = useStatisticsWarning(error)
</script>
<template>
  <ElAlert
    v-if="allowed && showWarning"
    :title="text('summaryError')"
    type="warning"
    :closable="false"
    ><ElButton @click="load">{{ text('retry') }}</ElButton></ElAlert
  ><div v-if="allowed" class="sent-summary" data-testid="message-sent-summary" :aria-busy="loading"
    ><ElCard shadow="never"
      ><h2>{{ text('publishedCount') }}</h2
      ><strong>{{ loading || error ? '—' : (data?.total ?? 0) }}</strong
      ><p
        >{{ text('latestPublished') }}:
        {{ adminDate(data?.counts.latest_published_at, timezone) }}</p
      ></ElCard
    ><ElCard
      v-for="[label, first, second] in [
        ['type', 'notice', 'system'],
        ['scope', 'all', 'targeted']
      ]"
      :key="label"
      shadow="never"
      ><h2>{{ text(label) }}</h2
      ><div class="distribution-values"
        ><strong>{{ loading || error ? '—' : count(first) }}</strong
        ><span>{{ text(first) }} / {{ error ? '—' : count(second) }} {{ text(second) }}</span></div
      ><div
        class="distribution"
        role="img"
        :aria-label="
          $t(`pc.msg.${label === 'type' ? 'typeDistribution' : 'scopeDistribution'}`, {
            [first]: count(first),
            [second]: count(second)
          })
        "
        ><i :style="{ width: `${data?.total ? (100 * count(first)) / data.total : 0}%` }" /><i
          :style="{
            width: `${data?.total ? (100 * count(second)) / data.total : 0}%`
          }" /></div></ElCard
  ></div>
</template>
<style scoped>
  .sent-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .sent-summary h2 {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  .sent-summary strong {
    display: block;
    font-size: 28px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    margin: 10px 0;
  }
  .sent-summary p,
  .distribution-values span {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .distribution-values {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .distribution {
    display: flex;
    height: 7px;
    overflow: hidden;
    border-radius: 4px;
    background: var(--el-fill-color);
    margin-top: 16px;
  }
  .distribution i:first-child {
    background: var(--el-color-primary);
  }
  .distribution i:last-child {
    background: var(--el-color-warning);
  }
  @media (max-width: 900px) {
    .sent-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
