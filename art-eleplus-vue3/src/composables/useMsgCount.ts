import { onMounted, onBeforeUnmount, ref } from 'vue'
import { msgApi } from '@/api/msg'
export function useMsgCount() {
  const count = ref<number | null>(null)
  let disposed = false,
    busy = false,
    queued = false
  async function refresh() {
    if (disposed || document.hidden) return
    if (busy) {
      queued = true
      return
    }
    busy = true
    try {
      const result = await msgApi.count()
      if (!disposed) count.value = result.count
    } catch {
      if (!disposed) count.value = null
    } finally {
      busy = false
      if (queued && !disposed) {
        queued = false
        void refresh()
      }
    }
  }
  let timer: ReturnType<typeof setInterval>
  onMounted(() => {
    void refresh()
    timer = setInterval(refresh, 30000)
    window.addEventListener('cinch-msg-changed', refresh)
    document.addEventListener('visibilitychange', refresh)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(timer)
    window.removeEventListener('cinch-msg-changed', refresh)
    document.removeEventListener('visibilitychange', refresh)
  })
  return count
}
