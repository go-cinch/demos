import type { ActionResourceBinding, ResourceCatalog, UserPermissionSource } from '#/api/system';

import { normalizeSelection } from './permission-selection';
import { permissionOperations } from './resource-catalog';

export interface ResolvedPermissionSource extends UserPermissionSource {
  bindings: ActionResourceBinding[];
}

/** A scoped all grant covers every current resource, operation and feature. */
export function expandEffectiveSelection(catalog: ResourceCatalog, bindings: ActionResourceBinding[]) {
  const scopes = new Set(bindings.filter((binding) => binding.operation === '*' && catalog.resources[binding.resource_key]?.permission_scope === '*').map((binding) => binding.resource_key.split(':')[0]));
  const expanded = Object.entries(catalog.resources).flatMap(([resource_key, node]) => {
    if (node.kind !== 'resource' || !scopes.has(resource_key.split(':')[0])) return [];
    return permissionOperations.filter((operation) => node.operations?.[operation]).map((operation) => ({
      resource_key, operation, feature_keys: node.operations?.[operation]?.button_keys ?? [],
    }));
  });
  return normalizeSelection(catalog, [...bindings, ...expanded]);
}
