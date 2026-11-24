import options from './timezone-options.json';

export interface TimezoneChoice {
  label: string;
  value: string;
  name?: Record<string, string>;
  region?: string;
}

export function formatTimezoneOffset(zone: string, at = new Date()): string {
  try {
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    return !offset || offset === 'GMT'
      ? 'UTC+00:00'
      : offset.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

export function timezoneName(item: TimezoneChoice, locale: string): string {
  return item.name?.[locale] || item.label || item.value;
}

export function formatTimezoneTime(zone: string, at = new Date()): string {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(at)
        .map(({ type, value }) => [type, value]),
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  } catch {
    return '';
  }
}

export const DEFAULT_TIMEZONE_CHOICES: TimezoneChoice[] = options.map(
  (item) => ({
    value: item.value,
    label: item.name['en-US'],
    name: item.name,
    region: item.region,
  }),
);

// Compatibility for existing preference consumers. Display offsets are never persisted.
export const DEFAULT_TIME_ZONE_OPTIONS = options.map((item) => ({
  timezone: item.value,
  label: `${item.name['en-US']} (${formatTimezoneOffset(item.value)})`,
  offset:
    Number(formatTimezoneOffset(item.value).slice(3, 6)) +
    ((formatTimezoneOffset(item.value)[3] === '-' ? -1 : 1) *
      Number(formatTimezoneOffset(item.value).slice(7))) /
      60,
}));
