import type { ActionResourceBinding, ResourceCatalog } from '@/api/system';

/** Scope is a view over the complete assignment, never a replacement for it. */
export function permissionScopeView(catalog: ResourceCatalog, scope: string, selections: readonly ActionResourceBinding[]) {
  const prefix = `${scope}:`;
  const bindings = selections.filter(binding => binding.resource_key.startsWith(prefix));
  return {
    resourceKeys: Object.keys(catalog.resources).filter(key => key.startsWith(prefix) && catalog.resources[key]?.kind === 'resource'),
    bindings,
    count: bindings.length,
  };
}
