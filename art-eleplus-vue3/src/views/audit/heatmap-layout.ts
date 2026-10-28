import type { AuditHeatCell } from '@/utils/admin/model'

import { adminDate } from '@/utils/admin/model'

// Match the API's calendar buckets before the summary arrives, including DST
// hours and partial first/last buckets. Counts never determine grid geometry.
export function heatmapLayout(from: number, to: number, timezone: string): AuditHeatCell[] {
  const daily = to - from > 8 * 86400000
  const rolling = to - from <= 86400000
  const cells: AuditHeatCell[] = []
  let boundary = from
  for (let at = from; at < to; ) {
    const dateTime = adminDate(at, timezone)
    const local = {
      format: () => dateTime.slice(0, 10),
      day: () => new Date(`${dateTime.slice(0, 10)}T12:00:00Z`).getUTCDay(),
      hour: () => Number(dateTime.slice(11, 13))
    }
    let end = at + 3600000
    if (!rolling) {
      if (at >= boundary) {
        const date = local.format()
        let low = Math.floor(at / 1000)
        let high = low + 48 * 3600
        // Find the next calendar date even when midnight is skipped or repeated.
        while (low < high) {
          const middle = Math.floor((low + high) / 2)
          if (adminDate(middle * 1000, timezone).slice(0, 10) <= date) low = middle + 1
          else high = middle
        }
        boundary = low * 1000
      }
      if (daily || end > boundary) end = boundary
    }
    end = Math.min(end, to)
    cells.push({
      started_at: at,
      ended_at: end,
      weekday: (local.day() + 6) % 7,
      hour: local.hour(),
      count: 0,
      failed: 0
    })
    at = end
  }
  return cells
}
