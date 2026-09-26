import { describe, expect, it } from 'vitest';

import { matchAccessCodes } from './use-access';

describe('matchAccessCodes', () => {
  it('matches an assigned button permission', () => {
    expect(matchAccessCodes(['system.user.read'], ['system.user.read'])).toBe(
      true,
    );
    expect(matchAccessCodes(['system.user.read'], ['system.user.create'])).toBe(
      false,
    );
  });

  it('treats the wildcard as all button permissions', () => {
    expect(matchAccessCodes(['*'], ['system.user.create'])).toBe(true);
    expect(matchAccessCodes(['*'], ['system.role.delete'])).toBe(true);
  });
});
