import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, KeepAlive, nextTick, reactive, ref } from 'vue';

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it, vi } from 'vitest';

import { auditApi } from '#/api/audit';

import { required } from '../../../../../scripts/test-utils/required';
import { useAudit } from './use-audit';

vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasPage: () => true, hasButton: () => true }),
}));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
  useUserStore: () => ({ userInfo: { userId: 1 } }),
}));
vi.mock('@vben/utils', () => ({ formatDateTime: String }));
vi.mock('@vben/preferences', () => ({ getCustomPreferences: () => settings }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/audit/login', query: {} }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/api/audit', () => ({
  auditApi: {
    list: vi.fn(async () => ({ items: [], t: 100, p: 1, s: 20 })),
    summary: vi.fn(async () => ({})),
    get: vi.fn(async () => ({})),
  },
}));

const settings = reactive({ defaultTableSize: 20 });
dayjs.extend(utc);
dayjs.extend(timezone);

describe.each(['login', 'operation'] as const)(
  '%s pagination preference',
  (kind) => {
    it('loads the saved size and resets a later page when the preference changes', async () => {
      settings.defaultTableSize = 20;
      vi.clearAllMocks();
      let state!: ReturnType<typeof useAudit>;
      const wrapper = mount(
        defineComponent({
          setup() {
            state = useAudit(kind);
            return () => null;
          },
        }),
      );
      try {
        await flushPromises();
        expect(auditApi.list).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({ p: 1, s: 20 }),
        );
        state.page.value = 3;
        state.size.value = 50;
        await state.loadRecords();
        expect(auditApi.list).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({ p: 3, s: 50 }),
        );
        settings.defaultTableSize = 30;
        await nextTick();
        await flushPromises();
        expect(state.page.value).toBe(1);
        expect(state.size.value).toBe(30);
        expect(auditApi.list).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({ p: 1, s: 30 }),
        );
      } finally {
        wrapper.unmount();
      }
    });
  },
);

describe.each(['login', 'operation'] as const)(
  '%s summary selection',
  (kind) => {
    it('requests only overview or drilldown fields and keeps f out of list filters', async () => {
      vi.clearAllMocks();
      let state!: ReturnType<typeof useAudit>;
      const wrapper = mount(
        defineComponent({
          setup() {
            state = useAudit(kind);
            return () => null;
          },
        }),
      );
      try {
        await flushPromises();
        expect(auditApi.summary).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({
            f:
              kind === 'login'
                ? 'metrics,trend,heatmap,accounts,sources'
                : 'metrics,trend,modules',
          }),
        );
        state.days.value = 30;
        await state.refresh();
        expect(auditApi.summary).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({
            f:
              kind === 'login'
                ? 'metrics,trend,heatmap,accounts,sources'
                : 'metrics,trend,modules',
          }),
        );
        state.selectInterval(Date.now() - 3_600_000, Date.now());
        await flushPromises();
        expect(auditApi.summary).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({
            f:
              kind === 'login' ? 'metrics,heatmap,accounts,sources' : 'modules',
          }),
        );
        expect(vi.mocked(auditApi.list).mock.calls.at(-1)?.[1].f).toBe(
          kind === 'login'
            ? 'id,occurred_at,operation,username,status,ip,user_agent,outcome'
            : 'id,occurred_at,module,method,path,operation,username,status,duration_ms',
        );
      } finally {
        wrapper.unmount();
      }
    });
  },
);

