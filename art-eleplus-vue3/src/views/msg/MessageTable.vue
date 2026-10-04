<script setup lang="ts">
  import type { Msg, MsgInput, MsgUser } from '@/api/msg'

  import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'

  import { useUserStore } from '@/store/modules/user'
  import { onBeforeRouteLeave } from 'vue-router'
  import type { TableInstance } from 'element-plus'
  import { ElMessageBox, ElMessage } from 'element-plus'
  import { formatDateTime as formatInstant, parseDateTime } from '@/utils/msg-date-time'
  import { msgApi, msgChanged } from '@/api/msg'
  import { $t } from '@/locales'
  import ResultToolbar from '../system/components/ResultToolbar.vue'

  const timezone = ref(
    localStorage.getItem('art-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  function getCurrentTimezone() {
    return timezone.value
  }
  function updateTimezone(event: Event) {
    timezone.value = (event as CustomEvent<string>).detail
  }
  function formatDateTime(value: number) {
    return formatInstant(value, getCurrentTimezone())
  }
  function pickerValue(value: number) {
    return new Date(formatDateTime(value).replace(' ', 'T'))
  }
  function pickerChanged(value: Date | null) {
    form.value.expired_at = value
      ? parseDateTime(formatInstant(value.valueOf()), getCurrentTimezone())
      : null
  }
  const user = useUserStore()
  const hasAccessByCodes = (codes: string[]) =>
    codes.some((code) => user.info.buttons?.includes('*') || user.info.buttons?.includes(code))
  const props = withDefaults(defineProps<{ sent?: boolean; embedded?: boolean }>(), {
    sent: false,
    embedded: false
  })
  const emit = defineEmits<{ close: [] }>()
  const active = ref(true)
  const sent = computed(() => props.sent)

  const canRead = computed(() => !sent.value || hasAccessByCodes(['system.msg.read']))
  const canSend = computed(() => sent.value && hasAccessByCodes(['system.msg.send']))
  const canDelete = computed(() => !sent.value || hasAccessByCodes(['system.msg.delete']))
  const table = ref<TableInstance>()
  function clearChecks() {
    table.value?.clearSelection()
    checkedRows.value = []
  }
  const checkedRows = ref<Msg[]>([])
  const checkedVisible = computed(() =>
    checkedRows.value.filter((row) => rows.value.some((item) => item.id === row.id))
  )
  const page = ref(1)
  const rows = ref<Msg[]>([])
  const size = ref(10)
  const total = ref(0)
  const busy = ref(false)
  const error = ref(false)
  const loading = ref(false)
  const status = ref('')
  const type = ref('')
  const detailLoading = ref(false)
  const detailOpen = ref(false)
  const selected = ref<Msg>()
  const attempted = ref(false)
  const compose = ref(false)
  const sendError = ref('')
  const form = ref<MsgInput>({
    title: '',
    content: '',
    type: 'notice',
    scope: 'all',
    recipient_ids: [],
    expired_at: null
  })
  const userLoading = ref(false)
  const users = ref<MsgUser[]>([])
  const density = ref<'large' | 'default' | 'small'>('default')
  const bordered = ref(true)
  const striped = ref(true)
  const visible = ref(['type', 'scope', 'published_at'])
  const isFullscreen = ref(false)
  let detailGeneration = 0
  let generation = 0
  let userGeneration = 0
  let userTimer: ReturnType<typeof setTimeout>
  let sendKey = ''
  let lastPayload = ''
  const issues = computed(() => ({
    title:
      !form.value.title.trim() || [...form.value.title.trim()].length > 200
        ? $t('msg.titleError')
        : '',
    content:
      !form.value.content.trim() || [...form.value.content.trim()].length > 20000
        ? $t('msg.contentError')
        : '',
    recipients:
      form.value.scope === 'targeted' &&
      (!form.value.recipient_ids?.length || form.value.recipient_ids.length > 1000)
        ? $t('msg.recipientError')
        : '',
    expiry:
      form.value.expired_at !== null &&
      (!Number.isFinite(form.value.expired_at) || form.value.expired_at <= Date.now())
        ? $t('msg.expiryError')
        : ''
  }))
  async function load() {
    if (!active.value && !props.embedded) return
    const current = ++generation
    if (!canRead.value) {
      rows.value = []
      total.value = 0
      return
    }
    loading.value = true
    error.value = false
    try {
      const result = await msgApi.list(sent.value, {
        p: page.value,
        s: size.value,
        ...(type.value ? { type: type.value } : {}),
        ...(!sent.value && status.value ? { read: status.value === 'read' } : {})
      })
      if (current !== generation) return
      if (!result.items.length && page.value > 1 && result.t <= (page.value - 1) * size.value) {
        page.value--
        return
      }
      rows.value = result.items
      total.value = result.t
    } catch {
      if (current === generation) {
        error.value = true
        rows.value = []
      }
    } finally {
      if (current === generation) loading.value = false
    }
  }
  async function openDetail(row: Msg) {
    const current = ++detailGeneration
    selected.value = undefined
    detailOpen.value = true
    detailLoading.value = true
    try {
      const value = await msgApi.get(row.id, sent.value)
      if (current !== detailGeneration || !detailOpen.value) return
      selected.value = value
      if (!sent.value && !value.read_at) {
        await msgApi.read(value.id)
        value.read_at = Date.now()
        msgChanged()
        await load()
      }
    } catch {
      if (current === detailGeneration) detailOpen.value = false
    } finally {
      if (current === detailGeneration) detailLoading.value = false
    }
  }
  async function mark(row: Msg) {
    busy.value = true
    try {
      await msgApi.read(row.id)
      msgChanged()
      await load()
    } finally {
      busy.value = false
    }
  }
  async function ask(title: string) {
    try {
      await ElMessageBox.confirm(title, $t('msg.confirm'), {
        confirmButtonText: $t('msg.confirm'),
        cancelButtonText: $t('msg.cancel')
      })
      return true
    } catch {
      return false
    }
  }
  async function requestBulk(read = false) {
    if (
      busy.value ||
      loading.value ||
      !checkedVisible.value.length ||
      (read ? sent.value : !canDelete.value)
    )
      return
    const management = sent.value
    const ids = checkedVisible.value.map((row) => row.id)
    if (
      !(await ask(
        $t(
          read
            ? 'msg.readSelectedConfirm'
            : management
              ? 'msg.deleteSelectedGlobalConfirm'
              : 'msg.deleteSelectedConfirm'
        )
      ))
    )
      return
    busy.value = true
    try {
      for (const id of ids) {
        if (read) await msgApi.read(id)
        else await msgApi.remove(id, management)
        const row = rows.value.find((value) => value.id === id)
        if (row) table.value?.toggleRowSelection(row, false)
        checkedRows.value = checkedRows.value.filter((value) => value.id !== id)
      }
    } catch (e) {
      ElMessage.error((e as Error).message)
    } finally {
      msgChanged()
      await load()
      busy.value = false
    }
  }
  async function remove(row: Msg) {
    if (
      busy.value ||
      !(await ask($t(sent.value ? 'msg.deleteGlobalConfirm' : 'msg.deleteConfirm')))
    )
      return
    busy.value = true
    try {
      await msgApi.remove(row.id, sent.value)
      detailOpen.value = false
      msgChanged()
      await load()
    } finally {
      busy.value = false
    }
  }
  async function readAll() {
    if (busy.value) return
    busy.value = true
    try {
      await msgApi.readAll()
      msgChanged()
      await load()
    } finally {
      busy.value = false
    }
  }
  async function searchUsers(q: string) {
    clearTimeout(userTimer)
    const current = ++userGeneration
    userTimer = setTimeout(async () => {
      userLoading.value = true
      try {
        const result = await msgApi.users(q)
        if (current === userGeneration) users.value = result
      } catch {
        if (current === userGeneration) users.value = []
      } finally {
        if (current === userGeneration) userLoading.value = false
      }
    }, 250)
  }
  function newMessage() {
    form.value = {
      title: '',
      content: '',
      type: 'notice',
      scope: 'all',
      recipient_ids: [],
      expired_at: null
    }
    attempted.value = false
    sendError.value = ''
    sendKey = crypto.randomUUID()
    lastPayload = ''
    compose.value = true
    void searchUsers('')
  }
  async function send() {
    attempted.value = true
    if (Object.values(issues.value).some(Boolean)) return
    busy.value = true
    sendError.value = ''
    try {
      const payload = {
        ...form.value,
        recipient_ids: form.value.scope === 'targeted' ? form.value.recipient_ids : []
      }
      const serialized = JSON.stringify(payload)
      if (serialized !== lastPayload) {
        sendKey = crypto.randomUUID()
        lastPayload = serialized
      }
      await msgApi.send(payload, sendKey)
      compose.value = false
      ElMessage.success($t('msg.sent'))
      msgChanged()
      if (page.value !== 1) page.value = 1
      else await load()
    } catch (e) {
      sendError.value = (e as Error).message
    } finally {
      busy.value = false
    }
  }
  async function closeCompose(): Promise<boolean> {
    if (busy.value) return false
    if (
      compose.value &&
      (form.value.title ||
        form.value.content ||
        form.value.recipient_ids?.length ||
        form.value.expired_at !== null ||
        form.value.type !== 'notice' ||
        form.value.scope !== 'all') &&
      !(await ask($t('msg.unsaved')))
    )
      return false
    compose.value = false
    return true
  }
  onBeforeRouteLeave((to) => to.path.startsWith('/auth/') || closeCompose())
  function fullscreen() {
    isFullscreen.value = !isFullscreen.value
  }
  function search() {
    if (page.value === 1) void load()
    else page.value = 1
  }
  function resetSearch() {
    status.value = ''
    type.value = ''
    search()
  }
  defineExpose({ closeCompose })
  watch([sent, status, type, size], () => {
    page.value = 1
    detailOpen.value = false
    void load()
  })
  watch([sent, page, size, status, type], () => {
    table.value?.clearSelection()
    checkedRows.value = []
  })
  watch(page, load)
  watch(canRead, load, { immediate: true })
  let timer: ReturnType<typeof setInterval>
  function refreshVisible() {
    if ((active.value || props.embedded) && !document.hidden && !busy.value) void load()
  }
  onMounted(() => {
    window.addEventListener('art-timezone-change', updateTimezone)
    timer = setInterval(refreshVisible, 30000)
    window.addEventListener('cinch-msg-changed', refreshVisible)
  })
  onActivated(() => {
    active.value = true
    void load()
  })
  onDeactivated(() => {
    active.value = false
    generation++
    loading.value = false
  })
  onBeforeUnmount(() => {
    window.removeEventListener('art-timezone-change', updateTimezone)
    active.value = false
    clearInterval(timer)
    window.removeEventListener('cinch-msg-changed', refreshVisible)
    generation++
    userGeneration++
    detailGeneration++
    clearTimeout(userTimer)
  })
</script>
<template>
  <div class="msg-region space-y-5" :class="{ 'msg-fullscreen': isFullscreen }">
    <ElCard shadow="never"
      ><ElForm inline @submit.prevent="search"
        ><ElFormItem v-if="!sent" :label="$t('msg.read')"
          ><ElSelect v-model="status" :aria-label="$t('msg.read')" style="width: 240px"
            ><ElOption
              v-for="v in ['', 'unread', 'read']"
              :key="v"
              :value="v"
              :label="$t(`msg.${v || 'allStatus'}`)" /></ElSelect></ElFormItem
        ><ElFormItem :label="$t('msg.type')"
          ><ElSelect v-model="type" :aria-label="$t('msg.type')" style="width: 240px"
            ><ElOption
              v-for="v in ['', 'system', 'notice']"
              :key="v"
              :value="v"
              :label="$t(`msg.${v || 'allTypes'}`)" /></ElSelect></ElFormItem
        ><ElFormItem
          ><ElButton @click="resetSearch">{{ $t('system.common.reset') }}</ElButton
          ><ElButton type="primary" native-type="submit">{{
            $t('system.common.search')
          }}</ElButton></ElFormItem
        ></ElForm
      ></ElCard
    >
    <ElCard shadow="never"
      ><div class="mb-5 flex flex-wrap items-center justify-between gap-3"
        ><div class="flex flex-wrap items-center gap-2"
          ><ElButton v-if="canSend" type="primary" @click="newMessage">{{
            $t('msg.send')
          }}</ElButton
          ><ElButton v-if="!sent" :disabled="loading || busy" @click="readAll">{{
            $t('msg.readAll')
          }}</ElButton>
          <template v-if="canRead && checkedVisible.length">
            <ElButton
              data-testid="message-bulk-delete"
              v-if="canDelete"
              type="danger"
              plain
              :disabled="busy || loading"
              @click="requestBulk()"
              >{{ $t('msg.deleteSelected') }}</ElButton
            >
            <ElButton
              data-testid="message-bulk-read"
              v-if="!sent"
              :disabled="busy || loading"
              @click="requestBulk(true)"
              >{{ $t('msg.markRead') }}</ElButton
            >
          </template></div
        >
        <ResultToolbar
          v-model:size="density"
          v-model:visible="visible"
          v-model:bordered="bordered"
          v-model:striped="striped"
          :fullscreen="embedded || isFullscreen"
          :columns="
            ['type', 'scope', 'published_at'].map((key) => ({
              key,
              title: $t(`msg.${key === 'published_at' ? 'published' : key}`)
            }))
          "
          @refresh="load"
          @fullscreen="embedded ? emit('close') : fullscreen()"
      /></div>
      <ElAlert v-if="!canRead" :title="$t('msg.noPermission')" type="info" /><div
        v-else-if="error"
        role="alert"
        ><ElAlert :title="$t('msg.error')" type="error" /><ElButton @click="load">{{
          $t('msg.retry')
        }}</ElButton></div
      >

      <ElTable
        ref="table"
        @selection-change="checkedRows = $event"
        v-if="canRead && !error"
        v-loading="loading"
        :data="rows"
        :size="density"
        :border="bordered"
        :stripe="striped"
        row-key="id"
        ><ElTableColumn
          type="selection"
          width="48"
          :label="$t('msg.selectAll')"
          :reserve-selection="true"
          :selectable="() => !loading" /><ElTableColumn
          prop="title"
          :label="$t('msg.title')"
          min-width="280"
          ><template #default="{ row }"
            ><ElButton link type="primary" class="msg-title" @click="openDetail(row)">{{
              row.title
            }}</ElButton
            ><ElTag v-if="row.expired_at && row.expired_at <= Date.now()" type="info">{{
              $t('msg.expired')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn v-if="visible.includes('type')" :label="$t('msg.type')" width="140"
          ><template #default="{ row }"
            ><ElTag type="primary">{{ $t(`msg.${row.type}`) }}</ElTag></template
          ></ElTableColumn
        ><ElTableColumn v-if="visible.includes('scope')" :label="$t('msg.scope')" width="150"
          ><template #default="{ row }"
            ><ElTag class="msg-scope">{{ $t(`msg.${row.scope}`) }}</ElTag></template
          ></ElTableColumn
        ><ElTableColumn
          v-if="visible.includes('published_at')"
          :label="$t('msg.published')"
          width="190"
          ><template #default="{ row }">{{
            formatDateTime(row.published_at)
          }}</template></ElTableColumn
        ><ElTableColumn v-if="!sent" :label="$t('msg.read')" width="110"
          ><template #default="{ row }"
            ><ElTag :type="row.read_at ? 'info' : 'primary'">{{
              $t(row.read_at ? 'msg.read' : 'msg.unread')
            }}</ElTag></template
          ></ElTableColumn
        ><ElTableColumn :label="$t('msg.actions')" width="250" fixed="right"
          ><template #default="{ row }"
            ><ElButton link type="primary" @click="openDetail(row)">{{ $t('msg.view') }}</ElButton
            ><ElButton
              v-if="!sent && !row.read_at"
              link
              type="primary"
              :disabled="busy"
              @click="mark(row)"
              >{{ $t('msg.markRead') }}</ElButton
            ><ElButton v-if="canDelete" link type="danger" @click="remove(row)">{{
              $t(sent ? 'msg.deleteGlobal' : 'msg.delete')
            }}</ElButton></template
          ></ElTableColumn
        ><template #empty><ElEmpty :description="$t('msg.empty')" /></template
      ></ElTable>
      <ElPagination
        v-if="canRead"
        class="mt-5"
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total,sizes,prev,pager,next"
    /></ElCard>
  </div>
  <ElDialog v-model="detailOpen" :title="$t('msg.detail')" width="560px" align-center
    ><div v-loading="detailLoading"
      ><template v-if="selected"
        ><h2 class="text-xl font-semibold">{{ selected.title }}</h2
        ><p>{{ formatDateTime(selected.published_at) }}</p
        ><p class="msg-content my-5">{{ selected.content }}</p
        ><p
          >{{ $t('msg.expiry') }}:
          {{ selected.expired_at ? formatDateTime(selected.expired_at) : $t('msg.noExpiry') }}</p
        ><p v-if="sent && selected.recipient_ids"
          >{{ $t('msg.recipientIDs') }}: {{ selected.recipient_ids.join(', ') }}</p
        ><ElButton v-if="canDelete" type="danger" class="mt-5" @click="remove(selected)">{{
          $t(sent ? 'msg.deleteGlobal' : 'msg.delete')
        }}</ElButton></template
      ></div
    ></ElDialog
  >
  <ElDialog
    :model-value="compose"
    :title="$t('msg.send')"
    width="680px"
    align-center
    :close-on-click-modal="false"
    :before-close="
      async (done) => {
        if (await closeCompose()) done()
      }
    "
    ><ElForm label-position="top" :disabled="busy" @submit.prevent="send">
      <ElFormItem :label="$t('msg.title')" :error="attempted ? issues.title : ''"
        ><ElInput v-model="form.title" :aria-label="$t('msg.title')" /></ElFormItem
      ><ElFormItem :label="$t('msg.content')" :error="attempted ? issues.content : ''"
        ><ElInput v-model="form.content" type="textarea" :rows="5" :aria-label="$t('msg.content')"
      /></ElFormItem>
      <ElFormItem :label="$t('msg.type')"
        ><ElSelect v-model="form.type" :aria-label="$t('msg.type')"
          ><ElOption
            v-for="v in ['system', 'notice']"
            :key="v"
            :value="v"
            :label="$t(`msg.${v}`)" /></ElSelect></ElFormItem
      ><ElFormItem :label="$t('msg.scope')"
        ><ElSelect v-model="form.scope" :aria-label="$t('msg.scope')"
          ><ElOption
            v-for="v in ['all', 'targeted']"
            :key="v"
            :value="v"
            :label="$t(`msg.${v}`)" /></ElSelect></ElFormItem
      ><ElFormItem
        v-if="form.scope === 'targeted'"
        :label="$t('msg.recipients')"
        :error="attempted ? issues.recipients : ''"
        ><ElSelect
          v-model="form.recipient_ids"
          :aria-label="$t('msg.recipients')"
          multiple
          filterable
          remote
          :remote-method="searchUsers"
          :loading="userLoading"
          ><ElOption
            v-for="u in users"
            :key="u.id"
            :value="u.id"
            :label="u.username" /></ElSelect></ElFormItem
      ><ElFormItem :label="$t('msg.expiry')" :error="attempted ? issues.expiry : ''"
        ><ElDatePicker
          :model-value="form.expired_at ? pickerValue(form.expired_at) : null"
          type="datetime"
          :placeholder="$t('msg.noExpiry')"
          :aria-label="$t('msg.expiry')"
          @update:model-value="pickerChanged" /></ElFormItem
      ><ElAlert v-if="sendError" :title="sendError" type="error" /></ElForm
    ><template #footer
      ><ElButton :disabled="busy" @click="closeCompose">{{ $t('msg.cancel') }}</ElButton
      ><ElButton :loading="busy" type="primary" @click="send">{{
        $t('msg.send')
      }}</ElButton></template
    ></ElDialog
  >
</template>
<style scoped>
  .msg-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 2000;
    padding: 24px;
    overflow: auto;
    background: var(--el-bg-color-page);
  }
  .msg-title {
    height: auto;
    white-space: normal;
    text-align: start;
    overflow-wrap: anywhere;
    max-width: 320px;
  }
  .msg-content {
    max-height: 384px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .msg-scope {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
</style>
