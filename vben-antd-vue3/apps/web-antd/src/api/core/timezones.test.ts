import { beforeEach, expect, it, vi } from 'vitest';

import { getTimezoneOptionsApi } from './timezones';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('#/api/request', () => ({ authSilentPublicRequestClient: { get } }));

beforeEach(() => vi.clearAllMocks());
it('reads the public dictionary projection through the Auth client', async () => {
  get.mockResolvedValue({
    items: [
      {
        value: 'Asia/Shanghai',
        name: { 'zh-CN': '上海', 'en-US': 'Shanghai' },
        region: 'Asia',
        sort: 0,
        enabled: true,
      },
    ],
  });
  const timezones = await getTimezoneOptionsApi();
  expect(timezones[0]).toEqual({
    value: 'Asia/Shanghai',
    label: 'Shanghai',
    name: { 'zh-CN': '上海', 'en-US': 'Shanghai' },
    region: 'Asia',
  });
  expect(get).toHaveBeenCalledWith('/pub/timezones');
});
it('preserves an explicitly empty catalog and reports load failure', async () => {
  get.mockResolvedValue({ items: [] });
  expect(await getTimezoneOptionsApi()).toEqual([]);
  get.mockRejectedValue(new Error('offline'));
  await expect(getTimezoneOptionsApi()).rejects.toThrow('offline');
});
