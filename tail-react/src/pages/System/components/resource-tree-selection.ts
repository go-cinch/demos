import type { ActionResourceBinding, ResourceCatalog } from '@/api/system';
import { permissionOperations } from './resource-catalog';
import { referencedOperations, referenceResourceBindings } from './resource-references';

/** Match Vben's configured operation set, including granular operations beside *. */
export function resourceOperationKeys(catalog: ResourceCatalog, key: string): string[] {
  const node = catalog.resources[key];
  return [...(node?.permission_scope === '*' ? ['*'] : []), ...permissionOperations.filter(operation => node?.operations?.[operation])];
}

/** A linked row inherits only its owner's explicitly configured operations. */
export function resourceTreeSelections(catalog: ResourceCatalog, scope: string, key: string, owner?: string) {
  if (!key.startsWith(`${scope}:`) || (owner && !owner.startsWith(`${scope}:`))) return new Map<string, string[]>();
  const allowed = owner ? referencedOperations(catalog, owner, key) : [...permissionOperations, '*'];
  return new Map([...referenceResourceBindings(catalog, key, allowed)].map(([resource, operations]) => {
    const supported = resourceOperationKeys(catalog, resource);
    return [resource, operations.filter(operation => supported.includes(operation))] as const;
  }).filter(([resource, operations]) => resource.startsWith(`${scope}:`) && operations.length > 0));
}

export function resourceTreeSelectionState(catalog: ResourceCatalog, scope: string, bindings: readonly ActionResourceBinding[], key: string, owner?: string) {
  const selections = [...resourceTreeSelections(catalog, scope, key, owner)];
  const has = (resource: string, operation: string) => bindings.some(binding => binding.resource_key === resource && binding.operation === operation);
  const selected = selections.map(([resource, operations]) => owner ? operations.every(operation => has(resource, operation)) : operations.some(operation => has(resource, operation)));
  const all = selected.length > 0 && selected.every(Boolean);
  return { all, partial: !all && selections.some(([resource, operations]) => operations.some(operation => has(resource, operation))) };
}

export function toggleResourceTreeSelection(catalog: ResourceCatalog, scope: string, bindings: readonly ActionResourceBinding[], key: string, owner?: string, options: { readOnly?: boolean; disabled?: boolean } = {}) {
  if (options.readOnly || options.disabled) return [...bindings];
  const selections = resourceTreeSelections(catalog, scope, key, owner);
  const removing = resourceTreeSelectionState(catalog, scope, bindings, key, owner).all;
  const next = bindings.filter(binding => !removing || !selections.get(binding.resource_key)?.includes(binding.operation));
  if (!removing) for (const [resource_key, operations] of selections) {
    if (!owner && next.some(binding => binding.resource_key === resource_key && operations.includes(binding.operation))) continue;
    // Canonical rows start with one operation; references select their exact set.
    for (const operation of owner ? operations : operations.slice(0, 1)) {
      if (!next.some(binding => binding.resource_key === resource_key && binding.operation === operation))
        next.push({ resource_key, operation, feature_keys: [...(catalog.resources[resource_key]?.operations?.[operation]?.button_keys ?? [])] });
    }
  }
  return next;
}
