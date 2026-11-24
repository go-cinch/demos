import { describe, expect, it } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import {
  DEFAULT_TIMEZONE_CHOICES,
  formatTimezoneOffset,
  formatTimezoneTime,
  timezoneName,
} from '../src/timezone';

describe('timezone presentation', () => {
  it('keeps IANA values and Shanghai first without decorative labels', () => {
    expect(DEFAULT_TIMEZONE_CHOICES).toHaveLength(36);
    expect(DEFAULT_TIMEZONE_CHOICES[0]?.value).toBe('Asia/Shanghai');
    expect(DEFAULT_TIMEZONE_CHOICES[0]?.name?.['zh-CN']).toBe('上海');
    for (const item of DEFAULT_TIMEZONE_CHOICES)
      expect(
        () => new Intl.DateTimeFormat('en', { timeZone: item.value }),
      ).not.toThrow();
  });
  it('calculates seasonal and fractional UTC offsets', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');
    expect(formatTimezoneOffset('America/New_York', winter)).toBe('UTC-05:00');
    expect(formatTimezoneOffset('America/New_York', summer)).toBe('UTC-04:00');
    expect(formatTimezoneOffset('Europe/London', summer)).toBe('UTC+01:00');
    expect(formatTimezoneOffset('Asia/Kathmandu', summer)).toBe('UTC+05:45');
    expect(formatTimezoneOffset('Asia/Kolkata', summer)).toBe('UTC+05:30');
    expect(formatTimezoneOffset('Etc/UTC', summer)).toBe('UTC+00:00');
    expect(formatTimezoneTime('Asia/Shanghai', winter)).toBe(
      '2026-01-15 20:00:00',
    );
    expect(formatTimezoneOffset('invalid', winter)).toBe('');
  });
  it('localizes names while retaining custom saved zones', () => {
    expect(timezoneName(required(DEFAULT_TIMEZONE_CHOICES[0]), 'en-US')).toBe(
      'Shanghai',
    );
    expect(
      timezoneName({ value: 'Pacific/Apia', label: 'Pacific/Apia' }, 'zh-CN'),
    ).toBe('Pacific/Apia');
  });
});
