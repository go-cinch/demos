import { describe, expect, it } from 'vitest';

import { isValidUsername, isValidUserPassword } from './user-validation';

describe('user management validation', () => {
  it('accepts every non-blank trimmed username', () => {
    for (const username of [
      'a',
      '用户名称一',
      '1user',
      'user.name',
      ' user name ',
      `a${'b'.repeat(100)}`,
    ]) {
      expect(isValidUsername(username)).toBe(true);
    }
    for (const username of ['', '   ', '\t\n']) {
      expect(isValidUsername(username)).toBe(false);
    }
  });

  it('accepts every non-blank trimmed password', () => {
    expect(isValidUserPassword('1')).toBe(true);
    expect(isValidUserPassword('密码')).toBe(true);
    expect(isValidUserPassword(' a '.repeat(100))).toBe(true);
    expect(isValidUserPassword('')).toBe(false);
    expect(isValidUserPassword('   ')).toBe(false);
  });
});
