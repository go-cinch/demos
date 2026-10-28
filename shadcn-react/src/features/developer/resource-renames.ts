import type { Catalog } from './catalog-model';

export function readRenameMap(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.values(value).some((entry) => typeof entry !== 'string')
  )
    throw new Error('Invalid identifier migration state');
  return { ...value } as Record<string, string>;
}

// Keep only unpublished moves and flatten repeated moves to their final keys.
export function mergeKeyRenames(previous: Record<string, string>, changes: Record<string, string>) {
  const result: Record<string, string> = {};
  const intermediateKeys = new Set(Object.values(previous));
  for (const [from, to] of Object.entries(previous)) {
    const target = changes[to] ?? to;
    if (from !== target) result[from] = target;
  }
  // A later move starts at the previous destination, which was never online.
  // Keep its original source only; moving back removes the migration entirely.
  for (const [from, to] of Object.entries(changes)) {
    if (from !== to && !intermediateKeys.has(from)) result[from] = to;
  }
  return result;
}

function pendingKeys(previous: object, current: object, renames: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(renames).filter(
      ([from, to]) =>
        Object.hasOwn(previous, from) && !Object.hasOwn(current, from) && Object.hasOwn(current, to)
    )
  );
}

export function pendingResourceRenames(
  base: Catalog,
  document: Catalog,
  resources: Record<string, string>,
  features: Record<string, string>
) {
  return {
    resources: pendingKeys(
      base.resource_catalog.resources,
      document.resource_catalog.resources,
      resources
    ),
    features: pendingKeys(
      base.resource_catalog.buttons,
      document.resource_catalog.buttons,
      features
    )
  };
}

// Preserve unpublished moves when upgrading an existing browser draft/import.
export function legacyResourceRenames(base: Catalog, document: Catalog) {
  const legacy = document.resource_catalog as unknown as Record<string, unknown>;
  return pendingResourceRenames(
    base,
    document,
    readRenameMap(legacy.resource_aliases),
    readRenameMap(legacy.feature_aliases)
  );
}
