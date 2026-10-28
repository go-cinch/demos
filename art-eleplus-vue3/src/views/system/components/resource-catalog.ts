import type {
  ActionConfig,
  ActionResourceBinding,
  ResourceCatalog,
  ResourceNode
} from '@/api/permission-catalog'

export const permissionOperations = ['read', 'create', 'update', 'delete'] as const

// Menu identifiers are stable contracts; their names belong to canonical nodes.
export function menuResourceKeys(catalog: ResourceCatalog) {
  const owners = new Map<string, string>()
  for (const key of Object.keys(catalog.resources)) owners.set(key.replace(':', ':menu:'), key)
  for (const [key, node] of Object.entries(catalog.resources))
    for (const menu of Object.keys(node.entries ?? {})) owners.set(menu, key)
  return owners
}

export function resourceTree(
  catalog: ResourceCatalog,
  scope: string,
  query: string,
  label: (key: string) => string
) {
  const search = query.trim().toLocaleLowerCase()
  const matches = new Set<string>()
  for (const [key] of Object.entries(catalog.resources)) {
    if (!key.startsWith(`${scope}:`)) continue
    const ancestors: string[] = []
    let current: string | undefined = key
    while (current && !ancestors.includes(current)) {
      ancestors.push(current)
      current = catalog.resources[current]?.parent
    }
    if (
      !search ||
      ancestors
        .map((id) => `${id} ${label(id)}`)
        .join(' ')
        .toLocaleLowerCase()
        .includes(search)
    ) {
      ancestors.forEach((id) => matches.add(id))
    }
  }
  type TreeNode = {
    key: string
    title: string
    selectable: boolean
    children: TreeNode[]
  }
  const build = (parent?: string): TreeNode[] =>
    Object.entries(catalog.resources)
      .filter(([key, node]) => matches.has(key) && (node.parent || undefined) === parent)
      .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b))
      .map(([key, node]) => ({
        key,
        title: label(key),
        selectable: node.kind === 'resource',
        children: build(key)
      }))
  return build()
}

export function resourceBreadcrumb(
  catalog: ResourceCatalog,
  key: string,
  label: (key: string) => string
) {
  const result: string[] = []
  const seen = new Set<string>()
  let current: string | undefined = key
  while (current && !seen.has(current)) {
    seen.add(current)
    result.unshift(label(current))
    current = catalog.resources[current]?.parent
  }
  return result.join(' / ')
}

export function resolveResourceConfig(
  catalog: ResourceCatalog,
  key: string,
  operation: string,
  selected: string[]
): ActionConfig {
  const node: ResourceNode | undefined = catalog.resources[key]
  if (node?.permission_scope === '*' && operation === '*') {
    if (selected.length) throw new Error('Wildcard scope does not select features')
    return {
      resource_key: key,
      operation,
      permission_scope: '*',
      feature_keys: [],
      ui: [],
      endpoints: []
    }
  }
  const binding = node?.operations?.[operation]
  if (
    !node ||
    !binding ||
    !permissionOperations.includes(operation as (typeof permissionOperations)[number])
  )
    throw new Error('Invalid resource operation')
  if (
    new Set(selected).size !== selected.length ||
    selected.some((id) => !binding.button_keys.includes(id) || !catalog.buttons[id])
  )
    throw new Error('Invalid feature selection')
  const features = selected.map((id) => catalog.buttons[id]!)
  const btn = [...new Set(features.flatMap((feature) => feature.btn))]
  const pageEntries = new Set([
    ...binding.entry_keys,
    ...features.flatMap((feature) => feature.entry_keys ?? [])
  ])
  const entries = new Map(Object.entries(node.entries ?? {}))
  for (const owner of Object.values(catalog.resources))
    for (const [key, entry] of Object.entries(owner.entries ?? {}))
      if (
        pageEntries.has(key) ||
        btn.some((button) => button.startsWith(`${key.replace(':menu:', ':btn:')}:`))
      )
        entries.set(key, entry)
  const endpoints = features.flatMap((feature) => [
    ...feature.http.map((endpoint) => ({
      protocol: 'http' as const,
      ...endpoint
    })),
    ...feature.grpc.map((path) => ({ protocol: 'grpc' as const, method: 'GRPC', path }))
  ])
  return {
    ...(features.some((feature) => feature.permission_resource)
      ? {
          permission_scopes: [
            ...new Set(
              features
                .filter((feature) => feature.permission_resource)
                .map((feature) => `${feature.permission_resource}:${operation}`)
            )
          ]
        }
      : {}),
    resource_key: key,
    operation,
    feature_keys: [...selected],
    ui: [...entries]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([menu_key, entry]) => ({
        menu_key,
        menu_path: entry.path,
        parent_menu_key: entry.parent_menu_key,
        page_entry: pageEntries.has(menu_key),
        button_keys: btn.filter((key) => key.startsWith(`${menu_key.replace(':menu:', ':btn:')}:`))
      })),
    endpoints: [
      ...new Map(
        endpoints.map((endpoint) => [
          `${endpoint.protocol}:${'method' in endpoint ? endpoint.method : ''}:${endpoint.path}`,
          endpoint
        ])
      ).values()
    ]
  }
}

