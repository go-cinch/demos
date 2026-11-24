import type { Select } from 'ant-design-vue';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import { Segmented } from 'ant-design-vue';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it, vi } from 'vitest';

import { auditApi } from '#/api/audit';
import Table from '#/components/skeleton-table.vue';

import { required } from '../../../../../scripts/test-utils/required';
import AuditChart from './audit-chart.vue';
import AuditPage from './audit-page.vue';

vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
  ScrollArea: { template: '<div data-scroll-area><slot /></div>' },
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<i />' } }));
const timezoneSettings = vi.hoisted(() => ({ timezone: 'Asia/Shanghai' }));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => timezoneSettings,
  useUserStore: () => ({ userInfo: { userId: 1 } }),
}));
vi.mock('@vben/preferences', () => ({
  getCustomPreferences: () => ({ defaultTableSize: 20 }),
}));
vi.mock('@vben/utils', () => ({ formatDate: String, formatDateTime: String }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/audit/login', query: {} }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasButton: () => true, hasPage: () => true }),
}));
vi.mock('#/api/audit', () => ({
  auditApi: {
    list: vi.fn(async () => ({ items: [], t: 200, p: 1, s: 20 })),
    summary: vi.fn(async () => ({ from: 1, to: 2, heatmap: [], trend: [] })),
  },
}));
vi.mock('./audit-chart.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./audit-detail.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./audit-heatmap.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./audit-filter-cue.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
vi.mock('#/components/search-autocomplete.vue', () => ({
  default: { template: '<input />' },
}));
vi.mock('../system/components/management-toolbar.vue', () => ({
  default: { template: '<div />' },
}));

dayjs.extend(utc);
dayjs.extend(timezone);

function mountAudit(kind: 'login' | 'operation') {
  return mount(AuditPage, {
    props: { kind },
    global: {
      directives: { skeleton: () => {} },
      mocks: { $t: (key: string) => key },
      stubs: {
        ADrawer: true,
        // Exercise the table event that AuditPage consumes without layout dependencies.
        SkeletonTable: defineComponent({
          name: 'SkeletonTable',
          props: { pagination: { type: Object, required: true } },
          emits: ['change'],
          template: '<div />',
        }),
      },
    },
  });
}

it('renders ranked accounts with bounded scrolling and exact selection', async () => {
  for (const count of [0, 1, 5, 6, 10]) {
    const accounts = Array.from({ length: count }, (_, index) => ({
      name: `owned-${index}`,
      total: count - index,
      failed: count - index,
    }));
    vi.mocked(auditApi.summary).mockResolvedValue({
      from: 1,
      to: 2,
      heatmap: [],
      trend: [],
      accounts,
    });
    const wrapper = mountAudit('login');
    try {
      await flushPromises();
      const list = wrapper.get('[data-testid="failed-account-slots"]');
      expect(list.attributes('data-scroll-area') !== undefined).toBe(count > 5);
      const buttons = list.findAll('button');
      expect(
        buttons.map((button) => button.get('.audit-clue-name').text()),
      ).toEqual(accounts.map((account) => account.name));
      expect(list.text().includes('audit.noFailures')).toBe(count === 0);
      if (count === 0) continue;
      await required(buttons[0]).trigger('click');
      await flushPromises();
      expect(required(buttons[0]).attributes('aria-pressed')).toBe('true');
      expect(auditApi.list).toHaveBeenLastCalledWith(
        'login',
        expect.objectContaining({ username: required(accounts[0]).name }),
      );
    } finally {
      wrapper.unmount();
    }
  }
});

describe.each(['login', 'operation'] as const)('%s pagination', (kind) => {
  it('emits each supported page size for both audit kinds', async () => {
    const wrapper = mountAudit(kind);
    try {
      await flushPromises();
      const table = wrapper.getComponent(Table);
      const sizes = ['10', '20', '50', '100', '200'];
      expect(table.props('pagination')).toMatchObject({
        pageSizeOptions: sizes,
      });
      table.vm.$emit('change', { current: 2, pageSize: 20 });
      await flushPromises();
      expect(auditApi.list).toHaveBeenLastCalledWith(
        kind,
        expect.objectContaining({ p: 2, s: 20 }),
      );
      for (const value of sizes) {
        table.vm.$emit('change', { current: 2, pageSize: Number(value) });
        await flushPromises();
        expect(auditApi.list).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({ p: 1, s: Number(value) }),
        );
      }
    } finally {
      wrapper.unmount();
    }
  });
});

describe.each([
  ['login', 'trend'],
  ['operation', 'time'],
] as const)('%s daily trend drilldown', (kind, view) => {
  it.each([
    ['2026-11-21T00:00:00+08:00', '2026-11-22T00:00:00+08:00', 'Asia/Shanghai'],
    [
      '2026-11-01T00:00:00-04:00',
      '2026-11-02T00:00:00-05:00',
      'America/New_York',
    ],
  ])(
    'uses the selected day boundaries starting at %s',
    async (start, end, zone) => {
      const from = Date.parse(start);
      const to = Date.parse(end);
      const now = vi.spyOn(Date, 'now').mockReturnValue(to + 3_600_000);
      const originalZone = timezoneSettings.timezone;
      timezoneSettings.timezone = zone;
      vi.mocked(auditApi.summary).mockResolvedValue({
        from,
        to,
        bucket_ms: 86_400_000,
        trend: [{ at: from, ended_at: to, success: 1, failure: 0 }],
      });
      const wrapper = mountAudit(kind);
      try {
        await flushPromises();
        const period = wrapper.getComponent<typeof Select>('.audit-period');
        period.vm.$emit('update:value', 7);
        period.vm.$emit('change', 7);
        await flushPromises();
        const switcher = required(
          wrapper
            .findAllComponents(Segmented)
            .find((segmented) =>
              segmented
                .props('options')
                ?.some(
                  (option) =>
                    typeof option === 'object' && option.value === view,
                ),
            ),
        );
        switcher.vm.$emit('update:value', view);
        await flushPromises();
        wrapper.getComponent(AuditChart).vm.$emit('select', 0);
        await flushPromises();
        expect(auditApi.list).toHaveBeenLastCalledWith(
          kind,
          expect.objectContaining({ from, to, time_zone: zone, p: 1 }),
        );
      } finally {
        wrapper.unmount();
        timezoneSettings.timezone = originalZone;
        now.mockRestore();
      }
    },
  );
});
