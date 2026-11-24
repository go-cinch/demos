import type { Pinia } from 'pinia';

import type { App } from 'vue';

import { watch } from 'vue';

import { userCache } from '@vben-core/shared/cache';

import { createPinia } from 'pinia';

import { useAccessStore, useTabbarStore, useUserStore } from './modules';
import { browserSession } from './session-persistence';

let pinia: Pinia;

export interface InitStoreOptions {
  namespace: string;
}

export async function initStores(app: App, { namespace }: InitStoreOptions) {
  const { createPersistedState } = await import('pinia-plugin-persistedstate');
  pinia = createPinia();
  pinia.use((context) => {
    if (!context.options.persist) return;
    let cache = userCache.current().child('pinia');
    let switching = false;
    createPersistedState({
      storage: {
        getItem: (key) => cache.getItem(key),
        setItem: (key, raw) => {
          if (!switching) cache.setItem(key, raw);
        },
      },
    })(context);
    const store = context.store;
    const stop = userCache.onChange(() => {
      store.$persist();
      switching = true;
      try {
        cache = userCache.current().child('pinia');
        store.$reset();
        store.$hydrate();
      } finally {
        switching = false;
      }
    });
    const dispose = store.$dispose;
    store.$dispose = () => {
      stop();
      dispose();
    };
  });
  app.use(pinia);
  const access = useAccessStore(pinia);
  const restored = browserSession.initialize(namespace);
  if (restored) {
    access.setRefreshToken(restored.token);
    if (restored.lock) access.lockScreen(restored.lock);
  }
  watch(
    () => access.lockScreenPassword,
    (password) => browserSession.lock(password),
    { flush: 'sync' },
  );

  const tabs = useTabbarStore(pinia);
  let restoring = false;
  let cache = userCache.current('session');
  userCache.onChange(() => {
    access.setAccessCodes([]);
    access.setAccessMenus([]);
    access.setAccessRoutes([]);
    access.setIsAccessChecked(false);
    useUserStore(pinia).$reset();
    cache = userCache.current('session');
    restoring = true;
    try {
      tabs.restoreWorkspace(cache.get('workspace'));
    } finally {
      restoring = false;
    }
  });
  tabs.$subscribe(
    (_mutation, state) => {
      if (!restoring && userCache.account)
        cache.set('workspace', {
          tabs: state.tabs,
          visitHistory: state.visitHistory,
        });
    },
    { detached: true, flush: 'sync' },
  );
  return pinia;
}

export function resetAllStores() {
  if (!pinia) return;
  for (const store of (pinia as any)._s.values()) store.$reset();
}
