import { describe, expect, it } from 'vitest';

import { buildChangedPayload, snapshotPayload } from './update-payload';

describe('update payload', () => {
  it('keeps only fields changed by an editor', () => {
    expect(
      buildChangedPayload(
        { group: 'System', name: 'Read User', word: 'user.read' },
        { group: 'System', name: 'Read Users', word: 'user.read' },
      ),
    ).toEqual({ name: 'Read Users' });
  });

  it('compares arrays and objects by content', () => {
    expect(
      buildChangedPayload(
        {
          action_codes: ['user.read'],
          metadata: { preferences: { locale: 'en-US' } },
        },
        {
          action_codes: ['user.read'],
          metadata: { preferences: { locale: 'en-US' } },
        },
      ),
    ).toEqual({});
  });

  it('preserves an explicit collection clear', () => {
    expect(
      buildChangedPayload(
        { action_codes: ['user.read'] },
        { action_codes: [] },
      ),
    ).toEqual({ action_codes: [] });
  });

  it('takes a detached snapshot of editable values', () => {
    const source = { action_codes: ['user.read'], name: 'Operator' };
    const snapshot = snapshotPayload(source, ['action_codes', 'name']);
    source.action_codes.push('user.update');
    expect(snapshot).toEqual({
      action_codes: ['user.read'],
      name: 'Operator',
    });
  });
});
