import { messageAttention } from '@/utils/message-attention'
import { useUserStore } from '@/store/modules/user'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { msgApi } from '@/api/msg'
export function useMsgCount() {
  const user = useUserStore()
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
      const result = await msgApi.count(user.info.userId)
      if (!disposed) {
        messageAttention.update(result)
        count.value = messageAttention.count(user.info.userId)
      }
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
  function syncSeen() {
    count.value = messageAttention.count(user.info.userId)
  }
  let timer: ReturnType<typeof setInterval>
  onMounted(() => {
    void refresh()
    timer = setInterval(refresh, 30000)
    window.addEventListener('cinch-msg-seen', syncSeen)
    window.addEventListener('storage', syncSeen)
    window.addEventListener('cinch-msg-changed', refresh)
    document.addEventListener('visibilitychange', refresh)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(timer)
    window.removeEventListener('cinch-msg-seen', syncSeen)
    window.removeEventListener('storage', syncSeen)
    window.removeEventListener('cinch-msg-changed', refresh)
    document.removeEventListener('visibilitychange', refresh)
  })
  return count
}
