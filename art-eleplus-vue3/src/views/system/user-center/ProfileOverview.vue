<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue'
  import { useRouter } from 'vue-router'
  import { usePermissions } from '@/composables/use-permissions'
  import { markMessageRead } from '@/utils/message-read-policy'
  import { $t } from '@/locales'
  import { useUserStore } from '@/store/modules/user'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  import { adminDate, type AuditEvent } from '@/utils/admin/model'
  import { getAuditList, auditProfileFields } from '@/utils/admin/service'
  import { msgApi, msgChanged, type Msg } from '@/api/msg'
  const { hasButton } = usePermissions()
  const canControl = (control: string) => hasButton(`admin:btn:msg:inbox:${control}`, '/msg/inbox')
  const emit = defineEmits<{ inbox: [] }>(),
    user = useUserStore(),
    timezone = useAdminTimezone(),
    router = useRouter()
  const kinds = computed(() =>
    (['login', 'operation'] as const).filter((kind) =>
      user.info.buttons?.some((code) => code === '*' || code === `audit.${kind}.read`)
    )
  )
  const kind = ref<'login' | 'operation'>('login'),
    activity = ref<AuditEvent[]>([]),
    activityLoading = ref(false),
    activityError = ref(false),
    messages = ref<Msg[]>([]),
    unread = ref<number>(),
    messageLoading = ref(true),
    messageError = ref(false),
    selected = ref<Msg>(),
    detailLoading = ref(false),
    detailError = ref(false),
    busy = ref(false)
  let active = true,
    activityRun = 0,
    messageRun = 0,
    detailRun = 0,
    timer: ReturnType<typeof setInterval>
  const text = (key: string, params: Record<string, string | number> = {}) =>
    $t(`pc.${key}`, params)
  async function loadActivity() {
    const run = ++activityRun
    activity.value = []
    if (!active || !user.info.userName || !kinds.value.length) return
    if (!kinds.value.includes(kind.value)) {
      kind.value = kinds.value[0]!
      return
    }
    activityLoading.value = true
    activityError.value = false
    const to = Date.now()
    try {
      const result = await getAuditList(kind.value, {
        f: auditProfileFields[kind.value],
        username: user.info.userName,
        from: to - 30 * 86400000,
        to,
        p: 1,
        s: 6,
        sort: 'newest',
        time_zone: timezone.value
      })
      if (active && run === activityRun) activity.value = result.items
    } catch {
      if (run === activityRun) activityError.value = true
    } finally {
      if (run === activityRun) activityLoading.value = false
    }
  }
  async function loadMessages() {
    if (!active || document.hidden || !user.info.userId) return
    const run = ++messageRun
    messageLoading.value = true
    messageError.value = false
    try {
      const [list, status] = await Promise.all([
        msgApi.list(false, {
          f: 'id,title,type,published_at,read_at',
          p: 1,
          s: 3
        }),
        msgApi.count(user.info.userId)
      ])
      if (active && run === messageRun) {
        messages.value = list.items
        unread.value = status.count
      }
    } catch {
      if (run === messageRun) {
        messageError.value = true
        unread.value = undefined
      }
    } finally {
      if (run === messageRun) messageLoading.value = false
    }
  }
  async function openMessage(row: Msg) {
    const run = ++detailRun
    selected.value = row
    detailLoading.value = true
    detailError.value = false
    try {
      const record = await msgApi.get(row.id, false)
      if (!active || run !== detailRun) return
      selected.value = record
      if (await markMessageRead(record, () => canControl('mark-read'), msgApi.read)) {
        msgChanged()
        if (run === detailRun) selected.value = { ...record }
      }
    } catch {
      if (run === detailRun) detailError.value = true
    } finally {
      if (run === detailRun) detailLoading.value = false
    }
  }
  async function readAll() {
    if (busy.value || !unread.value || !canControl('read-all')) return
    busy.value = true
    try {
      await msgApi.readAll()
      msgChanged()
    } catch {
      messageError.value = true
    } finally {
      busy.value = false
    }
  }
  function closeDetail() {
    detailRun++
    selected.value = undefined
  }
  function openAudit() {
    if (!user.info.userName) return
    void router.push({
      path: `/audit/${kind.value}`,
      query: { username: user.info.userName, days: '30' }
    })
  }
  watch(
    () => [
      user.info.userId,
      user.info.userName,
      user.language,
      kind.value,
      timezone.value,
      kinds.value.join(',')
    ],
    () => {
      void loadActivity()
    }
  )
  watch(
    () => user.info.userId,
    () => {
      messageRun++
      closeDetail()
      messages.value = []
      unread.value = undefined
      void loadMessages()
    }
  )
  onMounted(() => {
    void loadMessages()
    void loadActivity()
    timer = setInterval(loadMessages, 30000)
    window.addEventListener('cinch-msg-changed', loadMessages)
    document.addEventListener('visibilitychange', loadMessages)
  })
  onDeactivated(() => {
    active = false
    activityRun++
    messageRun++
    closeDetail()
  })
  onActivated(() => {
    if (!active) {
      active = true
      void loadMessages()
      void loadActivity()
    }
  })
  onBeforeUnmount(() => {
    active = false
    activityRun++
    messageRun++
    detailRun++
    clearInterval(timer)
    window.removeEventListener('cinch-msg-changed', loadMessages)
    document.removeEventListener('visibilitychange', loadMessages)
  })
