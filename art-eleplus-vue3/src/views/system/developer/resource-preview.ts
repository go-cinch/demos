import type { ResourceNode } from '@/api/permission-catalog'
import type { Catalog } from './catalog-model'
import model from './data/permission-groups.json'

const definition = model.resource_catalog
const directory = model.resource_directory

// JSON supplies initial definitions; the ordinary editor owns later changes.
export function seedResourceCatalog(source: Catalog): Catalog {
  if (!import.meta.env.DEV || source.resource_catalog.resources[directory.key]) return source
  if (!source.resource_catalog.resources[directory.after]) return source
  return upgradeResourceCatalog(source)
}

export function upgradeResourceCatalog(source: Catalog): Catalog {
  const catalog = JSON.parse(JSON.stringify(source)) as Catalog
  const resources = catalog.resource_catalog.resources
  const scope = directory.key.split(':')[0]!
  const roots = Object.entries(resources)
    .filter(([key, node]) => key.startsWith(`${scope}:`) && !node.parent)
    .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b))
    .map(([key]) => key)
  const hasRoot = Boolean(resources[directory.key])
  for (const [key, defaults] of Object.entries(definition.resources)) {
    const previous = resources[key]
    // A saved type conversion belongs to the editor. Preview defaults from the
    // old type must not restore operations, entries or wildcard grants on it.
    if (previous && previous.kind !== defaults.kind) continue
    const node = { ...JSON.parse(JSON.stringify(defaults)), ...previous } as ResourceNode
    Reflect.deleteProperty(node, 'action_word')
    if (node.kind === 'resource') {
      const operations = { ...(defaults as ResourceNode).operations }
      for (const [operation, binding] of Object.entries(previous?.operations ?? {})) {
        // Replace the untouched read placeholder from the original preview.
        if (
          operation === 'read' &&
          !binding.entry_keys.length &&
          !binding.button_keys.length &&
          !Object.keys(previous?.entries ?? {}).length
        )
          continue
        operations[operation] = binding
      }
      node.operations = operations
      if ('permission_scope' in defaults) node.permission_scope = '*'
    }
    if (node.entries && !Object.keys(node.entries).length) delete node.entries
    if (node.operations && !Object.keys(node.operations).length) delete node.operations
    resources[key] = node
  }
  if (!hasRoot) {
    const after = roots.indexOf(directory.after)
    const index = after
    roots.splice(index < 0 ? roots.length : index + 1, 0, directory.key)
    roots.forEach((key, position) => {
      resources[key]!.sort = position * 10
    })
  }
  const selected = new Set(
    Object.values(resources).flatMap((node) =>
      Object.values(node.operations ?? {}).flatMap((operation) => operation.button_keys)
    )
  )
  for (const [key, feature] of Object.entries(definition.buttons))
    if (selected.has(key))
      catalog.resource_catalog.buttons[key] = {
        ...JSON.parse(JSON.stringify(feature)),
        ...catalog.resource_catalog.buttons[key]
      }
  for (const [locale, messages] of Object.entries(catalog.messages)) {
    const frontend = (messages.frontend ??= {}) as Record<string, unknown>
    for (const [group, defaults] of Object.entries({
      resources: model.resource_names,
      features: model.feature_names
    })) {
      const names = (frontend[group] ??= {}) as Record<string, string>
      const labels = defaults[locale as keyof typeof defaults] ?? defaults['en-US']
      for (const [key, value] of Object.entries(labels)) {
        if (group === 'features' && !selected.has(key)) continue
        if (!names[key]) names[key] = value
      }
    }
  }
  return catalog
}

