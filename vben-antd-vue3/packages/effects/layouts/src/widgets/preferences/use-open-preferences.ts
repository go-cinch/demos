import type { InjectionKey } from 'vue';

import { inject, provide } from 'vue';

const openPreferencesKey: InjectionKey<() => void> = Symbol('openPreferences');

function provideOpenPreferences(open: () => void) {
  provide(openPreferencesKey, open);
}

function useOpenPreferences() {
  return inject(openPreferencesKey, undefined);
}

export { provideOpenPreferences, useOpenPreferences };
