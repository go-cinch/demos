import type { ResourceKind } from './types';

export const identityColumn: Record<ResourceKind, string> = {
  user: 'username',
  role: 'name',
  'user-group': 'name',
  action: 'name',
  dictionary: 'name',
  whitelist: 'id',
};
export const defaultColumns: Record<ResourceKind, string[]> = {
  user: ['username', 'role', 'status', 'created_at'],
  role: ['name', 'word', 'action_codes'],
  'user-group': ['name', 'word', 'users', 'action_codes'],
  action: ['name', 'word', 'group'],
  dictionary: ['name', 'key', 'enabled'],
  whitelist: ['id', 'category', 'resource'],
};
