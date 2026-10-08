import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();
const key = 'LOGIN_ACCOUNT_HISTORY_example.test';
let storage: typeof import('./storage');
beforeEach(async () => {
  vi.resetModules();
  stored.clear();
  vi.stubGlobal('location', { hostname: 'example.test' });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('successful sign-in account history', () => {
  it('removes plaintext credentials during app startup without migrating them', async () => {
    stored.set(
      'go-cinch-remembered:example.test',
      JSON.stringify({ username: 'legacy', password: 'secret' }),
    );
    stored.set('go-cinch-remembered:other.test', 'untouched');
    storage = await import('./storage');
    expect(stored.has('go-cinch-remembered:example.test')).toBe(false);
    expect(stored.get('go-cinch-remembered:other.test')).toBe('untouched');
    expect(storage.loginAccountHistory()).toEqual([]);
  });
  it('keeps ten trimmed unique usernames with the latest account first', async () => {
    storage = await import('./storage');
    for (let index = 0; index < 12; index++) storage.recordLoginAccount(` user${index} `);
    expect(storage.recordLoginAccount(' user5 ')).toEqual([
      'user5',
      'user11',
      'user10',
      'user9',
      'user8',
      'user7',
      'user6',
      'user4',
      'user3',
      'user2',
    ]);
    storage.removeLoginAccount('user5');
    expect(storage.loginAccountHistory()).not.toContain('user5');
    expect(JSON.parse(stored.get(key)!)).toEqual(storage.loginAccountHistory());
    expect(storage.clearLoginAccountHistory()).toEqual([]);
    expect(stored.has(key)).toBe(false);
  });
  it('discards non-string records and normalizes malformed stored history', async () => {
    storage = await import('./storage');
    stored.set(
      key,
      JSON.stringify([
        ' alice ',
        { username: 'bob', password: 'secret' },
        null,
        'alice',
        '',
        ' Bob ',
      ]),
    );
    expect(storage.loginAccountHistory()).toEqual(['alice', 'Bob']);
    expect(stored.get(key)).toBe('["alice","Bob"]');
    stored.set(key, '{invalid');
    expect(storage.loginAccountHistory()).toEqual([]);
    expect(stored.has(key)).toBe(false);
  });
  it('does not block authentication when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('disabled');
      },
      removeItem: () => {
        throw new Error('disabled');
      },
    });
    storage = await import('./storage');
    expect(storage.loginAccountHistory()).toEqual([]);
    expect(storage.recordLoginAccount('alice')).toEqual(['alice']);
    expect(storage.removeLoginAccount('alice')).toEqual([]);
  });
});
