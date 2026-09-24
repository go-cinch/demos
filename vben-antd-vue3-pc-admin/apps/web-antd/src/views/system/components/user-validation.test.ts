import { describe, expect, it } from 'vitest';

import { isValidUsername, isValidUserPassword } from './user-validation';

describe('user management validation', () => {
  it('requires usernames to start with an ASCII letter and use allowed characters', () => {
    for (const username of ['abcde', 'User_01', 'user-name']) {
      expect(isValidUsername(username)).toBe(true);
    }
    for (const username of [
      'abcd',
      '用户名称一',
      '1user',
      '-user',
      '_user',
      'user.name',
      'user name',
      ' abcde ',
      `a${'b'.repeat(50)}`,
    ]) {
      expect(isValidUsername(username)).toBe(false);
    }
  });

  it('validates passwords by UTF-8 byte length', () => {
    expect(isValidUserPassword('12345')).toBe(false);
    expect(isValidUserPassword('123456')).toBe(true);
    expect(isValidUserPassword('密码')).toBe(true);
    expect(isValidUserPassword('a'.repeat(73))).toBe(false);
  });
});
