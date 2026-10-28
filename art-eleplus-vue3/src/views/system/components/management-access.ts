import { canDeleteAssignedRecord, canManageDefinition } from './assignment-policy'

export interface ManagementAccess {
  hasButton: (key: string, path?: string) => boolean
  canManagePermission: (resource: string, operation: string) => boolean
  hasAllPermissions: boolean
  canPublishCatalog: boolean
}

export function hasManagementControl(resource: string, control: string, access: ManagementAccess) {
  const operation = (
    { create: 'create', edit: 'update', delete: 'delete', 'delete-selected': 'delete' } as Record<
      string,
      string
    >
  )[control]
  return (
    (resource !== 'action' || !operation || access.canManagePermission('action', operation)) &&
    access.hasButton(`admin:btn:system:${resource}:${control}`, `/system/${resource}`)
  )
}

export function canManageResourceRecord(
  resource: string,
  record: Record<string, any>,
  access: ManagementAccess
) {
  if (resource !== 'action') return true
  if (!record.config) return false
  return canManageDefinition(
    record.word,
    record.config.builtin,
    access.hasAllPermissions,
    access.canPublishCatalog,
    record.config.permission_scope
  )
}

export function canRemoveManagementRecord(
  resource: string,
  record: Record<string, any>,
  control: 'delete' | 'delete-selected',
  access: ManagementAccess
) {
  return (
    hasManagementControl(resource, control, access) &&
    canManageResourceRecord(resource, record, access) &&
    canDeleteAssignedRecord(resource, record, access.canManagePermission(resource, 'delete'))
  )
}
