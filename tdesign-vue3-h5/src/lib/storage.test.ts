import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();
const sessionStored = new Map<string, string>();
const key = 'LOGIN_ACCOUNT_HISTORY_example.test';
let storage: typeof import('./storage');
beforeEach(async () => {
  vi.resetModules();
  stored.clear();
  sessionStored.clear();
  vi.stubGlobal('location', { hostname: 'example.test' });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => sessionStored.get(key) ?? null,
    setItem: (key: string, value: string) => sessionStored.set(key, value),
    removeItem: (key: string) => sessionStored.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Moonwhite storage migration', () => {
  it.each([
    ['preferences', { dark: true, timezone: 'Asia/Tokyo', company: 'Saved company' }],
    ['language', 'en-US'],
    ['session:example.test', 'saved-refresh-token'],
    ['filter:user:username', ['alice', 'bob']],
  ])('migrates %s without changing its stored value', async (suffix, value) => {
    const previous = `cinch-mobile-${suffix}`;
    const current = `cinch-moonwhite-${suffix}`;
    const encoded = JSON.stringify(value);
    stored.set(previous, encoded);
    storage = await import('./storage');
    expect(storage.readStored(current, null)).toEqual(value);
    expect(stored.get(current)).toBe(encoded);
    expect(stored.has(previous)).toBe(false);
  });

  it('keeps the current value when both namespaces exist', async () => {
    stored.set('cinch-mobile-language', '"zh-CN"');
    stored.set('cinch-moonwhite-language', '"en-US"');
    storage = await import('./storage');
    expect(storage.readStored('cinch-moonwhite-language', 'zh-CN')).toBe('en-US');
    expect(stored.has('cinch-mobile-language')).toBe(false);
  });

  it('preserves an explicitly empty current session instead of reviving the old session', async () => {
    stored.set('cinch-mobile-session:example.test', '"old-refresh"');
    stored.set('cinch-moonwhite-session:example.test', '""');
    storage = await import('./storage');
    expect(storage.readStored('cinch-moonwhite-session:example.test', '')).toBe('');
    expect(stored.has('cinch-mobile-session:example.test')).toBe(false);
  });

  it.each(['session:example.test', 'filter:user:username'])(
    'clears both versions of %s',
    async (suffix) => {
      const previous = `cinch-mobile-${suffix}`;
      const current = `cinch-moonwhite-${suffix}`;
      stored.set(previous, '"old"');
      stored.set(current, '"current"');
      storage = await import('./storage');
      storage.writeStored(current, undefined);
      expect(stored.has(previous)).toBe(false);
      expect(stored.has(current)).toBe(false);
      expect(storage.readStored(current, '')).toBe('');
    },
  );

  it('migrates and clears the screen lock only within session storage', async () => {
    const lock = { hash: 'saved-hash', salt: 'saved-salt', userId: 42 };
    sessionStored.set('cinch-mobile-lock', JSON.stringify(lock));
    stored.set('cinch-mobile-lock', 'untouched-local-value');
    storage = await import('./storage');
    expect(storage.readStored('cinch-moonwhite-lock', {}, 'session')).toEqual(lock);
    expect(JSON.parse(sessionStored.get('cinch-moonwhite-lock')!)).toEqual(lock);
    expect(sessionStored.has('cinch-mobile-lock')).toBe(false);
    expect(stored.get('cinch-mobile-lock')).toBe('untouched-local-value');
    sessionStored.set('cinch-mobile-lock', JSON.stringify(lock));
    storage.writeStored('cinch-moonwhite-lock', undefined, 'session');
    expect(sessionStored.size).toBe(0);
  });

  it('retains the migration source and restores in memory when copying is blocked', async () => {
    stored.set('cinch-mobile-language', '"en-US"');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: (key: string) => stored.delete(key),
    });
    storage = await import('./storage');
    expect(storage.readStored('cinch-moonwhite-language', 'zh-CN')).toBe('en-US');
    expect(stored.get('cinch-mobile-language')).toBe('"en-US"');
    expect(stored.has('cinch-moonwhite-language')).toBe(false);
  });

  it('falls back for malformed data without copying it or reviving a shadowed legacy value', async () => {
    stored.set('cinch-mobile-preferences', '{invalid');
    storage = await import('./storage');
    expect(storage.readStored('cinch-moonwhite-preferences', {})).toEqual({});
    expect(stored.has('cinch-moonwhite-preferences')).toBe(false);
    stored.set('cinch-mobile-language', '"en-US"');
    stored.set('cinch-moonwhite-language', '{invalid');
    expect(storage.readStored('cinch-moonwhite-language', 'zh-CN')).toBe('zh-CN');
  });

  it('leaves Garnet keys and other hosts untouched', async () => {
    stored.set('cinch-garnet-language', '"en-US"');
    stored.set('cinch-mobile-session:other.test', '"other-refresh"');
    storage = await import('./storage');
    expect(storage.readStored('cinch-moonwhite-language', 'zh-CN')).toBe('zh-CN');
    expect(storage.readStored('cinch-moonwhite-session:example.test', '')).toBe('');
    expect(stored.get('cinch-garnet-language')).toBe('"en-US"');
    expect(stored.get('cinch-mobile-session:other.test')).toBe('"other-refresh"');
  });
});

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
