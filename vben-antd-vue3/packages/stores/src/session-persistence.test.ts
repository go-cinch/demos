import { beforeEach, expect, it, vi } from 'vitest';

import { required } from '../../../scripts/test-utils/required';

async function tab() {
  vi.resetModules();
  const sessionModule = await import('./session-persistence');
  return sessionModule.browserSession;
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it('a superseded tab cannot overwrite or erase the active account, or reopen it on reload', async () => {
  const a = await tab();
  expect(a.initialize('test')).toBeUndefined();
  a.save('refresh-a', true);
  a.setLocale('zh-CN');
  a.lock('lock-a');
  const tabAState = { ...sessionStorage };
  sessionStorage.clear();
  const b = await tab();
  expect(b.initialize('test')).toEqual({
    token: 'refresh-a',
    lock: 'lock-a',
    locale: 'zh-CN',
  });
  b.save('refresh-b', true);
  expect(a.hasExpired()).toBe(true);
  a.save('late-a');
  a.setLocale('zh-CN');
  a.end();
  const session = await tab();
  expect(session.initialize('test')).toEqual({ token: 'refresh-b' });
  sessionStorage.clear();
  for (const [key, value] of Object.entries(tabAState))
    sessionStorage.setItem(key, value);
  const old = await tab();
  expect(old.initialize('test')).toBeUndefined();
  expect(old.detached).toBe(true);
});

it('keeps the locale during credential rotation and clears it when the session ends', async () => {
  const session = await tab();
  session.initialize('test');
  session.save('first-token', true);
  session.setLocale('zh-CN');
  session.save('renewed-token');

  expect(session.restorationLocale('first-token')).toBeUndefined();
  expect(session.restorationLocale('renewed-token')).toBe('zh-CN');
  const reloaded = await tab();
  expect(reloaded.initialize('test')).toEqual({
    token: 'renewed-token',
    locale: 'zh-CN',
  });
  reloaded.end();
  expect(reloaded.restorationLocale('renewed-token')).toBeUndefined();
});

it('recovers an old credential once without restoring old permissions or lock data', async () => {
  localStorage.setItem(
    'test-core-access',
    JSON.stringify({
      accessCodes: ['admin'],
      refreshToken: 'refresh-a',
      isLockScreen: true,
      lockScreenPassword: 'old',
    }),
  );
  const session = await tab();
  expect(session.initialize('test')).toEqual({ token: 'refresh-a' });
  expect(localStorage.getItem('test-core-access')).toBeNull();
  session.end();
  const session2 = await tab();
  expect(session2.initialize('test')).toBeUndefined();
});

it('recovers encrypted production data without leaving the refresh or lock value in plaintext', async () => {
  const first = await tab();
  expect(first.initialize('secure-test', true)).toBeUndefined();
  first.save('private-refresh', true);
  first.lock('private-lock');
  const raw = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.getItem(required(localStorage.key(i))),
  ).join(' ');
  expect(raw).not.toContain('private-refresh');
  expect(raw).not.toContain('private-lock');
  const session = await tab();
  expect(session.initialize('secure-test', true)).toEqual({
    token: 'private-refresh',
    lock: 'private-lock',
  });
});
