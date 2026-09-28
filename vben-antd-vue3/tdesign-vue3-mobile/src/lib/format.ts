import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { preferences } from './preferences';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const dateTimeFormat = 'YYYY-MM-DD HH:mm:ss';

export function dateTime(value: unknown) {
  if (typeof value === 'number') {
    const date = dayjs(value);
    return date.isValid() ? date.tz(preferences.timezone).format(dateTimeFormat) : '—';
  }
  // Plain date strings do not identify an instant; preserve the supplied wall time.
  return typeof value === 'string' ? value : '—';
}

export function parseDateTime(value: string) {
  if (!dayjs.utc(value, dateTimeFormat, true).isValid()) return dayjs(NaN);
  const date = dayjs.tz(value, dateTimeFormat, preferences.timezone);
  // Reject nonexistent local times during a daylight-saving jump.
  return date.format(dateTimeFormat) === value ? date : dayjs(NaN);
}
export function labelFor(record: Record<string, unknown>) {
  return String(record.name || record.username || record.resource || record.key || record.id);
}
export function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}
