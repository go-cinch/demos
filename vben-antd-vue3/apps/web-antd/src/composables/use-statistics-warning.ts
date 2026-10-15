import type { MaybeRefOrGetter } from 'vue';

import { readonly, ref, toValue, watch } from 'vue';

/** Hide only the warning, preserving the failed state and unavailable data. */
export function useStatisticsWarning(error: MaybeRefOrGetter<boolean>) {
  const visible = ref(false);
  watch(
    () => toValue(error),
    (failed, _previous, onCleanup) => {
      visible.value = failed;
      if (!failed) return;
      const timer = setTimeout(() => { visible.value = false; }, 5000);
      onCleanup(() => clearTimeout(timer));
    },
    { immediate: true },
  );
  return readonly(visible);
}
