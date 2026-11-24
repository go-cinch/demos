import type { TabDefinition } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { normalizeProfileTabs } from './profile-tabs';

function tab(fullPath: string, meta = {}): TabDefinition {
  return {
    path: fullPath.split('?')[0],
    fullPath,
    key: fullPath,
    name: 'Profile',
    meta,
    query: fullPath.includes('?') ? { tab: 'security' } : {},
  } as TabDefinition;
}

describe('legacy profile tabs', () => {
  it('retains the active destination and pin while preserving other pages and ordering', () => {
    const user = tab('/system/user');
    const tabs = [
      user,
      tab('/profile', { affixTab: true }),
      tab('/profile?tab=security'),
    ];
    const result = normalizeProfileTabs(tabs, '/profile?tab=security');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(user);
    expect(result[1]).toMatchObject({
      key: '/profile',
      fullPath: '/profile?tab=security',
      query: { tab: 'security' },
      meta: { fullPathKey: false, affixTab: true },
    });
    expect(normalizeProfileTabs(result, '/profile')).toBe(result);
  });

  it('migrates a lone saved security tab without changing its destination', () => {
    expect(
      normalizeProfileTabs([tab('/profile?tab=security')], '/system/user')[0],
    ).toMatchObject({
      key: '/profile',
      fullPath: '/profile?tab=security',
      meta: { fullPathKey: false },
    });
  });
});
