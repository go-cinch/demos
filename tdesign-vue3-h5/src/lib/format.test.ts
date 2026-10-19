import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, watchEffect } from 'vue';
import { dateTime, parseDateTime } from './format';
import { preferences } from './preferences';

vi.mock('./preferences', async () => {
  const { reactive } = await import('vue');
  return { preferences: reactive({ timezone: 'Asia/Shanghai' }) };
});

beforeEach(() => {
  preferences.timezone = 'Asia/Shanghai';
});

describe('dateTime', () => {
  it.each([
    ['Asia/Shanghai', '2026-01-01 08:00:00'],
    ['Asia/Tokyo', '2026-01-01 09:00:00'],
    ['Europe/London', '2026-01-01 00:00:00'],
    ['America/New_York', '2025-12-31 19:00:00'],
  ])('formats the same API timestamp in %s', (zone, expected) => {
    preferences.timezone = zone;
    expect(dateTime(Date.parse('2026-01-01T00:00:00Z'))).toBe(expected);
  });

  it('updates reactive consumers immediately when the selected timezone changes', async () => {
    const timestamp = Date.parse('2026-01-01T00:00:00Z');
    let displayed = '';
    const stop = watchEffect(() => {
      displayed = dateTime(timestamp);
    });
    try {
      expect(displayed).toBe('2026-01-01 08:00:00');
      preferences.timezone = 'America/New_York';
      await nextTick();
      expect(displayed).toBe('2025-12-31 19:00:00');
    } finally {
      stop();
    }
  });

  it('applies daylight-saving offsets rather than fixed hour differences', () => {
    preferences.timezone = 'America/New_York';
    expect(dateTime(Date.parse('2026-03-08T06:59:59Z'))).toBe('2026-03-08 01:59:59');
    expect(dateTime(Date.parse('2026-03-08T07:00:00Z'))).toBe('2026-03-08 03:00:00');
    preferences.timezone = 'Europe/London';
    expect(dateTime(Date.parse('2026-07-01T00:00:00Z'))).toBe('2026-07-01 01:00:00');
  });

  it('preserves plain wall-time strings without guessing their source timezone', () => {
    preferences.timezone = 'America/New_York';
    expect(dateTime('2026-09-27 14:45:38')).toBe('2026-09-27 14:45:38');
  });

  it.each([undefined, null, NaN, Infinity])(
    'handles missing or invalid timestamps: %s',
    (value) => {
      expect(dateTime(value)).toBe('—');
    },
  );

  it('treats zero as a valid timestamp', () => {
    expect(dateTime(0)).toBe('1970-01-01 08:00:00');
  });
});

describe('parseDateTime', () => {
  it.each([
    ['Asia/Shanghai', '2026-01-01 08:00:00', '2026-01-01T00:00:00Z'],
    ['America/New_York', '2025-12-31 19:00:00', '2026-01-01T00:00:00Z'],
    ['America/New_York', '2026-06-30 20:00:00', '2026-07-01T00:00:00Z'],
    ['Europe/London', '2026-07-01 01:00:00', '2026-07-01T00:00:00Z'],
  ])('maps a lock deadline in %s to the correct API timestamp', (zone, value, instant) => {
    preferences.timezone = zone;
    const parsed = parseDateTime(value);
    expect(parsed.isValid()).toBe(true);
    expect(parsed.valueOf()).toBe(Date.parse(instant));
    expect(dateTime(parsed.valueOf())).toBe(value);
  });

  it.each(['', '2026-02-30 12:00:00', '2026-01-01', '2026-01-01T00:00:00Z'])(
    'rejects invalid dates or formats: %s',
    (value) => {
      expect(parseDateTime(value).isValid()).toBe(false);
    },
  );

  it('rejects a nonexistent local deadline during a daylight-saving jump', () => {
    preferences.timezone = 'America/New_York';
    expect(parseDateTime('2026-03-08 02:30:00').isValid()).toBe(false);
  });
});
