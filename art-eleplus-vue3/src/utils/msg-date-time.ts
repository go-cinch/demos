export function formatDateTime(
  value: number,
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value)
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}
export function parseDateTime(
  value: string,
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  const wall = value.replace('T', ' ')
  const normalized = wall.length === 16 ? wall + ':00' : wall
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return NaN
  const target = Date.parse(normalized.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(target)) return NaN
  let instant = target
  for (let i = 0; i < 4; i++) {
    const represented = Date.parse(formatDateTime(instant, zone).replace(' ', 'T') + 'Z')
    instant += target - represented
  }
  return formatDateTime(instant, zone) === normalized ? instant : NaN
}
