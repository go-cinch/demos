import type { ResourceNode } from '@/api/permission-catalog'
import type { Catalog, EditorBuffer, ResourceEditor } from './catalog-model'
import { assign, clone, normalizeCatalog, setText, text, validate } from './catalog-model'
import { referencedOperations } from '../components/resource-references'
import { resourceChildren, storeResourceOrder } from '../components/resource-order'

export function createResourceEditor(
  catalog: Catalog,
  scope: string,
  key = '',
  parent = ''
): ResourceEditor {
  const node = catalog.resource_catalog.resources[key]
  const siblings = resourceChildren(catalog.resource_catalog, node?.parent ?? parent, scope)
  const prefix = parent ? `${parent}:` : `${scope}:`
  const result: ResourceEditor = {
    permissionScope: node?.permission_scope ?? '',
    original: key,
    key: key || prefix,
    parent: node?.parent ?? parent,
    nodeKind: node?.kind ?? 'directory',
    sort: node?.sort ?? 0,
    position: node
      ? siblings.findIndex((item) => item.kind === 'node' && item.key === key) + 1
      : siblings.length + 1,
    frontendVisible: node?.frontend_visible ?? true,
    references: clone(node?.references ?? []),
    referenceOperations: Object.fromEntries(
      (node?.references ?? []).map((target) => [
        target,
        clone(referencedOperations(catalog.resource_catalog, key, target))
      ])
    ),
    zh: text(catalog, 'zh-CN', 'resources', key),
    en: text(catalog, 'en-US', 'resources', key),
    operations: node ? Object.keys(node.operations ?? {}) : [],
    entries: [],
    features: []
  }
  for (const [id, entry] of Object.entries(node?.entries ?? {})) {
    result.entries.push({
      key: id,
      path: entry.path,
      parentMenu: entry.parent_menu_key ?? '',
      operations: Object.entries(node?.operations ?? {})
        .filter(([, op]) => op.entry_keys.includes(id))
        .map(([op]) => op)
    })
  }
  for (const [operation, binding] of Object.entries(node?.operations ?? {})) {
    for (const id of binding.button_keys) {
      const feature = catalog.resource_catalog.buttons[id]
      if (!feature) continue
      result.features.push({
        key: id,
        zh: text(catalog, 'zh-CN', 'features', id),
        en: text(catalog, 'en-US', 'features', id),
        operation,
        permissionResource: feature.permission_resource ?? '',
        entryKeys: clone(feature.entry_keys ?? []),
        buttons: clone(feature.btn),
        http: clone(feature.http),
        grpc: clone(feature.grpc)
      })
    }
  }
  return result
}

export function restoreResourceBuffer(
  catalog: Catalog,
  scope: string,
  resource: string,
  buffer: EditorBuffer
): ResourceEditor {
  const draft = createResourceEditor(
    catalog,
    scope,
    buffer.kind === 'resource' ? buffer.original : resource,
    buffer.parent
  )
  if (buffer.kind === 'resource') {
    Object.assign(draft, {
      key: buffer.key,
      parent: buffer.parent,
      nodeKind: buffer.nodeKind,
      sort: buffer.sort,
      zh: buffer.zh,
      en: buffer.en
    })
  } else if (buffer.kind === 'entry') {
    const entry = {
      key: buffer.key,
      path: buffer.path,
      parentMenu: buffer.parentMenu,
      operations: draft.entries.find((entry) => entry.key === buffer.original)?.operations ?? [
        'read'
      ]
    }
    const index = draft.entries.findIndex((entry) => entry.key === buffer.original)
    if (index < 0) draft.entries.push(entry)
    else draft.entries[index] = entry
  } else if (buffer.kind === 'feature') {
    const feature = {
      key: buffer.key,
      zh: buffer.zh,
      en: buffer.en,
      operation: buffer.operation,
      buttons: clone(buffer.buttons),
      http: clone(buffer.http),
      grpc: clone(buffer.grpc)
    }
    const index = draft.features.findIndex((item) => item.key === buffer.original)
    if (index < 0) draft.features.push(feature)
    else draft.features[index] = feature
  }
  return draft
}

