import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it } from 'vitest';

import { heatmapLayout } from './audit-heatmap-layout';

dayjs.extend(utc);
dayjs.extend(timezone);

const zone = 'Asia/Shanghai';
describe('heatmap geometry before the summary arrives', () => {
  it('reserves 24 rolling hours, including the partial local hour', () => {
    const to = dayjs.tz('2026-10-20 21:17:23', zone).valueOf();
    const cells = heatmapLayout(to - 86400000, to, zone);
    expect(cells).toHaveLength(24);
    expect(cells[0]?.hour).toBe(21);
    expect(cells.at(-1)?.ended_at).toBe(to);
    expect(
      cells.every((cell) => cell.ended_at - cell.started_at === 3600000),
    ).toBe(true);
  });

  it.each([7, 30])(
    'reserves all %i calendar dates with the correct granularity',
    (days) => {
      const from = dayjs
        .tz(`2026-10-${days === 7 ? '14' : '01'} 00:00:00`, zone)
        .valueOf();
      const to = dayjs
        .tz(`2026-10-${days === 7 ? '20' : '30'} 21:17:23`, zone)
        .valueOf();
      const cells = heatmapLayout(from, to, zone);
      const dates = new Set(
        cells.map((cell) =>
          dayjs(cell.started_at).tz(zone).format('YYYY-MM-DD'),
        ),
      );
      expect(dates.size).toBe(days);
      expect(cells).toHaveLength(days === 30 ? 30 : 6 * 24 + 22);
      expect(cells[0]?.started_at).toBe(from);
      expect(cells.at(-1)?.ended_at).toBe(to);
      expect(
        cells.every(
          (cell, index) =>
            index === 0 || cells[index - 1]?.ended_at === cell.started_at,
        ),
      ).toBe(true);
    },
  );

  it.each([
    ['2026-03-05', '2026-03-11 12:30:00', 23],
    ['2026-10-29', '2026-11-04 12:30:00', 25],
  ])(
    'keeps seven date rows across the DST transition starting %s',
    (from, to, hours) => {
      const timezone = 'America/New_York';
      const cells = heatmapLayout(
        dayjs.tz(from, timezone).valueOf(),
        dayjs.tz(to, timezone).valueOf(),
        timezone,
      );
      const counts = new Map<string, number>();
      for (const cell of cells) {
        const date = dayjs(cell.started_at).tz(timezone).format('YYYY-MM-DD');
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }
      expect(counts.size).toBe(7);
      expect([...counts.values()]).toContain(hours);
    },
  );
});
