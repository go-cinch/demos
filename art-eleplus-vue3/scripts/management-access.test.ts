import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasManagementControl,
  canManageResourceRecord,
  canRemoveManagementRecord,
  type ManagementAccess
} from '../src/views/system/components/management-access'

function access(resource: string, controls: string[], scopes: string[] = []): ManagementAccess {
  return {
    hasAllPermissions: false,
    canPublishCatalog: false,
    hasButton: (key, path) =>
      path === `/system/${resource}` &&
      controls.some((control) => key === `admin:btn:system:${resource}:${control}`),
    canManagePermission: (target, operation) => scopes.includes(`${target}:${operation}`)
  }
}

test('read features are independent and never inferred from another granted feature', () => {
  const grants = access('user', ['query', 'view-detail'])
  assert.equal(hasManagementControl('user', 'query', grants), true)
  assert.equal(hasManagementControl('user', 'view-detail', grants), true)
  for (const control of ['reset-query', 'refresh', 'delete', 'delete-selected', 'edit', 'create']) {
    assert.equal(hasManagementControl('user', control, grants), false, control)
  }
  assert.equal(hasManagementControl('user', 'query', access('user', ['reset-query'])), false)
  assert.equal(hasManagementControl('user', 'reset-query', access('user', ['reset-query'])), true)
  assert.equal(hasManagementControl('role', 'query', grants), false)
})

test('action CRUD and batch deletion require their own key and matching action operation scope', () => {
  for (const [control, operation] of [
    ['create', 'create'],
    ['edit', 'update'],
    ['delete', 'delete'],
    ['delete-selected', 'delete']
  ]) {
    assert.equal(hasManagementControl('action', control, access('action', [control])), false)
    assert.equal(
      hasManagementControl('action', control, access('action', [control], [`action:${operation}`])),
      true
    )
    assert.equal(
      hasManagementControl('action', control, access('action', [], [`action:${operation}`])),
      false
    )
  }
  assert.equal(
    hasManagementControl('action', 'view-detail', access('action', ['view-detail'])),
    true
  )
})

test('batch-only users may select one eligible row without acquiring single-record delete', () => {
  const grants = access('role', ['delete-selected'])
  assert.equal(
    canRemoveManagementRecord('role', { id: 1, action_codes: [] }, 'delete-selected', grants),
    true
  )
  assert.equal(
    canRemoveManagementRecord('role', { id: 1, action_codes: [] }, 'delete', grants),
    false
  )
  assert.equal(canRemoveManagementRecord('role', { id: 1 }, 'delete-selected', grants), false)
  assert.equal(
    canRemoveManagementRecord('role', { id: 1, action_codes: ['A'] }, 'delete-selected', grants),
    false
  )
  const groups = access('user-group', ['delete-selected'])
  assert.equal(
    canRemoveManagementRecord('user-group', { id: 1, action_codes: [] }, 'delete-selected', groups),
    false
  )
  assert.equal(
    canRemoveManagementRecord(
      'user-group',
      { id: 1, action_codes: [], member_count: 0 },
      'delete-selected',
      groups
    ),
    true
  )
})

test('unknown and reserved action definitions remain protected for scoped managers', () => {
  const grants = access('action', ['edit', 'delete-selected'], ['action:update', 'action:delete'])
  assert.equal(canManageResourceRecord('action', { id: 1 }, grants), false)
  assert.equal(
    canManageResourceRecord('action', { id: 1, config: { builtin: 'all' } }, grants),
    false
  )
  assert.equal(
    canRemoveManagementRecord(
      'action',
      { id: 1, config: { builtin: 'default' } },
      'delete-selected',
      grants
    ),
    false
  )
  assert.equal(
    canRemoveManagementRecord(
      'action',
      { id: 1, config: { bindings: [] } },
      'delete-selected',
      grants
    ),
    true
  )
})

test('special user operations are independent of edit and each other', () => {
  const grants = access('user', ['unlock-password'])
  assert.equal(hasManagementControl('user', 'unlock-password', grants), true)
  for (const control of ['edit', 'approve', 'lock', 'unlock'])
    assert.equal(hasManagementControl('user', control, grants), false)
})
