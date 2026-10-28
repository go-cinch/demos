import type { ResourceKind } from './types';

export const actionListFields = ['id', 'name', 'word', 'config'];
const baseFields: Record<ResourceKind, string[]> = {
  user: ['id', 'username', 'code', 'status', 'metadata'],
  action: actionListFields,
  role: ['id', 'name', 'word'],
  'user-group': ['id', 'name', 'word'],
  dictionary: ['id', 'name', 'key'],
  whitelist: ['id', 'category', 'resource']
};
const cardFields: Partial<Record<ResourceKind, string[]>> = {
  role: ['action_summaries', 'created_at', 'updated_at'],
  'user-group': ['action_summaries', 'member_count', 'member_preview', 'created_at', 'updated_at'],
  dictionary: ['enabled', 'description', 'value', 'created_at', 'updated_at']
};
export function systemListFields(
  resource: ResourceKind,
  view: 'cards' | 'matrix' | 'table',
  visibleColumns: readonly string[],
  canDelete = false,
  canAssign = true
) {
  const columns = resource === 'action' && view === 'matrix' ? []
    : view === 'cards' ? cardFields[resource] ?? []
    : visibleColumns.flatMap((key) => key === 'role' ? ['role_summary']
      : key === 'users' ? ['member_count', 'member_preview']
      : [key]);
  const deletion = !canAssign && canDelete && ['role', 'user-group'].includes(resource)
    ? ['action_codes', ...(resource === 'user-group' ? ['member_count'] : [])] : [];
  return [...new Set([...baseFields[resource], ...columns, ...deletion])].join(',');
}
