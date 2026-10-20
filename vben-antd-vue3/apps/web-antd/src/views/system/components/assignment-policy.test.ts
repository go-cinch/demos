import { describe, expect, it } from 'vitest';
import {
  authorizedAssignmentPayload,
  authorizedEditorPayload,
  canDeleteAssignedRecord,
  canManageDefinition,
  isAssignmentField,
  isHighRiskAction,
} from './assignment-policy';
import { buildUserGroupChanges } from './update-payload';

describe('assignment and definition capabilities remain separate', () => {
  it('omits unauthorized user assignments, including clear values, while preserving ordinary changes', () => {
    expect(
      authorizedAssignmentPayload(
        'user',
        {
          username: 'renamed',
          metadata: { note: 'ordinary profile' },
          role_id: 0,
          action_codes: [],
        },
        false,
      ),
    ).toEqual({ username: 'renamed', metadata: { note: 'ordinary profile' } });
  });
  it('omits role and group grants and every membership mutation', () => {
    expect(
      authorizedAssignmentPayload(
        'role',
        { name: 'Renamed', action_codes: ['ALL'] },
        false,
      ),
    ).toEqual({ name: 'Renamed' });
    expect(
      authorizedAssignmentPayload(
        'user-group',
        {
          name: 'Renamed',
          action_codes: [],
          user_ids: [],
          add_user_ids: [9],
          remove_user_ids: [1],
        },
        false,
      ),
    ).toEqual({ name: 'Renamed' });
  });
  it('preserves intentional assignment clearing for an authorized administrator', () => {
    const payload = { role_id: 0, action_codes: [] };
    expect(authorizedAssignmentPayload('user', payload, true)).toEqual(payload);
  });
  it('filters resource bindings at submission after assignment authority is revoked', () => {
    for (const resource of ['user', 'role', 'user-group']) {
      const payload = { name: 'Updated', action_bindings: [] };
      expect(authorizedAssignmentPayload(resource, payload, false)).toEqual({
        name: 'Updated',
      });
      expect(authorizedAssignmentPayload(resource, payload, true)).toEqual(
        payload,
      );
      expect(isAssignmentField(resource, 'action_bindings')).toBe(true);
    }
  });
  it('allows ordinary group editing with no membership fields mounted', () => {
    expect(buildUserGroupChanges({ name: 'Old' }, { name: 'New' })).toEqual({
      name: 'New',
    });
    expect(isAssignmentField('user', 'role_id')).toBe(true);
    expect(isAssignmentField('user-group', 'user_ids')).toBe(true);
    expect(isAssignmentField('user', 'username')).toBe(false);
  });
});

describe('credential and deletion boundaries', () => {
  it('keeps ordinary initial credentials but omits existing credentials and assignments without capabilities', () => {
    const payload = {
      username: 'new-user',
      password: 'initial',
      role_id: 0,
      action_codes: [],
      metadata: { note: 'profile' },
    };
    expect(
      authorizedEditorPayload('user', payload, false, false, false),
    ).toEqual({
      username: 'new-user',
      password: 'initial',
      metadata: { note: 'profile' },
    });
    expect(
      authorizedEditorPayload('user', payload, false, false, true),
    ).toEqual({ metadata: { note: 'profile' } });
  });
  it('allows a grant holder to assign an existing user without changing their username/password', () => {
    const payload = {
      username: 'managed',
      password: 'changed',
      role_id: 2,
      action_codes: ['ALL'],
      metadata: {},
    };
    expect(authorizedEditorPayload('user', payload, true, false, true)).toEqual(
      { role_id: 2, action_codes: ['ALL'], metadata: {} },
    );
    expect(authorizedEditorPayload('user', payload, true, true, true)).toEqual(
      payload,
    );
  });
  it('requires assignment authority to delete a role/group with grants or memberships, and rejects unknown rows', () => {
    expect(canDeleteAssignedRecord('role', {}, false)).toBe(false);
    expect(canDeleteAssignedRecord('role', { action_codes: [] }, false)).toBe(
      true,
    );
    expect(
      canDeleteAssignedRecord('role', { action_codes: ['READ'] }, false),
    ).toBe(false);
    expect(
      canDeleteAssignedRecord('user-group', { action_codes: [] }, false),
    ).toBe(false);
    expect(
      canDeleteAssignedRecord(
        'user-group',
        { action_codes: [], member_count: 0 },
        false,
      ),
    ).toBe(true);
    expect(
      canDeleteAssignedRecord(
        'user-group',
        { action_codes: [], member_count: 1 },
        false,
      ),
    ).toBe(false);
    expect(
      canDeleteAssignedRecord(
        'user-group',
        { action_codes: ['ALL'], member_count: 1 },
        true,
      ),
    ).toBe(true);
  });
  it('labels the grant capability as high risk without treating ordinary write permissions as grants', () => {
    expect(isHighRiskAction('admin:grant:system:permission-admin')).toBe(false);
    expect(isHighRiskAction('admin:all:system:all', 'all')).toBe(true);
    expect(isHighRiskAction('admin:update:system:permission')).toBe(false);
  });
});

it('protects all definitions and delegates defaults even when a sparse list omits config', () => {
  expect(
    canManageDefinition('admin:all:system:all', undefined, false, true),
  ).toBe(true);
  expect(
    canManageDefinition('admin:all:system:all', undefined, true, true),
  ).toBe(true);
  expect(
    canManageDefinition(
      'admin:default:system:default',
      'default',
      false,
      false,
    ),
  ).toBe(false);
  expect(
    canManageDefinition('admin:default:system:default', undefined, false, true),
  ).toBe(true);
  expect(
    canManageDefinition('admin:read:system:user', undefined, false, false),
  ).toBe(true);
});

it('allows catalog publishers to maintain wildcard definitions without global wildcard authority', () => {
  expect(
    canManageDefinition(
      'admin:read:renamed:resource',
      undefined,
      false,
      true,
      '*',
    ),
  ).toBe(true);
  expect(
    canManageDefinition(
      'admin:read:renamed:resource',
      undefined,
      false,
      false,
      '*',
    ),
  ).toBe(false);
  expect(
    canManageDefinition('admin:all:legacy:record', 'all', false, true),
  ).toBe(true);
  expect(isHighRiskAction('admin:read:renamed:resource', undefined, '*')).toBe(
    true,
  );
});
