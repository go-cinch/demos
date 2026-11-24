import { createApp, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import SearchPanel from './search-panel.vue';

vi.mock('@vben/locales', async (original) => ({
  ...(await original<typeof import('@vben/locales')>()),
  $t: (key: string) => key,
}));

it('returns to the source page when going back after selecting a search result', async () => {
  const source = '/system/user?page=2';
  const dictionary = { name: 'Dictionary', path: '/system/dictionary' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/system/user', dictionary.path].map((path) => ({
      component: { render: () => null },
      path,
    })),
  });
  await router.push('/');
  await router.push(source);
  const host = document.createElement('div');
  const app = createApp(() =>
    h(SearchPanel, { keyword: dictionary.name, menus: [dictionary] }),
  );
  app.use(router);
  app.mount(host);
  try {
    const result = host.querySelector('button');
    expect(result?.textContent).toBe(dictionary.name);
    required(result).click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.path).toBe(dictionary.path),
    );
    router.back();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(source),
    );
  } finally {
    app.unmount();
    localStorage.clear();
  }
});

it('isolates recent menu selections and removals even when both accounts have the same menu', async () => {
  const { userCache } = await import('@vben-core/shared/cache');
  const record = { name: 'Users', path: '/users' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', record.path].map((path) => ({
      path,
      component: { render: () => null },
    })),
  });
  await router.push('/');
  function panel(owner: string, keyword = '') {
    userCache.bind(owner);
    const host = document.createElement('div');
    const app = createApp(() => h(SearchPanel, { keyword, menus: [record] }));
    app.use(router);
    app.mount(host);
    return { host, app };
  }
  for (const owner of ['A', 'B']) {
    const empty = panel(owner);
    expect(empty.host.querySelector('button')).toBeNull();
    empty.app.unmount();
    const search = panel(owner, 'Users');
    required(search.host.querySelector('button')).click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.path).toBe('/users'),
    );
    search.app.unmount();
  }
  const b = panel('B');
  required(b.host.querySelectorAll('button')[1]).click();
  b.app.unmount();
  const a = panel('A');
  expect(a.host.querySelector('button')?.textContent).toBe('Users');
  a.app.unmount();
  userCache.bind(undefined);
  localStorage.clear();
});
