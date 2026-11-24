import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { userCache } from './user-cache';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  userCache.configure('test', '/auth');
  userCache.bind(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('keeps anonymous, A and B independent through reads, updates, enumeration and deletion', () => {
  userCache.current().set('theme', 'guest');
  userCache.bind('A:/1');
  const a = userCache.current();
  const active = userCache.capture();
  a.set('theme', 'dark');
  a.child('filters').set('user', ['alice']);
  userCache.bind('B:/1');
  expect(active()).toBe(false);
  const b = userCache.current();
  expect(b.keys()).toEqual([]);
  b.set('theme', 'light');
  a.set('theme', 'auto'); // a delayed operation still owns its original bucket
  expect(b.get('theme')).toBe('light');
  b.clear();
  userCache.bind('A:/1');
  expect(userCache.current().get('theme')).toBe('auto');
  expect(a.keys().toSorted()).toEqual(['filters/user', 'theme']);
  a.clear();
  expect(a.keys()).toEqual([]);
  userCache.bind(undefined);
  expect(userCache.current().get('theme')).toBe('guest');
});

it('partitions auth services and storage areas and never exposes anonymous data to an unidentified account', () => {
  userCache.current().set('x', 'guest');
  userCache.bind(null);
  userCache.current().set('x', 'unidentified');
  expect(localStorage.length).toBe(1);
  userCache.bind('1');
  userCache.current('session').set('x', 1);
  expect(userCache.current().get('x')).toBeUndefined();
  userCache.configure('test', '/other-auth');
  expect(userCache.current('session').get('x')).toBeUndefined();
});

it('keeps quota failures account-scoped and reports a failed durable draft save', () => {
  userCache.bind('blocked-A');
  const cache = userCache.current();
  vi.stubGlobal('localStorage', {
    length: 0,
    getItem: () => null,
    removeItem() {},
    setItem() {
      throw new Error('quota');
    },
  });
  cache.set('draft', { value: 'A' });
  expect(() => cache.setItem('catalog', '{}', true)).toThrow('quota');
  userCache.bind('blocked-B');
  expect(userCache.current().keys()).toEqual([]);
  expect(cache.get('draft')).toEqual({ value: 'A' });
  cache.clear();
});

it('only removes an owned legacy entry after a durable copy succeeds', () => {
  localStorage.setItem('old', '{"user":"A"}');
  const cache = userCache.current();
  cache.migrate('draft', 'old', (raw) => JSON.parse(raw).user === 'B');
  expect(cache.get('draft')).toBeUndefined();
  expect(localStorage.getItem('old')).toBeTruthy();
  cache.migrate('draft', 'old', (raw) => JSON.parse(raw).user === 'A');
  expect(cache.get('draft')).toEqual({ user: 'A' });
  expect(localStorage.getItem('old')).toBeNull();
});
