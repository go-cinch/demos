import type { ResourceConfig } from './management-types';

import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, reactive, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useManagementData } from './use-management-data';

const summary = vi.hoisted(() => vi.fn());
vi.mock('#/api/system/insights', () => ({ getSystemSummary: summary }));
vi.mock('@vben/stores', () => ({ useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }) }));
vi.mock('#/composables/use-default-page-size', () => ({ useDefaultPageSize: () => ref(20) }));
afterEach(() => vi.resetAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function start(list = vi.fn()) {
  const canRead = ref(true);
  const filters = reactive<Record<string, unknown>>({});
  const clearDetails = vi.fn();
  let data!: ReturnType<typeof useManagementData>;
  const wrapper = mount(defineComponent({
    setup() {
      data = useManagementData({
        resource: () => 'role',
        config: computed(() => ({ api: { list } }) as unknown as ResourceConfig),
        canRead, filters, fields: () => 'id,name', clearDetails,
        onOverview: vi.fn(), onRangeChange: vi.fn(),
      });
      return () => null;
    },
  }));
  return { wrapper, data, list, filters, canRead, clearDetails };
}

describe('management data ownership', () => {
  it('keeps the newest search result when older requests finish afterwards', async () => {
    const earlier = deferred<unknown>();
    const later = deferred<unknown>();
    const list = vi.fn().mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    const { wrapper, data, filters } = start(list);
    try {
      const first = data.loadData();
      filters.name = 'latest';
      const second = data.loadData();
      later.resolve({ items: [{ id: 2, name: 'latest' }], t: 1 });
      await second;
      earlier.resolve({ items: [{ id: 1, name: 'obsolete' }], t: 99 });
      await first;
      expect(data.records.value).toEqual([{ id: 2, name: 'latest' }]);
      expect(data.pagination.total).toBe(1);
      expect(data.loading.value).toBe(false);
      expect(data.isCurrentQuery()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('discards pending responses when page permission is revoked', async () => {
    const response = deferred<unknown>();
    const { wrapper, data, canRead, clearDetails } = start(vi.fn().mockReturnValue(response.promise));
    try {
      const request = data.loadData();
      canRead.value = false;
      await flushPromises();
      response.resolve({ items: [{ id: 7 }], t: 1 });
      await request;
      expect(data.records.value).toEqual([]);
      expect(data.loading.value).toBe(false);
      expect(clearDetails).toHaveBeenCalledOnce();
    } finally { wrapper.unmount(); }
  });

  it('does not publish list or summary responses after its owner unmounts', async () => {
    const listResponse = deferred<unknown>();
    const summaryResponse = deferred<unknown>();
    summary.mockReturnValue(summaryResponse.promise);
    const { wrapper, data } = start(vi.fn().mockReturnValue(listResponse.promise));
    const request = data.refreshAll();
    wrapper.unmount();
    listResponse.resolve({ items: [{ id: 7 }], t: 1 });
    summaryResponse.resolve({ total: 1, trend: [] });
    await request;
    expect(data.records.value).toEqual([]);
    expect(data.summary.value).toBeUndefined();
  });
});
