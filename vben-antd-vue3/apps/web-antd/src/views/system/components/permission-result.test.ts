import { describe, expect, it } from 'vitest';

import { permissionResult } from './permission-result';

describe('business permission results', () => {
  it('uses only explicit bindings and deduplicates operations and features', () => {
    expect(permissionResult({ bindings: [
      { resource_key: 'admin:system:user', operation: 'read', feature_keys: ['query', 'detail'] },
      { resource_key: 'admin:system:role', operation: 'read', feature_keys: ['query'] },
      { resource_key: 'admin:system:user', operation: 'update', feature_keys: [] },
    ], ui: [], endpoints: [{ protocol: 'http', method: 'DELETE', path: '/unrelated' }] })).toMatchObject({
      resources: ['admin:system:user', 'admin:system:role'], operations: ['read', 'update'], features: ['query', 'detail'], all: false,
    });
  });
  it('does not expand explicit empty features, invent menus from paths, or classify scoped capabilities as all access', () => {
    const result = permissionResult({ permission_scopes: ['admin:system:user:update'], bindings: [{ resource_key: 'admin:system:user', operation: 'update', feature_keys: [] }], ui: [], endpoints: [] });
    expect(result).toMatchObject({ all: false, operations: ['update'], features: [] });
    expect(permissionResult()).toMatchObject({ available: false, resources: [], features: [] });
  });
  it('uses UI mappings for related menus without claiming they grant page entry', () => {
    const result = permissionResult({ bindings: [{ resource_key: 'admin:system:user', operation: 'update', feature_keys: [] }],
      ui: [{ menu_key: 'admin:menu:system:user', menu_path: '/system/user', page_entry: false }], endpoints: [] });
    expect(result.menus).toEqual(['admin:menu:system:user']);
    expect(permissionResult({ bindings: [{ resource_key: 'admin:default:session', operation: 'read', feature_keys: [] }], ui: [], endpoints: [] }).menus).toEqual([]);
    expect(permissionResult({ bindings: [{ resource_key: 'admin:system:user', operation: 'read', feature_keys: null }], ui: [], endpoints: [] }).featuresKnown).toBe(false);
  });
  it('shows default selections and wildcard definitions explicitly', () => {
    expect(permissionResult({ builtin: 'default', resource_keys: ['admin:default:profile'], feature_keys: [], ui: [], endpoints: [] })).toMatchObject({ resources: ['admin:default:profile'], operations: ['read'], features: [] });
    expect(permissionResult({ builtin: 'all', permission_scope: '*', ui: [], endpoints: [] }).all).toBe(true);
  });
});
