import type { Msg } from '@/api/msg'

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useUserStore } from '@/store/modules/user'

import { ElMessageBox } from 'element-plus'

import { visitMessages } from '@/utils/message-attention'
import { msgApi, msgChanged } from '@/api/msg'
import { $t } from '@/locales'
import { usePermissions } from '@/composables/use-permissions'
import { markMessageRead } from '@/utils/message-read-policy'

const PAGE_SIZE = 10
type Filter = 'all' | 'notice' | 'read' | 'system' | 'unread'

export function useInboxFeed() {
  const store = useUserStore()
  const { hasButton } = usePermissions()
  const canControl = (control: string) => hasButton(`admin:btn:msg:inbox:${control}`, '/msg/inbox')
  const canSelect = computed(
    () => canControl('delete-selected') || canControl('mark-selected-read')
  )
  const user = {
    get userInfo() {
      return store.info.userId ? store.info : undefined
    }
  }
  const rows = ref<Msg[]>([])
  const total = ref(0)
  const unread = ref<number>()
  const filter = ref<Filter>('all')
  const query = ref('')
  const draft = ref('')
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref(false)
  const moreError = ref(false)
  const busy = ref(false)
  const pages = ref(0)
  const exhausted = ref(false)
  const expanded = ref<number[]>([])
  const detailLoading = ref<number>()
  const detailError = ref<number>()
  const selecting = ref(false)
  const selected = ref<number[]>([])
  const viewport = ref<HTMLElement>()
  const newMessages = ref(false)
  const history = ref<string[]>([])
  const suggestions = ref<string[]>([])
  const suggesting = ref(false)
  let disposed = false
  let generation = 0
  let suggestionGeneration = 0
  let detailGeneration = 0
  let needsRebase = false
  let latest: null | number | undefined
  let timer: ReturnType<typeof setInterval>
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let suggestionTimer: ReturnType<typeof setTimeout> | undefined
  const hasMore = computed(() => !exhausted.value && rows.value.length < total.value)
  const options = computed(() => {
    const text = draft.value.trim().toLocaleLowerCase()
    const recent = history.value.filter((value) => value.toLocaleLowerCase().includes(text))
    return [
      ...recent.map((value) => ({ value, source: 'history' })),
      ...suggestions.value
        .filter((value) => !recent.includes(value))
        .map((value) => ({ value, source: 'backend' }))
    ].slice(0, 8)
  })
  const filters = computed(() => [
    { value: 'all', label: $t('pc.msg.feedAll') },
    { value: 'unread', label: $t('pc.msg.unread') },
    { value: 'read', label: $t('pc.msg.read') },
    { value: 'notice', label: $t('pc.msg.notice') },
    { value: 'system', label: $t('pc.msg.system') }
  ])
  function params() {
    return {
      ...(query.value ? { q: query.value } : {}),
      ...(['notice', 'system'].includes(filter.value) ? { type: filter.value } : {}),
      ...(['read', 'unread'].includes(filter.value) ? { read: filter.value === 'read' } : {})
    }
  }
  async function count(notify = false) {
    const id = Number(user.userInfo?.userId)
    try {
      const value = await msgApi.count(id)
      if (disposed || Number(user.userInfo?.userId) !== id) return
      if (
        notify &&
        latest !== undefined &&
        (value.count !== unread.value || value.latest_unread_at !== latest)
      )
        newMessages.value = true
      unread.value = value.count
      latest = value.latest_unread_at
    } catch {
      if (!disposed) unread.value = undefined
    }
  }
  // Re-read the loaded prefix after writes: offset pagination would otherwise skip
  // records removed by read/unread filters or personal deletion.
  async function refresh(reset = false) {
    const run = ++generation
    const depth = reset ? 1 : Math.max(pages.value, 1)
    const criteria = params()
    const scrollTop = reset ? 0 : (viewport.value?.scrollTop ?? 0)
    loading.value = true
    loadingMore.value = false
    error.value = false
    moreError.value = false
    if (reset) {
      rows.value = []
      pages.value = 0
      total.value = 0
      expanded.value = []
      selected.value = []
      detailGeneration++
      detailLoading.value = undefined
      detailError.value = undefined
      viewport.value?.scrollTo({ top: 0 })
    }
    try {
      const collected = new Map<number, Msg>()
      let loaded = 0
      let available = 0
      let ended = false
      for (let page = 1; page <= depth; page++) {
        const result = await msgApi.list(false, { ...criteria, p: page, s: PAGE_SIZE })
        if (disposed || run !== generation) return
        available = result.t
        loaded = page
        result.items.forEach((row) => {
          const previous = rows.value.find((item) => item.id === row.id)
          collected.set(
            row.id,
            expanded.value.includes(row.id) && previous?.content !== undefined
              ? { ...row, content: previous.content }
              : row
          )
        })
        ended = result.items.length < PAGE_SIZE || page * PAGE_SIZE >= available
        if (ended) break
      }
      rows.value = [...collected.values()]
      total.value = available
      pages.value = loaded
      exhausted.value = ended
      selected.value = selected.value.filter((id) => collected.has(id))
      expanded.value = expanded.value.filter((id) => collected.has(id))
      newMessages.value = false
      needsRebase = false
      await nextTick()
      if (run === generation && viewport.value) viewport.value.scrollTop = scrollTop
    } catch {
      if (run === generation && !disposed) error.value = true
    } finally {
      if (run === generation && !disposed) loading.value = false
    }
    if (!disposed && run === generation) void count()
  }
  async function more(): Promise<void> {
    if (
      disposed ||
      loading.value ||
      loadingMore.value ||
      busy.value ||
      error.value ||
      !hasMore.value
    )
      return
    if (needsRebase) {
      await refresh()
      if (!disposed && !error.value) return more()
      return
    }
    const run = generation
    loadingMore.value = true
    moreError.value = false
    try {
      const result = await msgApi.list(false, { ...params(), p: pages.value + 1, s: PAGE_SIZE })
      if (disposed || run !== generation) return
      if (result.t < total.value) {
        await refresh()
        if (!disposed && !error.value) await more()
        return
      }
      const known = new Set(rows.value.map((row) => row.id))
      rows.value.push(...result.items.filter((row) => !known.has(row.id)))
      pages.value++
      total.value = result.t
      exhausted.value = result.items.length < PAGE_SIZE || pages.value * PAGE_SIZE >= result.t
    } catch {
      if (!disposed && run === generation) moreError.value = true
    } finally {
      if (!disposed && run === generation) loadingMore.value = false
    }
  }
  function onScroll() {
    const el = viewport.value
    if (el && !moreError.value && el.scrollHeight - el.scrollTop - el.clientHeight < 100)
      void more()
  }
  function search() {
    clearTimeout(searchTimer)
    if (busy.value) return
    const value = draft.value.trim()
    if (value)
      history.value = [value, ...history.value.filter((item) => item !== value)].slice(0, 8)
    if (query.value === value) return
    query.value = value
    void refresh(true)
  }
  function suggest(text: string) {
    clearTimeout(suggestionTimer)
    const run = ++suggestionGeneration
    suggestions.value = []
    suggesting.value = !!text.trim()
    if (!text.trim()) {
      search()
      return
    }
    suggestionTimer = setTimeout(async () => {
      try {
        const result = await msgApi.list(false, { f: 'title', p: 1, s: 8, q: text.trim() })
        if (!disposed && run === suggestionGeneration)
          suggestions.value = [...new Set(result.items.map((row) => row.title))]
      } catch {
        /* The request client reports failures; keep query history available. */
      } finally {
        if (!disposed && run === suggestionGeneration) suggesting.value = false
      }
    }, 250)
  }
  function scheduleSearch() {
    searchTimer = setTimeout(search, 300)
  }
  function cancelSearch() {
    clearTimeout(searchTimer)
  }
  function choose(value: unknown) {
    draft.value = String(value)
    search()
  }
  function segments(value: string) {
    const text = draft.value.trim()
    const index = text ? value.toLocaleLowerCase().indexOf(text.toLocaleLowerCase()) : -1
    return index < 0
      ? [{ text: value, matched: false }]
      : [
          { text: value.slice(0, index), matched: false },
          { text: value.slice(index, index + text.length), matched: true },
          { text: value.slice(index + text.length), matched: false }
        ]
  }
  async function mutate(action: () => Promise<unknown>) {
    if (busy.value || disposed) return
    busy.value = true
    // Pending append responses must not restore deleted or unread records.
    generation++
    loadingMore.value = false
    try {
      await action()
    } catch {
      /* Shared request notifications retain the server error. */
    } finally {
      msgChanged()
      if (!disposed) await refresh()
      busy.value = false
    }
  }
  async function toggle(row: Msg) {
    if (busy.value || loading.value || detailLoading.value !== undefined) return
    if (expanded.value.includes(row.id)) {
      expanded.value = expanded.value.filter((id) => id !== row.id)
      if (filter.value === 'unread' && row.read_at) void refresh()
      return
    }
    const run = ++detailGeneration
    detailLoading.value = row.id
    detailError.value = undefined
    busy.value = true
    generation++
    loadingMore.value = false
    try {
      const value = await msgApi.get(row.id, false)
      if (disposed || run !== detailGeneration) return
      if (await markMessageRead(value, () => canControl('mark-read'), msgApi.read)) {
        needsRebase = filter.value === 'unread'
      }
      if (disposed || run !== detailGeneration) return
      rows.value = rows.value.map((item) => (item.id === row.id ? { ...item, ...value } : item))
      expanded.value.push(row.id)
      // Keep the opened unread item readable until collapsed or the filter changes.
      msgChanged()
      void count()
    } catch {
      if (!disposed && run === detailGeneration) detailError.value = row.id
    } finally {
      if (!disposed && run === detailGeneration) detailLoading.value = undefined
      busy.value = false
    }
  }
  function mark(row: Msg) {
    if (!canControl('mark-read')) return
    return mutate(() => markMessageRead(row, () => canControl('mark-read'), msgApi.read))
  }
  function readAll() {
    if (!canControl('read-all')) return
    return mutate(() => msgApi.readAll())
  }
  function confirmAction(read: boolean, ids: number[], bulk = false) {
    const control = read
      ? bulk
        ? 'mark-selected-read'
        : 'mark-read'
      : bulk
        ? 'delete-selected'
        : 'delete'
    if (busy.value || loading.value || !ids.length || !canControl(control)) return
    const remaining = [...ids]
    void ElMessageBox.confirm(
      $t(
        read
          ? 'pc.msg.readSelectedConfirm'
          : bulk
            ? 'pc.msg.deleteSelectedConfirm'
            : 'pc.msg.deleteConfirm'
      ),
      $t('pc.msg.confirm'),
      {
        confirmButtonText: $t('pc.msg.confirm'),
        cancelButtonText: $t('pc.msg.cancel'),
        type: read ? 'info' : 'warning'
      }
    )
      .then(async () => {
        if (disposed || !canControl(control)) return
        busy.value = true
        generation++
        loadingMore.value = false
        try {
          for (const id of [...remaining]) {
            if (!canControl(control)) break
            if (read) await msgApi.read(id)
            else await msgApi.remove(id, false)
            remaining.splice(remaining.indexOf(id), 1)
            selected.value = selected.value.filter((value) => value !== id)
          }
        } finally {
          msgChanged()
          if (!disposed) await refresh()
          busy.value = false
        }
      })
      .catch((reason) => {
        if (reason !== 'cancel' && reason !== 'close') error.value = true
      })
  }
  function check(id: number, checked: boolean) {
    if (!canSelect.value) return
    selected.value = checked
      ? [...new Set([...selected.value, id])]
      : selected.value.filter((value) => value !== id)
  }
  function changed() {
    if (disposed || busy.value || loading.value || document.hidden) return
    if ((viewport.value?.scrollTop ?? 0) > 0 || expanded.value.length || selected.value.length) {
      newMessages.value = true
      void count()
    } else void refresh()
  }
  function poll() {
    if (disposed || busy.value || loading.value || document.hidden) return
    if ((viewport.value?.scrollTop ?? 0) > 0 || expanded.value.length || selected.value.length)
      void count(true)
    else void refresh()
  }
  watch(canSelect, (allowed) => {
    if (!allowed) {
      selecting.value = false
      selected.value = []
    }
  })
  watch(filter, () => {
    void refresh(true)
  })
  watch(
    () => store.language,
    () => {
      suggestionGeneration++
      clearTimeout(suggestionTimer)
      suggestions.value = []
      suggesting.value = false
      void refresh()
    }
  )
  watch(
    () => user.userInfo?.userId,
    () => {
      suggestionGeneration++
      clearTimeout(suggestionTimer)
      clearTimeout(searchTimer)
      suggesting.value = false
      latest = undefined
      unread.value = undefined
      history.value = []
      suggestions.value = []
      draft.value = ''
      query.value = ''
      void refresh(true)
    }
  )
  onMounted(() => {
    visitMessages(Number(user.userInfo?.userId))
    void refresh(true)
    window.addEventListener('cinch-msg-changed', changed)
    document.addEventListener('visibilitychange', poll)
    timer = setInterval(poll, 30_000)
  })
  onBeforeUnmount(() => {
    disposed = true
    generation++
    detailGeneration++
    suggestionGeneration++
    clearInterval(timer)
    clearTimeout(searchTimer)
    clearTimeout(suggestionTimer)
    window.removeEventListener('cinch-msg-changed', changed)
    document.removeEventListener('visibilitychange', poll)
  })
  return {
    canControl,
    canSelect,
    rows,
    total,
    unread,
    filter,
    filters,
    draft,
    query,
    loading,
    loadingMore,
    error,
    moreError,
    busy,
    expanded,
    detailLoading,
    detailError,
    selecting,
    selected,
    viewport,
    newMessages,
    hasMore,
    options,
    suggesting,
    refresh,
    more,
    onScroll,
    search,
    suggest,
    scheduleSearch,
    cancelSearch,
    choose,
    segments,
    toggle,
    mark,
    readAll,
    confirmAction,
    check
  }
}
