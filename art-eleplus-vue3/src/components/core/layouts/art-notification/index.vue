<script setup lang="ts">
  import { onBeforeUnmount, ref, watch, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import MessageTable from '@/views/msg/MessageTable.vue'
  import { useI18n } from 'vue-i18n'
  import { ElMessageBox } from 'element-plus'
  import { msgApi, msgChanged, type Msg } from '@/api/msg'
  import { useUserStore } from '@/store/modules/user'
  import { formatDateTime } from '@/utils/msg-date-time'
  import { $t } from '@/locales'
  const props = defineProps<{ anchor?: HTMLElement }>()
  const userStore = useUserStore()
  const timezone = ref(
    localStorage.getItem('art-timezone') || new Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  function updateTimezone(event: Event) {
    timezone.value = (event as CustomEvent<string>).detail
  }
  const open = defineModel<boolean>('value', { default: false })
  const { t: translate } = useI18n()
  const route = useRoute()
  const historyOpen = ref(false)
  watch(
    () => route.fullPath,
    () => {
      open.value = false
      historyOpen.value = false
      detail.value = false
    }
  )
  const rows = ref<Msg[]>([]),
    loading = ref(false),
    error = ref(''),
    busy = ref(false),
    detail = ref(false),
    selected = ref<Msg>()
  function history() {
    open.value = false
    historyOpen.value = true
  }
  let generation = 0
  async function load() {
    if (!open.value || document.hidden) return
    const current = ++generation
    loading.value = true
    error.value = ''
    try {
      const result = await msgApi.list(false, { p: 1, s: 10 })
      if (current === generation) rows.value = result.items
    } catch (e) {
      if (current === generation) error.value = (e as Error).message
    } finally {
      if (current === generation) loading.value = false
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
  async function show(row: Msg) {
    const value = await msgApi.get(row.id, false)
    selected.value = value
    open.value = false
    detail.value = true
    if (!value.read_at) await mark(value)
  }
  async function remove(row: Msg) {
    if (!(await ask($t('msg.deleteConfirm')))) return
    busy.value = true
    try {
      await msgApi.remove(row.id, false)
      msgChanged()
      await load()
    } finally {
      busy.value = false
    }
  }
  async function clearPreview() {
    const ids = rows.value.map((row) => row.id)
    if (
      busy.value ||
      !ids.length ||
      !(await ask(translate('msg.clearPreviewConfirm', { count: ids.length })))
    )
      return
    busy.value = true
    try {
      for (const id of ids) await msgApi.remove(id, false)
    } finally {
      busy.value = false
      msgChanged()
      await load()
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
  watch(open, (v) => {
    if (v) void load()
    else generation++
  })
  let timer: ReturnType<typeof setInterval>
  onMounted(() => {
    window.addEventListener('art-timezone-change', updateTimezone)
    timer = setInterval(load, 30000)
    window.addEventListener('cinch-msg-changed', load)
  })
  onBeforeUnmount(() => {
    generation++
    window.removeEventListener('art-timezone-change', updateTimezone)
    clearInterval(timer)
    window.removeEventListener('cinch-msg-changed', load)
  })
</script>
<template>
  <ElPopover
    :visible="open"
    virtual-triggering
    :virtual-ref="props.anchor"
    placement="bottom-end"
    :offset="8"
    :show-arrow="false"
    width="max-content"
    :popper-style="{
      padding: 0,
      minWidth: 'min(18rem, calc(100vw - 1.5rem))',
      maxWidth: 'min(25rem, calc(100vw - 1.5rem))'
    }"
  >
    <section
      class="art-notification-panel"
      data-testid="notification-preview"
      role="region"
      :aria-label="$t('msg.notifications')"
      @click.stop
    >
      <header class="notification-heading"
        ><h2>{{ $t('msg.notifications') }}</h2
        ><ElButton
          text
          circle
          :disabled="busy || loading || !rows.length"
          :aria-label="$t('msg.readAll')"
          :title="$t('msg.readAll')"
          @click="readAll"
          ><ArtSvgIcon icon="ri:mail-check-line" /></ElButton
      ></header>
      <ElAlert v-if="error" :title="error" type="error" />
      <div v-loading="loading" class="notification-scroll"
        ><ul
          ><li v-for="row in rows" :key="row.id" class="notification-row">
            <div data-testid="notification-avatar"
              ><ElAvatar :size="40" class="notification-avatar">{{
                userStore.info.userName?.trim().slice(0, 2).toUpperCase()
              }}</ElAvatar></div
            >
            <button
              type="button"
              class="notification-copy"
              :aria-label="row.title"
              :disabled="busy || loading"
              @click="show(row)"
              ><span class="notification-title" data-testid="notification-title">{{
                row.title
              }}</span
              ><span class="notification-message" data-testid="notification-content">{{
                row.content
              }}</span
              ><time class="notification-date">{{
                formatDateTime(row.published_at, timezone)
              }}</time></button
            >
            <ElButton
              text
              circle
              :type="row.read_at ? 'danger' : undefined"
              :disabled="busy || loading"
              :aria-label="$t(row.read_at ? 'msg.delete' : 'msg.markRead')"
              :title="$t(row.read_at ? 'msg.delete' : 'msg.markRead')"
              @click="row.read_at ? remove(row) : mark(row)"
              ><ArtSvgIcon :icon="row.read_at ? 'ri:close-circle-line' : 'ri:checkbox-circle-line'"
            /></ElButton> </li></ul
        ><div v-if="!rows.length" class="notification-empty">{{
          $t(loading ? 'msg.loading' : 'msg.empty')
        }}</div></div
      >
      <footer class="notification-footer"
        ><ElButton text :disabled="busy || loading || !rows.length" @click="clearPreview">{{
          $t('msg.clear')
        }}</ElButton
        ><ElButton type="primary" size="small" @click="history">{{
          $t('msg.viewAll')
        }}</ElButton></footer
      >
    </section>
  </ElPopover>
  <ElDialog v-model="detail" :title="$t('msg.detail')" width="560px"
    ><template v-if="selected"
      ><h2>{{ selected.title }}</h2
      ><p class="notification-date">{{ formatDateTime(selected.published_at, timezone) }}</p
      ><p class="msg-content">{{ selected.content }}</p></template
    ></ElDialog
  >
  <ElDialog v-model="historyOpen" :title="$t('msg.history')" fullscreen :show-close="true"
    ><MessageTable v-if="historyOpen" embedded @close="historyOpen = false"
  /></ElDialog>
</template>
<style scoped>
  .art-notification-panel {
    color: var(--el-text-color-primary);
  }
  .notification-heading,
  .notification-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
  }
  .notification-heading h2 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
  }
  .notification-footer {
    border-top: 1px solid var(--el-border-color);
  }
  .notification-scroll {
    max-height: 360px;
    overflow-y: auto;
  }
  .notification-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-top: 1px solid var(--el-border-color);
  }
  .notification-row:hover {
    background: var(--el-fill-color-light);
  }
  .notification-row > [data-testid='notification-avatar'] {
    align-self: start;
  }
  .notification-avatar {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
    font-size: 14px;
    font-weight: 500;
  }
  .notification-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    text-align: start;
  }
  .notification-title,
  .notification-message,
  .notification-date {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 20px;
  }
  .notification-title {
    font-size: 14px;
    font-weight: 600;
  }
  .notification-message,
  .notification-date {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .notification-empty {
    display: flex;
    min-height: 144px;
    align-items: center;
    justify-content: center;
    padding: 16px;
    color: var(--el-text-color-secondary);
  }
  .msg-content {
    max-height: 384px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