export class ResourceEditorError extends Error {
  constructor(
    readonly code: string,
    readonly path = ''
  ) {
    super(code)
  }
}

export function resourceTypeChangeIssue(
  catalog: Catalog,
  draft: ResourceEditor,
  target: ResourceNode['kind']
) {
  const original = catalog.resource_catalog.resources[draft.original]
  if (!draft.parent || (original && !original.parent)) return 'rootTypeFixed'
  if (
    target === 'directory' &&
    (draft.entries.length || draft.operations.length || draft.features.length)
  )
    return 'resourceTypeHasConfiguration'
  if (
    target === 'resource' &&
    Object.values(catalog.resource_catalog.resources).some(
      (node) => node.parent === (draft.original || draft.key)
    )
  )
    return 'directoryTypeHasChildren'
  if (target === 'resource' && draft.references.length) return 'directoryTypeHasReferences'
  return ''
}

function identifierProblem(key: string, scope: string, kind: ResourceNode['kind']) {
  if (!key.trim() || key.endsWith(':')) return 'nodeIdentifierIncomplete'
  if (!key.startsWith(`${scope}:`)) return 'nodeIdentifierScope'
  const parts = key.split(':')
  if (parts.some((part) => !/^[a-z][a-z0-9_-]*$/.test(part))) return 'nodeIdentifierCharacters'
  if (kind === 'resource' && parts.length < 3) return 'resourceIdentifierFormat'
  if (kind === 'directory' && parts.length < 2) return 'directoryIdentifierFormat'
  return ''
}