export function resolveResourceSelectionConfig(
  catalog: ResourceCatalog,
  scope: string,
  keys: string[],
  selected: string[]
): ActionConfig {
  const allowed = new Set(
    keys.flatMap((key) => catalog.resources[key]?.operations?.read?.button_keys ?? [])
  )
  if (
    new Set(keys).size !== keys.length ||
    new Set(selected).size !== selected.length ||
    selected.some((key) => !allowed.has(key))
  )
    throw new Error('Invalid default permission selection')
  const grants = keys.map((key) => {
    const node = catalog.resources[key]
    if (!key.startsWith(`${scope}:`) || node?.kind !== 'resource' || !node.operations?.read)
      throw new Error('Invalid default resource')
    return resolveResourceConfig(
      catalog,
      key,
      'read',
      selected.filter((feature) => node.operations!.read!.button_keys.includes(feature))
    )
  })
  const ui = new Map<string, ActionConfig['ui'][number]>()
  for (const entry of grants.flatMap((grant) => grant.ui)) {
    const previous = ui.get(entry.menu_key)
    ui.set(
      entry.menu_key,
      previous
        ? {
            ...previous,
            page_entry: previous.page_entry || entry.page_entry,
            button_keys: [
              ...new Set([...(previous.button_keys ?? []), ...(entry.button_keys ?? [])])
            ]
          }
        : entry
    )
  }
  return {
    builtin: 'default',
    ...(grants.some((grant) => grant.permission_scopes?.length)
      ? {
          permission_scopes: [...new Set(grants.flatMap((grant) => grant.permission_scopes ?? []))]
        }
      : {}),
    resource_keys: [...keys],
    feature_keys: [...selected],
    ui: [...ui.values()],
    endpoints: [
      ...new Map(
        grants
          .flatMap((grant) => grant.endpoints)
          .map((endpoint) => [
            `${endpoint.protocol}:${endpoint.method ?? ''}:${endpoint.path}`,
            endpoint
          ])
      ).values()
    ]
  }
}

export function actionResourceBindings(config?: ActionConfig): ActionResourceBinding[] {
  if (config?.bindings) return config.bindings
  return config?.resource_key && config.operation
    ? [
        {
          resource_key: config.resource_key,
          operation: config.operation,
          feature_keys: config.feature_keys
        }
      ]
    : []
}

export function resolveResourceBindings(
  catalog: ResourceCatalog,
  scope: string,
  bindings: ActionResourceBinding[]
): ActionConfig {
  const seen = new Set<string>()
  const grants = bindings.map((binding) => {
    const key = binding.resource_key
    const identity = `${key}:${binding.operation}`
    if (!key.startsWith(`${scope}:`) || seen.has(identity))
      throw new Error('Invalid resource selection')
    seen.add(identity)
    return resolveResourceConfig(
      catalog,
      key,
      binding.operation,
      binding.feature_keys ??
        catalog.resources[key]?.operations?.[binding.operation]?.button_keys ??
        []
    )
  })
  const ui = new Map<string, ActionConfig['ui'][number]>()
  for (const entry of grants.flatMap((grant) => grant.ui)) {
    const previous = ui.get(entry.menu_key)
    ui.set(
      entry.menu_key,
      previous
        ? {
            ...previous,
            page_entry: previous.page_entry || entry.page_entry,
            button_keys: [
              ...new Set([...(previous.button_keys ?? []), ...(entry.button_keys ?? [])])
            ]
          }
        : entry
    )
  }
  return {
    ...(grants.some((grant) => grant.permission_scope === '*')
      ? { permission_scope: '*' as const }
      : {}),
    ...(grants.some((grant) => grant.permission_scopes?.length)
      ? {
          permission_scopes: [...new Set(grants.flatMap((grant) => grant.permission_scopes ?? []))]
        }
      : {}),
    bindings: bindings.map((binding) => ({
      ...binding,
      feature_keys: binding.feature_keys == null ? binding.feature_keys : [...binding.feature_keys]
    })),
    ui: [...ui.values()],
    endpoints: [
      ...new Map(
        grants
          .flatMap((grant) => grant.endpoints)
          .map((endpoint) => [
            `${endpoint.protocol}:${endpoint.method ?? ''}:${endpoint.path}`,
            endpoint
          ])
      ).values()
    ]
  }
}
