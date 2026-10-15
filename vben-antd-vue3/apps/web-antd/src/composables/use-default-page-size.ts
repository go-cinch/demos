import { computed } from 'vue';

import { getCustomPreferences } from '@vben/preferences';

export function useDefaultPageSize() {
  const preferences = getCustomPreferences<{ defaultTableSize: number }>();
  return computed(() => preferences.defaultTableSize);
}
