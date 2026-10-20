import { defineComponent, nextTick, reactive } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it, vi } from 'vitest';

import { auditApi } from '#/api/audit';

import { useAudit } from './use-audit';

vi.mock('#/composables/use-permissions', () => ({ usePermissions: () => ({ hasPage: () => true, hasButton: () => true }) }));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
  useUserStore: () => ({ userInfo: { userId: 1 } }),
}));
vi.mock('@vben/utils', () => ({ formatDateTime: String }));
vi.mock('@vben/preferences', () => ({ getCustomPreferences: () => settings }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/audit/login', query: {} }) }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/api/audit', () => ({ auditApi: {
  list: vi.fn(async () => ({ items: [], t: 100, p: 1, s: 20 })),
  summary: vi.fn(async () => ({})),
} }));

const settings = reactive({ defaultTableSize: 20 });
dayjs.extend(utc);
dayjs.extend(timezone);

describe.each(['login', 'operation'] as const)('%s pagination preference', (kind) => {
  it('loads the saved size and resets a later page when the preference changes', async () => {
    settings.defaultTableSize = 20;
    vi.clearAllMocks();
    let state!: ReturnType<typeof useAudit>;
    const wrapper = mount(defineComponent({
      setup() { state = useAudit(kind); return () => null; },
    }));
    try {
      await flushPromises();
      expect(auditApi.list).toHaveBeenLastCalledWith(kind, expect.objectContaining({ p: 1, s: 20 }));
      state.page.value = 3;
      state.size.value = 50;
      await state.loadRecords();
      expect(auditApi.list).toHaveBeenLastCalledWith(kind, expect.objectContaining({ p: 3, s: 50 }));
      settings.defaultTableSize = 30;
      await nextTick();
      await flushPromises();
      expect(state.page.value).toBe(1);
      expect(state.size.value).toBe(30);
      expect(auditApi.list).toHaveBeenLastCalledWith(kind, expect.objectContaining({ p: 1, s: 30 }));
    } finally {
      wrapper.unmount();
    }
  });
});


describe.each(['login', 'operation'] as const)('%s summary selection', (kind) => {
  it('requests only overview or drilldown fields and keeps f out of list filters', async () => {
    vi.clearAllMocks();
    let state!: ReturnType<typeof useAudit>;
    const wrapper = mount(defineComponent({
      setup() { state = useAudit(kind); return () => null; },
    }));
    try {
      await flushPromises();
      expect(auditApi.summary).toHaveBeenLastCalledWith(kind, expect.objectContaining({
        f: kind === 'login' ? 'metrics,trend,heatmap,accounts,sources' : 'metrics,trend,modules',
      }));
      state.days.value = 30;
      await state.refresh();
      expect(auditApi.summary).toHaveBeenLastCalledWith(kind, expect.objectContaining({
        f: kind === 'login' ? 'metrics,trend,heatmap,accounts,sources' : 'metrics,trend,modules',
      }));
      state.selectInterval(Date.now() - 3600000, Date.now());
      await flushPromises();
      expect(auditApi.summary).toHaveBeenLastCalledWith(kind, expect.objectContaining({
        f: kind === 'login' ? 'metrics,heatmap,accounts,sources' : 'modules',
      }));
      expect(vi.mocked(auditApi.list).mock.calls.at(-1)?.[1].f).toBe(kind === 'login' ? 'id,occurred_at,username,status,ip,user_agent' : 'id,occurred_at,module,method,path,username,status,duration_ms');
    } finally { wrapper.unmount(); }
  });
});

describe.each(['login', 'operation'] as const)('%s chart filters', (kind) => {
  it('shares search and result filters across overview, drilldown and records, but not pagination', async () => {
    vi.clearAllMocks();
    let state!: ReturnType<typeof useAudit>;
    const wrapper = mount(defineComponent({ setup() { state = useAudit(kind); return () => null; } }));
    try {
      await flushPromises();
      const initial = vi.mocked(auditApi.summary).mock.calls.at(-1)![1];
      state.selectInterval(Number(initial.to) - 3600000, Number(initial.to));
      await flushPromises();
      for (const result of ['success', 'failure']) {
        vi.clearAllMocks();
        state.result.value = result;
        state.q.value = ' trace ';
        state.module.value = 'auth';
        state.exact.value = { username: 'alice', ip: '127.0.0.1', path: '/auth/pub/login' };
        state.page.value = 3;
        await state.applyFilters();
        expect(state.page.value).toBe(1);
        const filters = { result, q: 'trace', module: 'auth', ...state.exact.value };
        expect(auditApi.list).toHaveBeenLastCalledWith(kind, expect.objectContaining(filters));
        expect(auditApi.summary).toHaveBeenCalledTimes(2);
        for (const [, params] of vi.mocked(auditApi.summary).mock.calls) {
          expect(params).toMatchObject(filters);
          expect(params).not.toHaveProperty('sort');
          expect(params).not.toHaveProperty('p');
        }
        expect(vi.mocked(auditApi.summary).mock.calls.at(-1)![1]).toMatchObject({ from: initial.from, to: initial.to });
      }
      vi.clearAllMocks();
      state.page.value = 2;
      await state.loadRecords();
      expect(auditApi.summary).not.toHaveBeenCalled();
      state.reset();
      await flushPromises();
      expect(state.interval.value).toBeUndefined();
      const reset = vi.mocked(auditApi.summary).mock.calls.at(-1)![1];
      for (const key of ['q', 'result', 'module', 'username', 'ip', 'path']) expect(reset).not.toHaveProperty(key);
    } finally { wrapper.unmount(); }
  });

  it('refreshes summaries for exact filter additions/removals and debounced search', async () => {
    vi.clearAllMocks();
    let state!: ReturnType<typeof useAudit>;
    const wrapper = mount(defineComponent({ setup() { state = useAudit(kind); return () => null; } }));
    try {
      await flushPromises();
      state.related('username', 'alice');
      await flushPromises();
      expect(auditApi.summary).toHaveBeenLastCalledWith(kind, expect.objectContaining({ username: 'alice' }));
      state.removeExact('username');
      await flushPromises();
      expect(vi.mocked(auditApi.summary).mock.calls.at(-1)![1]).not.toHaveProperty('username');
      vi.useFakeTimers();
      state.q.value = 'missing';
      state.searchSoon();
      await vi.advanceTimersByTimeAsync(300);
      expect(auditApi.summary).toHaveBeenLastCalledWith(kind, expect.objectContaining({ q: 'missing' }));
    } finally { vi.useRealTimers(); wrapper.unmount(); }
  });
});

it('refreshes the parent day heatmap with current filters while preserving an hour selection', async () => {
  vi.clearAllMocks();
  let state!: ReturnType<typeof useAudit>;
  const wrapper = mount(defineComponent({ setup() { state = useAudit('login'); return () => null; } }));
  try {
    await flushPromises();
    const to = Date.now();
    const day = { started_at: to - 86400000, ended_at: to, count: 20, failed: 2, weekday: 1, hour: 0 };
    state.heatmapDay.value = day;
    await state.selectCell(day);
    vi.clearAllMocks();
    await state.selectCell({ ...day, ended_at: day.started_at + 3600000 });
    expect(auditApi.summary).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auditApi.summary).mock.calls[0]![1].f).toBe('metrics,heatmap,accounts,sources');
    vi.clearAllMocks();
    state.result.value = 'failure';
    await state.applyFilters();
    expect(auditApi.summary).toHaveBeenCalledWith('login', expect.objectContaining({
      f: 'heatmap', from: day.started_at, to: day.ended_at, result: 'failure',
    }));
    expect(auditApi.list).toHaveBeenLastCalledWith('login', expect.objectContaining({
      from: day.started_at, to: day.started_at + 3600000, result: 'failure',
    }));
  } finally { wrapper.unmount(); }
});
