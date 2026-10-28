import assert from 'node:assert/strict'
import test from 'node:test'
import { managementListFields } from '../src/views/system/components/management-projection'
import { canDeleteAssignedRecord } from '../src/views/system/components/assignment-policy'
import { countMembers, permissionSummaries, previewMembers } from '../src/utils/admin/model'

const fields = (options: Partial<Parameters<typeof managementListFields>[0]>) =>
  managementListFields({
    resource: 'role',
    view: 'cards',
    columns: [],
    visible: [],
    canAssignPermissions: true,
    canDelete: true,
    canDeleteSelected: true,
    ...options
  }).split(',')

test('action matrices retain authorization config and derive business cells without raw rules', () => {
  assert.deepEqual(
    fields({ resource: 'action', view: 'matrix', visible: ['resource', 'menu', 'button'] }),
    ['id', 'name', 'word', 'config']
  )
  assert.deepEqual(
    fields({
      resource: 'action',
      view: 'table',
      columns: [{ key: 'code' }, { key: 'group' }, { key: 'resource' }],
      visible: ['code']
    }),
    ['id', 'name', 'word', 'config', 'code']
  )
})

test('user tables request only visible columns alongside the identification and status base', () => {
  assert.deepEqual(
    fields({
      resource: 'user',
      view: 'table',
      columns: [{ key: 'role', format: 'role' }, { key: 'action_codes' }, { key: 'login_count' }],
      visible: ['role', 'login_count']
    }),
    ['id', 'username', 'code', 'status', 'metadata', 'role_summary', 'login_count']
  )
  assert.ok(
    fields({
      resource: 'user',
      view: 'table',
      columns: [{ key: 'action_codes' }],
      visible: ['action_codes']
    }).includes('action_codes')
  )
})

test('role and group cards use lightweight summaries and bounded member previews', () => {
  assert.deepEqual(fields({}), [
    'id',
    'name',
    'word',
    'action_summaries',
    'created_at',
    'updated_at'
  ])
  const group = fields({ resource: 'user-group' })
  assert.deepEqual(group, [
    'id',
    'name',
    'word',
    'action_summaries',
    'member_count',
    'member_preview',
    'created_at',
    'updated_at'
  ])
  assert.ok(!group.includes('actions') && !group.includes('users'))
  assert.deepEqual(
    fields({
      resource: 'user-group',
      view: 'table',
      columns: [{ key: 'users', format: 'users' }, { key: 'action_codes' }],
      visible: ['users']
    }),
    ['id', 'name', 'word', 'member_count', 'member_preview']
  )
})

test('deletion without assignment access requires known empty associations', () => {
  assert.ok(fields({ canAssignPermissions: false }).includes('action_codes'))
  const group = fields({
    resource: 'user-group',
    canAssignPermissions: false,
    canDelete: false,
    canDeleteSelected: true
  })
  assert.ok(group.includes('action_codes') && group.includes('member_count'))
  assert.ok(
    !fields({ canAssignPermissions: false, canDelete: false, canDeleteSelected: false }).includes(
      'action_codes'
    )
  )
  assert.equal(canDeleteAssignedRecord('role', { id: 1 }, false), false)
  assert.equal(canDeleteAssignedRecord('role', { id: 1, action_summaries: [] }, false), false)
  assert.equal(canDeleteAssignedRecord('role', { id: 1, action_codes: [] }, false), true)
  assert.equal(canDeleteAssignedRecord('user-group', { id: 1, action_codes: [] }, false), false)
  assert.equal(
    canDeleteAssignedRecord('user-group', { id: 1, action_codes: [], member_count: 0 }, false),
    true
  )
  assert.equal(
    canDeleteAssignedRecord('user-group', { id: 1, action_codes: [], member_count: 2 }, false),
    false
  )
})

test('dictionary cards keep their values while hidden table values are not fetched', () => {
  assert.deepEqual(fields({ resource: 'dictionary' }), [
    'id',
    'name',
    'key',
    'enabled',
    'description',
    'value',
    'created_at',
    'updated_at'
  ])
  assert.deepEqual(
    fields({
      resource: 'dictionary',
      view: 'table',
      columns: [{ key: 'enabled' }, { key: 'value' }],
      visible: ['enabled']
    }),
    ['id', 'name', 'key', 'enabled']
  )
})

test('summary projections honor explicit empty arrays and never require full action mappings', () => {
  const summaries = [
    { code: 'A', name: 'Read', group: 'People' },
    { code: 'B', name: 'Write', group: 'People' }
  ]
  assert.equal(permissionSummaries({ id: 1, action_summaries: summaries }).length, 2)
  assert.deepEqual(permissionSummaries({ id: 1, action_summaries: [], actions: summaries }), [])
  assert.deepEqual(permissionSummaries({ id: 1, actions: summaries }), summaries)
  assert.deepEqual(permissionSummaries({ id: 1 }), [])
  assert.equal(countMembers({ id: 1, member_count: 0, users: [{ id: 2 }] }), 0)
  assert.deepEqual(previewMembers({ id: 1, member_preview: [], users: [{ id: 2 }] }), [])
})
