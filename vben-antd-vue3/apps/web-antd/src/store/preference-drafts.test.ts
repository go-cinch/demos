import { UnsecuredJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';

const token = (id: string, name = id) =>
  new UnsecuredJWT({ code: 'users', username: name })
    .setIssuer('test')
    .setSubject(id)
    .encode();
const choice = (value: string) => ({ changed_at: Date.now(), value });

async function cacheModules() {
  return {
    ...(await import('./preference-drafts')),
    ...(await import('./session-cache')),
  };
}
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
});

describe('account-owned preference drafts', () => {
  it('claims all anonymous choices on login, before onboarding or any network write', async () => {
    const cache = await cacheModules();
    const fields = ['theme.mode', 'language', 'timezone'];
    const choices = ['light', 'zh-CN', 'Asia/Tokyo'].map((item) =>
      choice(item),
    );
    fields.forEach((field, i) => cache.writeDraft(field, choices[i]));
    expect(localStorage.length).toBe(0);

    cache.bindSessionCache(token('101'));
    expect(sessionStorage.length).toBe(0);
    const duringOnboarding = choice('Europe/London');
    cache.writeDraft('timezone', duringOnboarding);
    cache.releaseSessionCache();
    cache.bindSessionCache(token('202'));
    for (const field of fields) expect(cache.readDraft(field)).toBeUndefined();
    cache.writeDraft('theme.mode', choice('dark'));

    vi.resetModules();
    const restored = await cacheModules();
    restored.bindSessionCache(token('101', 'renamed'));
    expect(restored.readDraft('theme.mode')).toEqual(choices[0]);
    expect(restored.readDraft('language')).toEqual(choices[1]);
    expect(restored.readDraft('timezone')).toEqual(duringOnboarding);
    restored.acknowledgeDraft('theme.mode', required(choices[0]));
    restored.bindSessionCache(token('202'));
    expect(restored.readDraft('theme.mode')?.value).toBe('dark');
  });

  it('keeps independently opened login tabs from reading or claiming another tab’s guest draft', async () => {
    const cache = await cacheModules();
    cache.writeDraft('theme.mode', choice('light'));
    const tabA = sessionStorage;
    const tabB = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => tabB.get(key) ?? null,
      removeItem: (key: string) => tabB.delete(key),
      setItem: (key: string, value: string) => tabB.set(key, value),
    });
    try {
      cache.bindSessionCache(token('202'));
      expect(cache.readDraft('theme.mode')).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sessionStorage).toBe(tabA);
    cache.bindSessionCache(token('101'));
    expect(cache.readDraft('theme.mode')?.value).toBe('light');
  });
});