export function applyResourceEditor(
  catalog: Catalog,
  scope: string,
  draft: ResourceEditor,
  reservedKeys: Record<string, string> = {}
): Catalog {
  const fail = (code: string, path = ''): never => {
    throw new ResourceEditorError(code, path)
  }
  const original = catalog.resource_catalog.resources[draft.original]
  if (original && original.kind !== draft.nodeKind) {
    const issue = resourceTypeChangeIssue(catalog, draft, draft.nodeKind)
    if (issue) fail(issue)
  }
  const identifierError = identifierProblem(draft.key, scope, draft.nodeKind)
  if (identifierError) fail(identifierError)
  if (!draft.zh.trim() || !draft.en.trim()) fail('required')
  if (!draft.key.startsWith(`${scope}:`) || (draft.original && draft.original !== draft.key))
    fail('invalid', draft.key)
  if (!draft.original && (catalog.resource_catalog.resources[draft.key] || reservedKeys[draft.key]))
    fail('duplicate', draft.key)
  if (!draft.parent && !draft.original && draft.nodeKind !== 'directory') fail('invalidParent')
  if (
    draft.parent &&
    draft.original &&
    draft.parent !== (catalog.resource_catalog.resources[draft.original]?.parent ?? '')
  )
    fail('useTreeToMove')
  const next = clone(catalog)
  const node: ResourceNode = {
    kind: draft.nodeKind,
    sort: draft.sort,
    ...(draft.nodeKind === 'resource' && draft.permissionScope === '*'
      ? { permission_scope: '*' as const }
      : {}),
    ...(original?.permission_group && draft.nodeKind === 'directory' && !draft.parent
      ? { permission_group: original.permission_group }
      : {}),
    ...(draft.nodeKind === 'directory' && !draft.parent
      ? { frontend_visible: draft.frontendVisible ?? true }
      : {}),
    ...(draft.nodeKind === 'directory' && original?.child_order
      ? {
          child_order: clone(original.child_order).filter(
            (item) => item.kind === 'node' || draft.references.includes(item.key)
          )
        }
      : {}),
    ...(draft.parent ? { parent: draft.parent } : {}),
    ...(draft.nodeKind === 'directory'
      ? {
          references: clone(draft.references),
          reference_operations: Object.fromEntries(
            draft.references.map((target) => [
              target,
              clone(
                draft.referenceOperations?.[target] ??
                  referencedOperations(catalog.resource_catalog, draft.original, target)
              )
            ])
          )
        }
      : {})
  }
  const entries = draft.nodeKind === 'resource' ? draft.entries : []
  const features =
    draft.nodeKind === 'resource'
      ? draft.features.filter((feature) => draft.operations.includes(feature.operation))
      : []
  const unique = (keys: string[]) => new Set(keys).size === keys.length
  if (!unique(entries.map((entry) => entry.key)) || !unique(features.map((feature) => feature.key)))
    fail('duplicate')
  for (const entry of entries)
    if (!entry.key.trim() || !entry.path.trim()) fail('required', entry.key)
  for (const feature of features)
    if (!feature.key.trim() || !feature.zh.trim() || !feature.en.trim())
      fail('required', feature.key)
  const previousFeatures = Object.values(original?.operations ?? {}).flatMap((op) => op.button_keys)
  for (const key of previousFeatures) delete next.resource_catalog.buttons[key]
  if (draft.nodeKind === 'resource') {
    node.entries = Object.fromEntries(
      entries.map((entry) => [
        entry.key,
        {
          path: entry.path,
          ...(entry.parentMenu ? { parent_menu_key: entry.parentMenu } : {})
        }
      ])
    )
    node.operations = Object.fromEntries(
      draft.operations.map((operation) => [
        operation,
        {
          entry_keys: entries
            .filter((entry) => entry.operations.includes(operation))
            .map((entry) => entry.key),
          button_keys: features
            .filter((feature) => feature.operation === operation)
            .map((feature) => feature.key)
        }
      ])
    )
    for (const feature of features) {
      if (next.resource_catalog.buttons[feature.key]) fail('duplicate', feature.key)
      next.resource_catalog.buttons[feature.key] = {
        ...(feature.permissionResource ? { permission_resource: feature.permissionResource } : {}),
        entry_keys: clone(feature.entryKeys ?? []),
        btn: clone(feature.buttons),
        http: clone(feature.http),
        grpc: clone(feature.grpc)
      }
    }
  }
  if (node.entries && !Object.keys(node.entries).length) delete node.entries
  if (node.operations && !Object.keys(node.operations).length) delete node.operations
  next.resource_catalog.resources[draft.key] = node
  if (draft.position !== undefined) {
    const position = draft.position
    const previousOrder = resourceChildren(catalog.resource_catalog, draft.parent, scope)
    const previousIndex = previousOrder.findIndex(
      (item) => item.kind === 'node' && item.key === draft.key
    )
    const order = previousOrder.filter((item) => !(item.kind === 'node' && item.key === draft.key))
    if (
      position === null ||
      !Number.isInteger(position) ||
      position < 1 ||
      position > order.length + 1
    )
      return fail('invalidPosition')
    if (position !== previousIndex + 1) {
      order.splice(position - 1, 0, { kind: 'node', key: draft.key })
      storeResourceOrder(next.resource_catalog, draft.parent, order)
    }
  }
  const removeLabels = (group: string, keys: string[]) => {
    for (const locale of Object.keys(next.messages))
      for (const key of keys) assign(next.messages, [locale, 'frontend', group, key], undefined)
  }
  removeLabels(
    'menus',
    Object.keys(original?.entries ?? {}).filter(
      (key) => !entries.some((entry) => entry.key === key)
    )
  )
  removeLabels(
    'features',
    previousFeatures.filter((key) => !features.some((feature) => feature.key === key))
  )
  for (const [group, items] of [
    ['resources', [draft]],
    ['features', features]
  ] as const) {
    for (const item of items) {
      setText(next, 'zh-CN', group, item.key, item.zh)
      setText(next, 'en-US', group, item.key, item.en)
    }
  }
  const normalized = normalizeCatalog(next)
  const problem = validate(normalized).find((problem) => !problem.warning)
  if (problem) fail(problem.code, problem.path.join(' / '))
  return normalized
}
