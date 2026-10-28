import { ref, onMounted, onBeforeUnmount } from 'vue'
import { effectiveTimezone } from './model'
export function useAdminTimezone() {
  const zone = ref(effectiveTimezone(localStorage.getItem('art-timezone') || undefined))
  function changed(event: Event) {
    zone.value = effectiveTimezone((event as CustomEvent<string>).detail)
  }
  onMounted(() => window.addEventListener('art-timezone-change', changed))
  onBeforeUnmount(() => window.removeEventListener('art-timezone-change', changed))
  return zone
}

const pageKey = 'go-cinch-pc-default-page-size'
function readSize() {
  const value = Number(localStorage.getItem(pageKey))
  return Number.isInteger(value) && value >= 10 && value <= 200 ? value : 20
}
export function setDefaultPageSize(value: number | undefined) {
  if (value === undefined || !Number.isInteger(value) || value < 10 || value > 200) return
  localStorage.setItem(pageKey, String(value))
  window.dispatchEvent(new Event('cinch-page-size-changed'))
}
export function useDefaultPageSize() {
  const size = ref(readSize())
  const changed = () => {
    size.value = readSize()
  }
  onMounted(() => {
    window.addEventListener('cinch-page-size-changed', changed)
    window.addEventListener('storage', changed)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('cinch-page-size-changed', changed)
    window.removeEventListener('storage', changed)
  })
  return size
}
