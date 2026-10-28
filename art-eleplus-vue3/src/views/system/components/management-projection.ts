import type { ResourceKind } from '@/api/system-service'

export const actionListFields = ['id', 'name', 'word', 'config']

interface ProjectionOptions {
  resource: ResourceKind
  view: 'cards' | 'matrix' | 'table'
  columns: { key: string; format?: string }[]
  visible: string[]
  canAssignPermissions: boolean
  canDelete: boolean
  canDeleteSelected: boolean
}

/** List payloads follow the active view; details always hydrate independently. */
export function managementListFields(options: ProjectionOptions) {
  const { resource, view } = options
  const base: Record<ResourceKind, string[]> = {
    user: ['id', 'username', 'code', 'status', 'metadata'],
    action: actionListFields,
    role: ['id', 'name', 'word'],
    'user-group': ['id', 'name', 'word'],
    dictionary: ['id', 'name', 'key'],
    whitelist: ['id', 'category']
  }
  const cards: Partial<Record<ResourceKind, string[]>> = {
    role: ['action_summaries', 'created_at', 'updated_at'],
    'user-group': [
      'action_summaries',
      'member_count',
      'member_preview',
      'created_at',
      'updated_at'
    ],
    dictionary: ['enabled', 'description', 'value', 'created_at', 'updated_at'],
    whitelist: ['resource', 'created_at', 'updated_at']
  }
  const columns =
    resource === 'action' && view === 'matrix'
      ? []
      : view === 'cards'
        ? (cards[resource] ?? [])
        : options.columns
            .filter((column) => options.visible.includes(column.key))
            .flatMap((column) =>
              column.format === 'role'
                ? ['role_summary']
                : column.format === 'users'
                  ? ['member_count', 'member_preview']
                  : [column.key]
            )
  const deletionFields =
    !options.canAssignPermissions &&
    ['role', 'user-group'].includes(resource) &&
    (options.canDelete || options.canDeleteSelected)
      ? ['action_codes', ...(resource === 'user-group' ? ['member_count'] : [])]
      : []
  return [...new Set([...base[resource], ...columns, ...deletionFields])].join(',')
}
