import type { TabDefinition } from '@vben/types';

import { describe, expect, it } from 'vitest';

import {
  mailTemplatePath,
  normalizeMailTemplateTabs,
} from './mail-template-tabs';

function tab(fullPath: string, meta = {}): TabDefinition {
  const url = new URL(fullPath, 'http://localhost');
  return {
    path: url.pathname,
    fullPath,
    key: fullPath,
    name: 'TestPage',
    meta,
    query: Object.fromEntries(url.searchParams),
  } as TabDefinition;
}

describe('email template tab migration', () => {
  it('keeps the active template and pin, preserving unrelated query tabs and their order', () => {
    const user = tab('/system/user');
    const log1 = tab('/audit/login?page=1');
    const log2 = tab('/audit/login?page=2');
    const tabs = [
      user,
      tab(mailTemplatePath, { affixTab: true, affixTabOrder: 3 }),
      log1,
      tab(`${mailTemplatePath}?template=5`),
      log2,
      tab(`${mailTemplatePath}?template=7`),
    ];
    const result = normalizeMailTemplateTabs(
      tabs,
      `${mailTemplatePath}?template=5`,
    );
    expect(result).toHaveLength(4);
    expect(result[0]).toBe(user);
    expect(result[2]).toBe(log1);
    expect(result[3]).toBe(log2);
    expect(result[1]).toMatchObject({
      key: mailTemplatePath,
      fullPath: `${mailTemplatePath}?template=5`,
      query: { template: '5' },
      meta: { fullPathKey: false, affixTab: true, affixTabOrder: 3 },
    });
    expect(normalizeMailTemplateTabs(result, '/system/user')).toBe(result);
  });

  it('migrates a single old editor tab without losing its destination', () => {
    const result = normalizeMailTemplateTabs(
      [tab(`${mailTemplatePath}?template=8`)],
      '/system/user',
    );
    expect(result[0]).toMatchObject({
      key: mailTemplatePath,
      fullPath: `${mailTemplatePath}?template=8`,
      query: { template: '8' },
      meta: { fullPathKey: false },
    });
  });

  it('leaves other pages untouched when no email template tab exists', () => {
    const tabs = [
      tab('/profile?tab=security'),
      tab('/audit/login?page=1'),
      tab('/audit/login?page=2'),
    ];
    expect(normalizeMailTemplateTabs(tabs, '/profile?tab=security')).toBe(tabs);
  });
});
