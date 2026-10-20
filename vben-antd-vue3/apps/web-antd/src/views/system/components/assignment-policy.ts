const assignmentFields: Record<string, readonly string[]> = {
  user: ['role_id', 'action_codes', 'action_bindings'],
  role: ['action_codes', 'action_bindings'],
  'user-group': ['action_codes', 'action_bindings', 'user_ids', 'add_user_ids', 'remove_user_ids'],
};

export function isAssignmentField(resource: string, key: string) {
  return assignmentFields[resource]?.includes(key) ?? false;
}

/** Recheck at submission: hidden controls may retain state after a permission change. */
export function authorizedAssignmentPayload<T extends Record<string, unknown>>(
  resource: string,
  payload: T,
  canAssignPermissions: boolean,
): Record<string, unknown> {
  if (canAssignPermissions) return payload;
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !isAssignmentField(resource, key)));
}

export function isExistingCredentialField(resource: string, key: string) {
  return resource === 'user' && ['username', 'password'].includes(key);
}

export function authorizedEditorPayload(
  resource: string, payload: Record<string, unknown>, canAssignPermissions: boolean,
  hasAllPermissions: boolean, editing: boolean,
) {
  const assigned = authorizedAssignmentPayload(resource, payload, canAssignPermissions);
  return Object.fromEntries(Object.entries(assigned).filter(([key]) =>
    !editing || hasAllPermissions || !isExistingCredentialField(resource, key)));
}

/** Omitted associations are unknown, never evidence that a row is safe to delete. */
export function canDeleteAssignedRecord(resource: string, record: Record<string, unknown>, canAssignPermissions: boolean) {
  if (canAssignPermissions || !['role', 'user-group'].includes(resource)) return true;
  if (!Array.isArray(record.action_codes) || record.action_codes.length > 0) return false;
  return resource !== 'user-group' || record.member_count === 0;
}

export function isHighRiskAction(_word: string, builtin?: string, permissionScope?: string, permissionScopes?: string[]) {
  return Boolean(permissionScopes?.length) || builtin === 'all' || permissionScope === '*';
}

export function canManageDefinition(_word: string | undefined, builtin: string | undefined, hasAllPermissions: boolean, canPublishCatalog: boolean, permissionScope?: string) {
  if (builtin === 'all' || builtin === 'default' || permissionScope === '*') return hasAllPermissions || canPublishCatalog;
  return true;
}
