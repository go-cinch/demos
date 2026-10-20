import { describe, expect, it, vi } from 'vitest';

import { clientLabel, operationLabel, successful } from './audit-utils';

vi.mock('#/locales', () => ({
  $t: (key: string, params?: { module: string }) =>
    params ? `${key}:${params.module}` : key,
}));

describe('audit record presentation', () => {
  it.each([
    [199, false],
    [200, true],
    [299, true],
    [302, true],
    [399, true],
    [400, false],
    [500, false],
    [undefined, false],
  ] as const)('classifies HTTP status %s', (status, expected) => {
    expect(successful({ status })).toBe(expected);
  });
  it.each([
    ['Windows Chrome/120 Safari/537 Edg/120', 'Edge / Windows'],
    ['Android Linux Chrome/120 Safari/537', 'Chrome / Android'],
    ['iPhone Mac OS Safari/605', 'Safari / iOS'],
    ['Macintosh Firefox/120', 'Firefox / macOS'],
    ['', 'audit.otherClient'],
  ])('identifies overlapping client tokens in %s', (agent, expected) => {
    expect(clientLabel(agent)).toBe(expected);
  });
  it('uses authentication labels and translates create, delete and update operations', () => {
    expect(operationLabel({ module: 'auth', method: 'POST' })).toBe(
      'audit.modules.auth',
    );
    expect(operationLabel({ module: 'user', method: 'POST' })).toBe(
      'audit.actions.create:audit.modules.user',
    );
    expect(operationLabel({ module: 'user', method: 'DELETE' })).toBe(
      'audit.actions.remove:audit.modules.user',
    );
    expect(operationLabel({ module: 'user', method: 'PATCH' })).toBe(
      'audit.actions.update:audit.modules.user',
    );
  });
});
