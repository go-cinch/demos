import type { TabDefinition } from '@vben-core/typings';

import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerTabCloseGuard } from '../tab-close-guards';
import { useTabbarStore } from './tabbar';

vi.mock('@vben-core/preferences', () => ({
  preferences: { tabbar: { maxCount: 0, visitHistory: false } },
}));
const cleanup: (() => void)[] = [];
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
});

async function setup(current = '/editor', affix = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/home', '/editor', '/other'].map((path) => ({
      path,
      name: path,
      component: { render: () => null },
    })),
  });
  await router.push(current);
  const store = useTabbarStore();
  const tabs = ['/home', '/editor', '/other'].map((path) =>
    store.addTab({
      path,
      fullPath: path,
      name: path,
      meta: { affixTab: affix && path === '/home' },
    } as TabDefinition),
  );
  return { router, store, tabs };
}

describe('closing tabs with unsaved state', () => {
  it('keeps a current tab and its route while its close guard is pending or cancelled', async () => {
    const { store, router, tabs } = await setup();
    let decide!: (allowed: boolean) => void;
    cleanup.push(
      registerTabCloseGuard(
        '/editor',
        () =>
          new Promise((resolve) => {
            decide = resolve;
          }),
      ),
    );
    const pending = store.closeTab(tabs[1]!, router);
    expect(store.tabs).toHaveLength(3);
    expect(router.currentRoute.value.path).toBe('/editor');
    decide(false);
    await pending;
    expect(store.tabs).toHaveLength(3);
    expect(router.currentRoute.value.path).toBe('/editor');
  });

  it('navigates before removing the active tab and preserves it on route cancellation', async () => {
    const { store, router, tabs } = await setup();
    const removeGuard = router.beforeEach((to) => to.path !== '/other');
    await store.closeTab(tabs[1]!, router);
    expect(store.tabs).toHaveLength(3);
    expect(router.currentRoute.value.path).toBe('/editor');
    removeGuard();
    await store.closeTab(tabs[1]!, router);
    expect(store.tabs.map((tab) => tab.path)).toEqual(['/home', '/other']);
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it.each(['closeLeftTabs', 'closeRightTabs', 'closeOtherTabs'] as const)(
    'makes %s atomic when any selected tab refuses closure',
    async (operation) => {
      const { store, tabs } = await setup('/home');
      cleanup.push(registerTabCloseGuard('/editor', () => false));
      const target = operation === 'closeLeftTabs' ? tabs[2]! : tabs[0]!;
      await store[operation](target);
      expect(store.tabs.map((tab) => tab.path)).toEqual([
        '/home',
        '/editor',
        '/other',
      ]);
    },
  );

  it('retains affix tabs without prompting them when closing all tabs', async () => {
    const { store, router } = await setup('/editor', true);
    const pinned = vi.fn(() => false);
    const editor = vi.fn(() => true);
    cleanup.push(
      registerTabCloseGuard('/home', pinned),
      registerTabCloseGuard('/editor', editor),
    );
    await store.closeAllTabs(router);
    expect(pinned).not.toHaveBeenCalled();
    expect(editor).toHaveBeenCalledOnce();
    expect(store.tabs.map((tab) => tab.path)).toEqual(['/home']);
    expect(router.currentRoute.value.path).toBe('/home');
  });

  it('does not navigate or remove any tabs when close-all is cancelled', async () => {
    const { store, router } = await setup();
    cleanup.push(registerTabCloseGuard('/editor', () => false));
    await store.closeAllTabs(router);
    expect(store.tabs).toHaveLength(3);
    expect(router.currentRoute.value.path).toBe('/editor');
  });
});
