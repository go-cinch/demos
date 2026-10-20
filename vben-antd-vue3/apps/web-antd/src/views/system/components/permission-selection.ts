import type { ActionConfig, ActionResourceBinding, ResourceCatalog } from '#/api/system';

import { actionResourceBindings, resolveResourceConfig } from './resource-catalog';

export type AssignmentAction = { code: string; word: string; config?: ActionConfig };

/** Keep every selected feature explicit. An empty array must never become all. */
export function normalizeSelection(catalog: ResourceCatalog, selections: ActionResourceBinding[]) {
  const pairs = new Map<string, ActionResourceBinding>();
  for (const selection of selections) {
    const features = selection.feature_keys ?? catalog.resources[selection.resource_key]?.operations?.[selection.operation]?.button_keys ?? [];
    resolveResourceConfig(catalog, selection.resource_key, selection.operation, features);
    const key = `${selection.resource_key}:${selection.operation}`;
    const existing = pairs.get(key);
    pairs.set(key, { resource_key: selection.resource_key, operation: selection.operation,
      feature_keys: [...new Set([...(existing?.feature_keys ?? []), ...features])].sort() });
  }
  return [...pairs.values()].sort((a, b) => `${a.resource_key}:${a.operation}`.localeCompare(`${b.resource_key}:${b.operation}`));
}

export function actionSelection(catalog: ResourceCatalog, action: AssignmentAction): ActionResourceBinding[] {
  const config = action.config;
  if (!config) throw new Error('Missing permission definition');
  const scope = action.word.split(':')[0]!;
  if (config.bindings || config.resource_key) return normalizeSelection(catalog, actionResourceBindings(config));
  if (config.builtin === 'all') {
    const key = Object.keys(catalog.resources).sort().find((key) => key.startsWith(`${scope}:`) && catalog.resources[key]?.permission_scope === '*');
    if (key) return [{ resource_key: key, operation: '*', feature_keys: [] }];
  }
  if (config.builtin === 'default' && config.resource_keys) {
    return normalizeSelection(catalog, config.resource_keys.map((resource_key) => ({ resource_key, operation: 'read',
      feature_keys: (catalog.resources[resource_key]?.operations?.read?.button_keys ?? []).filter((key) => config.feature_keys == null || config.feature_keys.includes(key)),
    })));
  }
  // Do not silently omit an assignment that cannot be represented by the catalog.
  throw new Error('Permission definition is not represented in the resource catalog');
}

export const selectionFingerprint = (value: ActionResourceBinding[]) => JSON.stringify(value);
