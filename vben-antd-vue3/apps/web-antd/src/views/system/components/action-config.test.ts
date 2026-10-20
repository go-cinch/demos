import { describe, expect, it } from 'vitest';
import { actionWordPattern } from './action-config';
describe('permission word validation', () => {
  it('accepts fixed operations and system capabilities', () => {
    for (const operation of [
      'read',
      'create',
      'update',
      'delete',
      'all',
      'default',
      'grant',
    ])
      expect(actionWordPattern.test(`admin:${operation}:system:user`)).toBe(
        true,
      );
  });
  it('rejects old operation tokens and malformed words', () => {
    for (const word of [
      'admin:edit:system:user',
      'admin:export:system:user',
      'admin:send:system:msg',
      'user.read',
      'admin:read:system',
    ])
      expect(actionWordPattern.test(word)).toBe(false);
  });
});