</script>
<template>
  <div class="profile-overview"
    ><ElCard shadow="never" data-testid="profile-messages"
      ><header
        ><h2
          >{{ text('msg.inbox') }} <ElTag v-if="unread" size="small">{{ unread }}</ElTag></h2
        ><ElButton v-if="canControl('read-all')" :disabled="busy || !unread" @click="readAll">{{
          text('msg.readAll')
        }}</ElButton></header
      ><ElSkeleton v-if="messageLoading" animated :rows="5" /><ElAlert
        v-else-if="messageError"
        type="error"
        :closable="false"
        :title="text('msg.error')"
        ><ElButton @click="loadMessages">{{ text('msg.retry') }}</ElButton></ElAlert
      ><div v-else
        ><ElEmpty
          v-if="!messages.length"
          :description="text('msg.empty')"
          :image-size="60"
        /><button
          v-for="row in messages"
          :key="row.id"
          type="button"
          class="message-preview"
          @click="openMessage(row)"
          ><div
            ><ElTag size="small">{{ text(`msg.${row.type}`) }}</ElTag
            ><strong :class="{ read: row.read_at }">{{ row.title }}</strong></div
          ><time>{{ adminDate(row.published_at, timezone) }}</time></button
        ></div
      ><footer
        ><ElButton @click="emit('inbox')">{{ text('profile-center.openInbox') }}</ElButton></footer
      ></ElCard
    ><ElCard shadow="never" data-testid="profile-activity"
      ><header
        ><h2>{{ text('profile-center.recentActivity') }}</h2
        ><ElRadioGroup v-if="kinds.length > 1" v-model="kind" size="small"
          ><ElRadioButton v-for="value in kinds" :key="value" :value="value">{{
            text(`profile-center.${value}`)
          }}</ElRadioButton></ElRadioGroup
        ></header
      ><p class="muted">{{ text('profile-center.activityRange', { count: 6 }) }}</p
      ><ElEmpty
        v-if="!kinds.length"
        :description="text('profile-center.noActivityAccess')"
        :image-size="60"
      /><ElSkeleton v-else-if="activityLoading" animated :rows="8" /><ElAlert
        v-else-if="activityError"
        type="error"
        :closable="false"
        :title="text('audit.loadError')"
        ><ElButton @click="loadActivity">{{ text('audit.retry') }}</ElButton></ElAlert
      ><div v-else
        ><ElEmpty
          v-if="!activity.length"
          :description="text('profile-center.noActivity')"
          :image-size="60"
        /><div v-for="row in activity" :key="row.id" class="activity-row"
          ><div
            ><strong>{{
              kind === 'login'
                ? text(
                    row.status < 400 ? 'profile-center.loginSuccess' : 'profile-center.loginFailure'
                  )
                : row.operation
                  ? text(`audit.operationTypes.${row.operation}`)
                  : row.method
            }}</strong
            ><p class="muted"
              >{{ row.ip }} · {{ kind === 'operation' ? row.path : row.user_agent }}</p
            ></div
          ><time>{{ adminDate(row.occurred_at, timezone) }}</time></div
        ></div
      ><footer
        v-if="
          kinds.length &&
          (user.info.menus?.includes('*') || user.info.menus?.includes(`/audit/${kind}`))
        "
        ><ElButton @click="openAudit">{{ text('profile-center.viewAudit') }}</ElButton></footer
      ></ElCard
    ><ElDrawer
      :model-value="!!selected"
      :title="text('msg.detail')"
      size="min(640px,100vw)"
      @close="closeDetail"
      ><ElSkeleton v-if="detailLoading" animated :rows="8" /><ElAlert
        v-else-if="detailError"
        type="error"
        :closable="false"
        :title="text('msg.detailError')"
        ><ElButton @click="selected && openMessage(selected)">{{
          text('msg.retry')
        }}</ElButton></ElAlert
      ><template v-else-if="selected"
        ><h2>{{ selected.title }}</h2
        ><p class="muted">{{ adminDate(selected.published_at, timezone) }}</p
        ><div class="message-body">{{ selected.content }}</div></template
      ></ElDrawer
    ></div
  >
</template>
<style scoped>
  .profile-overview {
    display: grid;
    gap: 20px;
  }
  .profile-overview header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }
  .profile-overview h2 {
    font-size: 17px;
    font-weight: 600;
  }
  .profile-overview footer {
    margin-top: 18px;
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 16px;
  }
  .message-preview,
  .activity-row {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 18px 0;
    text-align: start;
    border: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: transparent;
    color: var(--el-text-color-primary);
    font-size: 13px;
  }
  .message-preview {
    cursor: pointer;
  }
  .message-preview strong {
    margin-left: 8px;
    font-weight: 600;
  }
  .message-preview strong.read {
    font-weight: 400;
  }
  .muted,
  time {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .muted {
    margin: 8px 0;
  }
  .message-body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.8;
    margin-top: 24px;
  }
  .activity-row time,
  .message-preview time {
    flex-shrink: 0;
  }
  @media (max-width: 650px) {
    .activity-row,
    .message-preview {
      flex-direction: column;
      gap: 6px;
    }
  }
</style>
