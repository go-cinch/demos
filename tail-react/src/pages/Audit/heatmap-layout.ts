import { adminDate, type HeatCell } from '@/utils/admin/model';
/** Reserve the API's calendar geometry before counts arrive, including DST. */
export function heatmapLayout(from: number, to: number, timezone: string): HeatCell[] {
  const daily = to - from > 8 * 86400000;
  const rolling = to - from <= 86400000;
  const cells: HeatCell[] = [];
  let boundary = from;
  for (let at = from; at < to;) {
    const local = adminDate(at, timezone);
    let end = at + 3600000;
    if (!rolling) {
      if (at >= boundary) {
        const date = local.slice(0, 10);
        let low = Math.floor(at / 1000), high = low + 48 * 3600;
        while (low < high) { const middle = Math.floor((low + high) / 2); if (adminDate(middle * 1000, timezone).slice(0, 10) <= date) low = middle + 1; else high = middle; }
        boundary = low * 1000;
      }
      if (daily || end > boundary) end = boundary;
    }
    end = Math.min(end, to);
    cells.push({ started_at: at, ended_at: end, weekday: (new Date(`${local.slice(0,10)}T00:00:00Z`).getUTCDay()+6)%7, hour: Number(local.slice(11,13)), count: 0, failed: 0 });
    at = end;
  }
  return cells;
}
