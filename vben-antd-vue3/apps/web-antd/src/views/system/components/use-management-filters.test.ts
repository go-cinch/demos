import type { ResourceConfig } from './management-types';

import { computed, createApp, defineComponent, reactive } from 'vue';

import { userCache } from '@vben/utils/cache';

import { expect, it, vi } from 'vitest';

import { useManagementFilters } from './use-management-filters';

vi.mock('./management-resources', () => ({ apiByResource: {} }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

it('keeps management filter suggestions and deletions private on a shared browser', () => {
  localStorage.clear();
  const config = computed(
    () => ({ filters: [{ key: 'username', type: 'input' }] }) as ResourceConfig,
  );
  function open(owner: string, name = '') {
    userCache.bind(owner);
    let filters!: ReturnType<typeof useManagementFilters>;
    const app = createApp(
      defineComponent({
        setup() {
          filters = useManagementFilters(
            () => 'user',
            config,
            reactive({ username: name }),
            async () => {},
          );
          return () => null;
        },
      }),
    );
    app.mount(document.createElement('div'));
    return { filters, close: () => app.unmount() };
  }
  const a = open('A', 'alice');
  a.filters.saveFilterHistory();
  a.close();
  const b = open('B', 'alice');
  expect(b.filters.filterSuggestionOptions('username')).toEqual([]);
  b.filters.saveFilterHistory();
  b.filters.removeFilterHistory('username', 'alice');
  expect(b.filters.filterSuggestionOptions('username')).toEqual([]);
  b.close();
  const again = open('A');
  expect(
    again.filters.filterSuggestionOptions('username')[0]?.options[0]?.value,
  ).toBe('alice');
  again.close();
  userCache.bind(undefined);
});
