import { adminDate, effectiveTimezone, type AuditHeatCell } from '@/features/admin/model';
/** Calendar geometry is independent of data counts, including partial and DST buckets. */
export function heatmapLayout(from: number, to: number, timezone: string): AuditHeatCell[] {
  const daily = to - from > 8 * 86400000;
  const rolling = to - from <= 86400000;
  const cells: AuditHeatCell[] = [];
  let boundary = from;
  for (let at = from; at < to; ) {
    const shown = adminDate(at, timezone);
    let end = at + 3600000;
    if (!rolling) {
      if (at >= boundary) {
        const date = shown.slice(0, 10);
        let low = Math.floor(at / 1000),
          high = low + 48 * 3600;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (adminDate(middle * 1000, timezone).slice(0, 10) <= date) low = middle + 1;
          else high = middle;
        }
        boundary = low * 1000;
      }
      if (daily || end > boundary) end = boundary;
    }
    end = Math.min(end, to);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: effectiveTimezone(timezone),
      weekday: 'short'
    }).format(at);
    cells.push({
      started_at: at,
      ended_at: end,
      weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday),
      hour: Number(shown.slice(11, 13)),
      count: 0,
      failed: 0
    });
    at = end;
  }
  return cells;
}
