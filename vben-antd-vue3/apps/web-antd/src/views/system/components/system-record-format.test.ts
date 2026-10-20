import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it, vi } from 'vitest';

import {
  actionMapping,
  jsonStructure,
  jsonText,
  jsonType,
  memberCount,
  memberPreview,
  permissionCount,
  permissionGroups,
  recordDate,
  recordLabel,
  resourceRules,
  ruleColor,
  skeletonRecord,
  splitLines,
  userStatus,
} from './system-record-format';

vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
}));
vi.mock('#/locales', () => ({
  $t: (key: string, params?: { count: number }) =>
    params ? `${key}:${params.count}` : key,
}));
dayjs.extend(utc);
dayjs.extend(timezone);

describe('management record projections', () => {
  it('prefers bounded summaries and respects explicit empty projections', () => {
    const members = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      username: `User ${index}`,
      code: `U${index}`,
    }));
    expect(memberPreview({ id: 1, users: members })).toEqual(
      members.slice(0, 5),
    );
    expect(memberCount({ id: 1, users: members })).toBe(8);
    expect(
      memberPreview({ id: 1, users: members, member_preview: [] }),
    ).toEqual([]);
    expect(memberCount({ id: 1, users: members, member_count: 0 })).toBe(0);
    const record = {
      id: 1,
      action_summaries: [
        { code: 'A', name: 'Read', group: 'People' },
        { code: 'B', name: 'Update', group: 'People' },
        { code: 'C', name: 'Other', group: '' },
      ],
    };
    expect(permissionCount(record)).toBe(3);
    expect(permissionGroups(record)).toEqual(['People']);
    expect(permissionCount({ id: 1 })).toBe(0);
  });
  it('formats sparse labels, unknown statuses and dates in the selected timezone', () => {
    expect(recordLabel({ id: 1 })).toBe('1');
    expect(recordLabel({ id: 1, username: 'reader' })).toBe('reader');
    expect(recordLabel({ id: 1, name: '' })).toBe('');
    expect(recordDate(Date.UTC(2026, 0, 1))).toBe('2026-01-01 08:00:00');
    expect(recordDate(0)).toBe('—');
    expect(recordDate(undefined)).toBe('—');
    expect(userStatus(2)).toEqual({
      color: 'error',
      label: 'system.status.locked',
    });
    expect(userStatus()).toEqual({
      color: undefined,
      label: 'system.common.unknown',
    });
  });
  it('counts Unicode characters and preserves JSON scalar values', () => {
    expect(jsonStructure('A😀')).toBe('system-cards.characters:2');
    expect(jsonStructure([1, 2])).toBe('system-cards.items:2');
    expect(jsonStructure({ a: 1 })).toBe('system-cards.fields:1');
    expect(jsonStructure(null)).toBe('system-cards.scalar');
    expect(jsonType(null)).toBe('system-cards.types.null');
    expect(jsonType([])).toBe('system-cards.types.array');
    expect(jsonText(false)).toBe('false');
    expect(jsonText(undefined)).toBe('null');
  });
  it('parses multiline transport rules without splitting pipes inside paths', () => {
    expect(splitLines(' A\r\n\n B ')).toEqual(['A', 'B']);
    const rules = resourceRules(
      ' GET | /user\r\nGRPC|/auth.User/Get\n/raw|suffix|more\n*',
    );
    expect(rules.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/user' },
      { method: 'GRPC', path: '/auth.User/Get' },
      { method: '/raw', path: 'suffix|more' },
      { method: '', path: '*' },
    ]);
    expect(ruleColor(rules[0]!)).toBe('green');
    expect(ruleColor(rules[1]!)).toBe('purple');
    expect(ruleColor(rules[3]!)).toBe('default');
  });
  it('shows wildcard mappings only for explicitly configured wildcard definitions', () => {
    expect(actionMapping({ resource: 'GET|/user' }, 'resource')).toBe(
      'GET|/user',
    );
    expect(
      actionMapping(
        { config: { permission_scope: '*', ui: [], endpoints: [] } },
        'menu',
      ),
    ).toBe('*');
    expect(
      actionMapping(
        { config: { builtin: 'all', ui: [], endpoints: [] } },
        'button',
      ),
    ).toBe('*');
    expect(actionMapping({}, 'resource')).toBe('');
  });
  it.each(['action', 'dictionary', 'role', 'user', 'user-group'] as const)(
    'uses non-persisted IDs for %s loading placeholders',
    (resource) => {
      expect(skeletonRecord(resource)).toMatchObject({
        id: -1,
        created_at: 0,
        updated_at: 0,
      });
    },
  );
});
