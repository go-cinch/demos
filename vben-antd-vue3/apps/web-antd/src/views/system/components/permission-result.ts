import type { ActionConfig } from '#/api/system';

import { actionResourceBindings } from './resource-catalog';

/** Business labels come from explicit bindings, never HTTP paths or action words. */
export function permissionResult(config?: ActionConfig) {
  const bindings = actionResourceBindings(config);
  const defaults = config?.builtin === 'default';
  const defaultOperations = config?.resource_keys?.length ? ['read'] : [];
  const selectedOperations = defaults
    ? defaultOperations
    : bindings.map((item) => item.operation);
  return {
    all: config?.builtin === 'all' || config?.permission_scope === '*',
    menus: [...new Set((config?.ui ?? []).map((item) => item.menu_key))],
    resources: [
      ...new Set(
        defaults
          ? (config?.resource_keys ?? [])
          : bindings.map((item) => item.resource_key),
      ),
    ],
    operations: [...new Set(selectedOperations)],
    features: [
      ...new Set(
        defaults
          ? (config?.feature_keys ?? [])
          : bindings.flatMap((item) => item.feature_keys ?? []),
      ),
    ],
    featuresKnown: defaults
      ? config?.feature_keys !== undefined
      : bindings.every(
          (item) =>
            item.feature_keys !== null && item.feature_keys !== undefined,
        ),
    available: Boolean(
      config &&
      (config.bindings !== undefined ||
        config.resource_key ||
        config.builtin ||
        config.permission_scope === '*'),
    ),
  };
}
