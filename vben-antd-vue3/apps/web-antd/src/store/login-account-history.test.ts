import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearLoginAccountHistory,
  readLoginAccountHistory,
  recordLoginAccount,
  removeLoginAccount,
} from './login-account-history';

const key = () => `LOGIN_ACCOUNT_HISTORY_${location.hostname}`;

describe('local login account history', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps only ten unique trimmed account names in recency order', () => {
    for (let index = 0; index < 12; index++)
      recordLoginAccount(`user-${index}`);
    recordLoginAccount('  user-5  ');
    expect(readLoginAccountHistory()).toEqual([
      'user-5',
      'user-11',
      'user-10',
      'user-9',
      'user-8',
      'user-7',
      'user-6',
      'user-4',
      'user-3',
      'user-2',
    ]);
    recordLoginAccount('   ');
    expect(readLoginAccountHistory()).toHaveLength(10);
  });

  it('removes legacy passwords rather than migrating them', () => {
    localStorage.setItem(
      `REMEMBER_ME_CREDENTIALS_${location.hostname}`,
      JSON.stringify({ username: 'legacy', password: 'old-secret' }),
    );
    localStorage.setItem(`REMEMBER_ME_USERNAME_${location.hostname}`, 'legacy');
    expect(readLoginAccountHistory()).toEqual([]);
    expect(
      localStorage.getItem(`REMEMBER_ME_CREDENTIALS_${location.hostname}`),
    ).toBeNull();
    recordLoginAccount('new-user');
    expect(localStorage.getItem(key())).toBe('["new-user"]');
  });

  it('rejects credential objects and malformed storage while retaining valid names', () => {
    localStorage.setItem(
      key(),
      JSON.stringify([
        ' a ',
        { username: 'b', password: 'secret' },
        1,
        '',
        'a',
      ]),
    );
    expect(readLoginAccountHistory()).toEqual(['a']);
    localStorage.setItem(key(), '{');
    expect(readLoginAccountHistory()).toEqual([]);
    recordLoginAccount('fresh');
    expect(readLoginAccountHistory()).toEqual(['fresh']);
  });

  it('supports removing one account and clearing all history', () => {
    recordLoginAccount('a');
    recordLoginAccount('b');
    removeLoginAccount('a');
    expect(readLoginAccountHistory()).toEqual(['b']);
    clearLoginAccountHistory();
    expect(localStorage.getItem(key())).toBeNull();
  });

  it('does not prevent login when browser storage is blocked', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLoginAccountHistory()).toEqual([]);
    expect(() => recordLoginAccount('tester')).not.toThrow();
    expect(() => clearLoginAccountHistory()).not.toThrow();
  });
});