describe.each(['login', 'operation'] as const)('%s chart filters', (kind) => {
  it('shares search and result filters across overview, drilldown and records, but not pagination', async () => {
    vi.clearAllMocks();
    let state!: ReturnType<typeof useAudit>;
    const wrapper = mount(
      defineComponent({
        setup() {
          state = useAudit(kind);
          return () => null;
        },
      }),
    );
    try {
      await flushPromises();
      const initial = required(
        vi.mocked(auditApi.summary).mock.calls.at(-1),
      )[1];
      state.selectInterval(Number(initial.to) - 3_600_000, Number(initial.to));
      await flushPromises();
      for (const result of ['success', 'failure']) {
        vi.clearAllMocks();
        state.result.value = result;
        state.q.value = ' trace ';
        state.module.value = 'auth';
        state.exact.value = {
          username: 'alice',
          ip: '127.0.0.1',
          path: '/auth/pub/login',
        };
        state.page.value = 3;
        await state.applyFilters();
        expect(state.page.value).toBe(1);
        const filters = {
          result,
          q: 'trace',
          module: 'auth',
          ...state.exact.value,
        };
        expect(auditApi.list).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining(filters),
        );
        expect(auditApi.summary).toHaveBeenCalledTimes(2);
        for (const [, params] of vi.mocked(auditApi.summary).mock.calls) {
          expect(params).toMatchObject(filters);
          expect(params).not.toHaveProperty('sort');
          expect(params).not.toHaveProperty('p');
        }
        expect(
          required(vi.mocked(auditApi.summary).mock.calls.at(-1))[1],
        ).toMatchObject({ from: initial.from, to: initial.to });
      }
      vi.clearAllMocks();
      state.page.value = 2;
      await state.loadRecords();
      expect(auditApi.summary).not.toHaveBeenCalled();
      state.reset();
      await flushPromises();
      expect(state.interval.value).toBeUndefined();
      const reset = required(vi.mocked(auditApi.summary).mock.calls.at(-1))[1];
      for (const key of ['q', 'result', 'module', 'username', 'ip', 'path'])
        expect(reset).not.toHaveProperty(key);
    } finally {
      wrapper.unmount();
    }
  });

  it('refreshes summaries for exact filter additions/removals and debounced search', async () => {
    vi.clearAllMocks();
    let state!: ReturnType<typeof useAudit>;
    const wrapper = mount(
      defineComponent({
        setup() {
          state = useAudit(kind);
          return () => null;
        },
      }),
    );
    try {
      await flushPromises();
      state.related('username', 'alice');
      await flushPromises();
      expect(auditApi.summary).toHaveBeenLastCalledWith(
        kind,
        expect.objectContaining({ username: 'alice' }),
      );
      state.removeExact('username');
      await flushPromises();
      expect(
        required(vi.mocked(auditApi.summary).mock.calls.at(-1))[1],
      ).not.toHaveProperty('username');
      vi.useFakeTimers();
      state.q.value = 'missing';
      state.searchSoon();
      await vi.advanceTimersByTimeAsync(300);
      expect(auditApi.summary).toHaveBeenLastCalledWith(
        kind,
        expect.objectContaining({ q: 'missing' }),
      );
    } finally {
      vi.useRealTimers();
      wrapper.unmount();
    }
  });
});

it('refreshes the parent day heatmap with current filters while preserving an hour selection', async () => {
  vi.clearAllMocks();
  let state!: ReturnType<typeof useAudit>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useAudit('login');
        return () => null;
      },
    }),
  );
  try {
    await flushPromises();
    const to = Date.now();
    const day = {
      started_at: to - 86_400_000,
      ended_at: to,
      count: 20,
      failed: 2,
      weekday: 1,
      hour: 0,
    };
    state.heatmapDay.value = day;
    await state.selectCell(day);
    vi.clearAllMocks();
    await state.selectCell({ ...day, ended_at: day.started_at + 3_600_000 });
    expect(auditApi.summary).toHaveBeenCalledTimes(1);
    expect(required(vi.mocked(auditApi.summary).mock.calls[0])[1].f).toBe(
      'metrics,heatmap,accounts,sources',
    );
    vi.clearAllMocks();
    state.result.value = 'failure';
    await state.applyFilters();
    expect(auditApi.summary).toHaveBeenCalledWith(
      'login',
      expect.objectContaining({
        f: 'heatmap',
        from: day.started_at,
        to: day.ended_at,
        result: 'failure',
      }),
    );
    expect(auditApi.list).toHaveBeenLastCalledWith(
      'login',
      expect.objectContaining({
        from: day.started_at,
        to: day.started_at + 3_600_000,
        result: 'failure',
      }),
    );
  } finally {
    wrapper.unmount();
  }
});

