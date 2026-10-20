import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSummaryUserGroup, getSystemSummary } from './insights';

const get = vi.hoisted(() => vi.fn());
vi.mock('#/api/request', () => ({ authRequestClient: { get } }));
beforeEach(() => vi.resetAllMocks());

describe('system summaries', () => {
  it.each([
    ['action', 'total,counts,groups'],
    ['dictionary', 'total,counts'],
    ['role', 'total,counts,groups'],
    ['user', 'total,counts,trend'],
    ['user-group', 'total,counts,groups'],
  ] as const)(
    'loads only the fields used by %s and fills omitted projections',
    async (resource, f) => {
      get.mockResolvedValue({ total: 12, counts: { active: 9 } });
      await expect(
        getSystemSummary(resource, { days: 7, time_zone: 'Asia/Shanghai' }),
      ).resolves.toEqual({
        total: 12,
        counts: { active: 9 },
        groups: [],
        trend: [],
      });
      expect(get).toHaveBeenCalledExactlyOnceWith(`/${resource}/summary`, {
        params: { days: 7, time_zone: 'Asia/Shanghai', f },
      });
    },
  );
  it('propagates unavailable statistics instead of converting failures into zero totals', async () => {
    get.mockRejectedValue(new Error('offline'));
    await expect(getSystemSummary('user')).rejects.toThrow('offline');
  });
  it('hydrates a group without requesting its entire membership', async () => {
    get.mockResolvedValue({ id: 7, member_count: 5000, member_preview: [] });
    await expect(getSummaryUserGroup(7)).resolves.toHaveProperty(
      'member_count',
      5000,
    );
    expect(get).toHaveBeenCalledWith('/user-group/7', {
      params: { f: 'actions,member_count,member_preview' },
    });
  });
});