// An earlier local preview renumbered roots. Match server sort values only when
// the visible order is identical, and normalize equivalent empty seed fields.
// User names, mappings, deletions and actual moves are left for the normal merge.
export function harmonizeResourceModelDraft(source: Catalog, online: Catalog): Catalog {
  const draft = JSON.parse(JSON.stringify(source)) as Catalog
  const scope = directory.key.split(':')[0]!
  const roots = (catalog: Catalog) =>
    Object.entries(catalog.resource_catalog.resources)
      .filter(([key, node]) => key.startsWith(`${scope}:`) && !node.parent)
      .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b))
      .map(([key]) => key)
  const order = roots(draft)
  if (JSON.stringify(order) === JSON.stringify(roots(online)))
    for (const key of order)
      draft.resource_catalog.resources[key]!.sort = online.resource_catalog.resources[key]!.sort
  const comparable = (value: unknown) =>
    JSON.stringify(value, (key, entry: unknown) => {
      if (
        ['entries', 'operations', 'references', 'child_order', 'entry_keys'].includes(key) &&
        entry &&
        typeof entry === 'object' &&
        Object.keys(entry).length === 0
      )
        return undefined
      return entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
        : entry
    })
  for (const section of ['resources', 'buttons'] as const) {
    for (const key of Object.keys(definition[section])) {
      const current = draft.resource_catalog[section][key]
      const remote = online.resource_catalog[section][key]
      if (current && remote && comparable(current) === comparable(remote))
        Reflect.set(draft.resource_catalog[section], key, JSON.parse(JSON.stringify(remote)))
    }
  }
  return draft
}

// Versions 1–4 could merge resource defaults onto an already saved directory.
// Repair only the exact injected preview definitions. Online/base data and any
// custom mappings, labels, directory references or unrelated edits stay intact.
export function repairResourcePreviewDraft(
  source: Catalog,
  base: Catalog,
  online: Catalog
): Catalog {
  const draft = JSON.parse(JSON.stringify(source)) as Catalog
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a, canonical) === JSON.stringify(b, canonical)
  const candidates = new Set<string>()
  let changed = false
  for (const [key, defaults] of Object.entries(definition.resources)) {
    const node = draft.resource_catalog.resources[key]
    if (
      defaults.kind !== 'resource' ||
      node?.kind !== 'directory' ||
      (base.resource_catalog.resources[key]?.kind !== 'directory' &&
        online.resource_catalog.resources[key]?.kind !== 'directory') ||
      !same(node.operations, (defaults as ResourceNode).operations)
    )
      continue
    for (const operation of Object.values(node.operations ?? {}))
      for (const feature of operation.button_keys) candidates.add(feature)
    delete node.operations
    if (node.entries && !Object.keys(node.entries).length) delete node.entries
    changed = true
  }
  const selected = new Set(
    Object.values(draft.resource_catalog.resources).flatMap((node) =>
      Object.values(node.operations ?? {}).flatMap((operation) => operation.button_keys)
    )
  )
  for (const key of candidates) {
    if (
      selected.has(key) ||
      base.resource_catalog.buttons[key] ||
      online.resource_catalog.buttons[key]
    )
      continue
    const preset = (definition.buttons as Record<string, unknown>)[key]
    if (!same(draft.resource_catalog.buttons[key], preset)) continue
    delete draft.resource_catalog.buttons[key]
    for (const [locale, messages] of Object.entries(draft.messages)) {
      const names = featureNames(messages)
      const labels =
        model.feature_names[locale as keyof typeof model.feature_names] ??
        model.feature_names['en-US']
      if (
        names &&
        names[key] === (labels as Record<string, string>)[key] &&
        !Object.hasOwn(featureNames(base.messages[locale]) ?? {}, key) &&
        !Object.hasOwn(featureNames(online.messages[locale]) ?? {}, key)
      )
        delete names[key]
    }
  }
  return changed ? draft : source
}

function canonical(_key: string, value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value
}

function featureNames(
  messages: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const frontend = messages?.frontend
  if (!frontend || typeof frontend !== 'object' || Array.isArray(frontend)) return
  const features = (frontend as Record<string, unknown>).features
  return features && typeof features === 'object' && !Array.isArray(features)
    ? (features as Record<string, unknown>)
    : undefined
}
