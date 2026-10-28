import { readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
/** Hide the warning after five seconds while keeping failed statistics unavailable. */
export function useStatisticsWarning(error: MaybeRefOrGetter<boolean>) {
  const visible = ref(false)
  watch(
    () => toValue(error),
    (failed, _previous, onCleanup) => {
      visible.value = failed
      if (!failed) return
      const timer = setTimeout(() => {
        visible.value = false
      }, 5000)
      onCleanup(() => clearTimeout(timer))
    },
    { immediate: true }
  )
  return readonly(visible)
}