it('caps successful search history at six and ignores failed searches', async () => {
  let state!: ReturnType<typeof useAudit>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useAudit('login');
        return () => null;
      },
    }),
  );
  try {
    await flushPromises();
    for (let index = 1; index <= 7; index++) {
      state.q.value = `account-${index}`;
      await state.applyFilters();
      expect(state.history.value).toHaveLength(Math.min(6, index));
    }
    expect(state.history.value).toEqual(
      [7, 6, 5, 4, 3, 2].map((id) => `account-${id}`),
    );
    state.q.value = 'account-4';
    await state.applyFilters();
    expect(state.history.value).toEqual(
      [4, 7, 6, 5, 3, 2].map((id) => `account-${id}`),
    );
    state.removeHistory('account-5');
    vi.mocked(auditApi.list).mockRejectedValueOnce(new Error('request failed'));
    state.q.value = 'failed-account';
    await state.applyFilters();
    expect(state.history.value).toEqual(
      [4, 7, 6, 3, 2].map((id) => `account-${id}`),
    );
  } finally {
    wrapper.unmount();
  }
});

describe.each(['login', 'operation'] as const)(
  '%s request generations',
  (kind) => {
    it('ignores stale list detail and summary results for both audit kinds', async () => {
      let state!: ReturnType<typeof useAudit>;
      const auditVisible = ref(true);
      const audit = defineComponent({
        setup() {
          state = useAudit(kind);
          return () => null;
        },
      });
      const other = defineComponent({
        setup: () => () => h('p', 'Other view'),
      });
      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(KeepAlive, null, () => h(auditVisible.value ? audit : other)),
        }),
      );
      const stale = {
        id: 1,
        occurred_at: 1,
        kind,
        user_id: 7,
        username: 'operator',
        module: 'auth',
        method: 'GET',
        path: '/info',
        ip: '127.0.0.1',
        user_agent: '',
        trace_id: '',
        operation: '',
        resource_type: '',
        resource_id: '',
        request_params: null,
        response_params: null,
        error_code: '',
        status: 200,
        outcome: 'success' as const,
        duration_ms: 2,
      };
      const fresh = { ...stale, id: 2, occurred_at: 2 };
      try {
        await flushPromises();
        let releaseList!: () => void;
        let releaseSummary!: () => void;
        let rejectDetail!: () => void;
        vi.mocked(auditApi.list).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseList = () =>
                resolve({ items: [stale], t: 1, p: 1, s: 20 });
            }),
        );
        vi.mocked(auditApi.summary).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseSummary = () => resolve({ from: 1, to: 2, total: 99 });
            }),
        );
        const old = state.refresh();
        vi.mocked(auditApi.list).mockResolvedValueOnce({
          items: [fresh],
          t: 1,
          p: 1,
          s: 20,
        });
        vi.mocked(auditApi.summary).mockResolvedValueOnce({
          from: 1,
          to: 2,
          total: 1,
        });
        await state.refresh();
        vi.mocked(auditApi.get).mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectDetail = () => reject(new Error('late detail failed'));
            }),
        );
        const oldDetail = state.detail(fresh.id);
        state.closeDetail();
        releaseList();
        releaseSummary();
        rejectDetail();
        await Promise.all([old, oldDetail]);
        expect(state.rows.value).toEqual([fresh]);
        expect(state.overview.value?.total).toBe(1);
        expect(state.selected.value).toBeUndefined();
        expect(state.detailLoading.value).toBe(false);
        expect(state.detailError.value).toBe(false);
        expect(state.loading.value).toBe(false);
        expect(state.overviewLoading.value).toBe(false);

        vi.mocked(auditApi.list).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseList = () =>
                resolve({ items: [stale], t: 1, p: 1, s: 20 });
            }),
        );
        vi.mocked(auditApi.summary).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseSummary = () => resolve({ from: 1, to: 2, total: 99 });
            }),
        );
        const leaving = state.refresh();
        auditVisible.value = false;
        await nextTick();
        releaseList();
        releaseSummary();
        await leaving;
        expect(wrapper.text()).toBe('Other view');
        expect(state.rows.value).toEqual([fresh]);
        expect(state.overview.value?.total).toBe(1);

        vi.mocked(auditApi.list).mockResolvedValueOnce({
          items: [],
          t: 0,
          p: 1,
          s: 20,
        });
        vi.mocked(auditApi.summary).mockResolvedValueOnce({
          from: 2,
          to: 3,
          total: 0,
        });
        auditVisible.value = true;
        await nextTick();
        await flushPromises();
        expect(state.rows.value).toEqual([]);
        expect(state.overview.value?.total).toBe(0);
        expect(state.loading.value).toBe(false);
        expect(state.overviewLoading.value).toBe(false);
      } finally {
        wrapper.unmount();
      }
    });
  },
);
