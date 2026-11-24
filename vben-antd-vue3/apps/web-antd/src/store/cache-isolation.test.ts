import { createApp, defineComponent } from 'vue';

import { preferencesManager } from '@vben/preferences';
import { initStores, useAccessStore, useTabbarStore } from '@vben/stores';
import { userCache } from '@vben/utils/cache';

import { describe, expect, it } from 'vitest';

describe('vben account cache lifecycle', () => {
  it('restores only the owner’s preferences and tabs on A → B → A, including a pending debounced save', async () => {
    localStorage.clear();
    sessionStorage.clear();
    userCache.configure('integration', '/auth');
    userCache.bind(undefined);
    const app = createApp(defineComponent({ render: () => null }));
    const pinia = await initStores(app, { namespace: 'integration' });
    await preferencesManager.initPreferences({
      namespace: 'integration',
      overrides: { theme: { mode: 'auto' } },
    });
    const tabs = useTabbarStore(pinia);
    const access = useAccessStore(pinia);
    preferencesManager.updatePreferences({ theme: { mode: 'auto' } });
    userCache.bind('A');
    preferencesManager.updatePreferences({ theme: { mode: 'dark' } });
    tabs.visitHistory.push('/audit/login?username=alice');
    access.setAccessCodes(['A-only']);
    userCache.bind('B');
    expect(access.accessCodes).toEqual([]);
    expect(tabs.visitHistory.toArray()).not.toContain(
      '/audit/login?username=alice',
    );
    expect(preferencesManager.getPreferences().theme.mode).not.toBe('dark');
    preferencesManager.updatePreferences({ theme: { mode: 'light' } });
    tabs.visitHistory.push('/profile');
    userCache.bind(undefined);
    expect(preferencesManager.getPreferences().theme.mode).toBe('auto');
    userCache.bind('A');
    expect(preferencesManager.getPreferences().theme.mode).toBe('dark');
    expect(tabs.visitHistory.toArray()).toContain(
      '/audit/login?username=alice',
    );
    expect(tabs.visitHistory.toArray()).not.toContain('/profile');
  });
});
