import { describe, expect, it, vi } from 'vitest';

import { activityOption } from './audit-charts';

vi.mock('@vben/utils', () => ({
  formatDateTime: (value: number) =>
    new Date(value).toISOString().slice(0, 19).replace('T', ' '),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const hour = 3_600_000;
const colors = {
  colorPrimary: 'blue',
  colorError: 'red',
  colorWarning: 'gold',
};
const from = Date.UTC(2026, 9, 14);
const summary = {
  from,
  to: from + 24 * hour,
  bucket_ms: hour,
  trend: Array.from({ length: 24 }, (_, index) => ({
    at: from + index * hour,
    success: index + 1,
    failure: 1,
  })),
};

describe('audit trend selection', () => {
  it('highlights a selected bucket without collapsing the visible time range', () => {
    const option = activityOption(summary, colors, {
      from: from + hour,
      to: from + 2 * hour,
    });
    expect(option.dataZoom).toEqual([
      expect.objectContaining({ start: 0, end: 100 }),
    ]);
    expect(option.series).toEqual([
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ value: 1, itemStyle: { opacity: 0.3 } }),
          expect.objectContaining({ value: 2, itemStyle: { opacity: 0.9 } }),
        ]),
      }),
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ value: 1, itemStyle: { opacity: 0.3 } }),
          expect.objectContaining({ value: 1, itemStyle: { opacity: 0.9 } }),
        ]),
      }),
    ]);
  });

  it('keeps a manually zoomed viewport on selection and labels visible buckets by their actual timestamp', () => {
    const option = activityOption(
      summary,
      colors,
      { from: from + 16 * hour, to: from + 17 * hour },
      false,
      { start: 50, end: 90 },
    );
    expect(option.dataZoom).toEqual([
      expect.objectContaining({ start: 50, end: 90 }),
    ]);
    const axis = option.xAxis as {
      axisLabel: { formatter: (value: string, index: number) => string };
    };
    expect(axis.axisLabel.formatter('2026-10-14 16:00:00', 0)).toBe('16:00');
  });
});

it('uses the theme warning color when the trend includes an MFA challenge', () => {
  const data = {
    ...summary,
    trend: [{ ...summary.trend[0]!, mfa_challenge: 1 }],
  };
  expect(activityOption(data, colors).series).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'audit.mfa_challenge', color: 'gold' }),
    ]),
  );
});

it.each([false, true])(
  'shows only the selected result with its semantic color (modules=%s)',
  (modules) => {
    const data = {
      ...summary,
      modules: [{ name: 'auth', total: 8, failed: 3 }],
    };
    for (const result of ['success', 'failure']) {
      const option = activityOption(
        data,
        colors,
        undefined,
        modules,
        undefined,
        result,
      );
      expect(option.series).toEqual([
        expect.objectContaining({
          name: `audit.${result}`,
          color: result === 'failure' ? 'red' : 'blue',
        }),
      ]);
    }
  },
);
