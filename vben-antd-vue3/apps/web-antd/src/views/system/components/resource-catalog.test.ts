import { describe, expect, it } from 'vitest';
import type { ResourceCatalog } from '#/api/system';
import {
  permissionOperations,
  resourceBreadcrumb,
  resourceTree,
  resolveResourceConfig,
} from './resource-catalog';

export const catalogFixture: ResourceCatalog = {
  
  resources: {
    'admin:system': { kind: 'directory', sort: 10 },
    'admin:system:user': {
      kind: 'resource',
      parent: 'admin:system',
      sort: 20,
      entries: {
        'admin:menu:system:user': { path: '/system/user' },
      },
      operations: {
        read: {
          entry_keys: ['admin:menu:system:user'],
          button_keys: ['admin:system:user:query', 'admin:system:user:detail'],
        },
        update: { entry_keys: [], button_keys: ['admin:system:user:edit'] },
      },
    },
    'admin:system:role': {
      kind: 'resource',
      parent: 'admin:system',
      sort: 10,
      operations: { read: { entry_keys: [], button_keys: [] } },
    },
    'mini:work': { kind: 'directory', sort: 10 },
    'mini:work:order': {
      kind: 'resource',
      parent: 'mini:work',
      sort: 10,
      entries: {
        'mini:menu:work:order': { path: '/pages/orders/index' },
      },
      operations: {
        read: { entry_keys: ['mini:menu:work:order'], button_keys: [] },
      },
    },
  },
  buttons: {
    'admin:system:user:query': {
      btn: ['admin:btn:system:user:query'],
      http: [{ method: 'GET', path: '/user' }],
      grpc: [],
    },
    'admin:system:user:detail': {
      btn: ['admin:btn:system:user:view-detail'],
      http: [{ method: 'GET', path: '/user/{id}' }],
      grpc: ['/auth.v1.User/GetUser'],
    },
    'admin:system:user:edit': {
      btn: ['admin:btn:system:user:edit'],
      http: [{ method: 'PATCH', path: '/user/{id}' }],
      grpc: [],
    },
  },
};

describe('resource permission catalog', () => {
  it('uses fixed operations and independently sorted scope trees', () => {
    expect(permissionOperations).toEqual([
      'read',
      'create',
      'update',
      'delete',
    ]);
    const tree = resourceTree(catalogFixture, 'admin', '', (key) => key);
    expect(tree.map((node) => node.key)).toEqual(['admin:system']);
    expect(tree[0]!.selectable).toBe(false);
    expect(tree[0]!.children.map((node) => node.key)).toEqual([
      'admin:system:role',
      'admin:system:user',
    ]);
    expect(resourceTree(catalogFixture, 'h5', '', (key) => key)).toEqual([]);
    expect(resourceTree(catalogFixture, 'mini', '', (key) => key)[0]!.key).toBe(
      'mini:work',
    );
  });
  it('searches names and identifiers while retaining parents', () => {
    const labels: Record<string, string> = {
      'admin:system': '系统管理',
      'admin:system:user': '用户管理',
      'admin:system:role': '角色管理',
    };
    const label = (key: string) => labels[key] || key;
    expect(
      resourceTree(catalogFixture, 'admin', '用户', label)[0]!.children.map(
        (node) => node.key,
      ),
    ).toEqual(['admin:system:user']);
    expect(resourceBreadcrumb(catalogFixture, 'admin:system:user', label)).toBe(
      '系统管理 / 用户管理',
    );
  });
  it('grants only endpoints associated with selected features and preserves explicit empty selection', () => {
    const config = resolveResourceConfig(
      catalogFixture,
      'admin:system:user',
      'read',
      ['admin:system:user:query'],
    );
    expect(config.ui[0]!.page_entry).toBe(true);
    expect(config.endpoints).toEqual([
      { protocol: 'http', method: 'GET', path: '/user' },
    ]);
    expect(resolveResourceConfig(
      catalogFixture,
      'admin:system:user',
      'read',
      ['admin:system:user:detail'],
    ).endpoints).toContainEqual({
      protocol: 'grpc', method: 'GRPC', path: '/auth.v1.User/GetUser',
    });
    const empty = resolveResourceConfig(
      catalogFixture,
      'admin:system:user',
      'read',
      [],
    );
    expect(empty.feature_keys).toEqual([]);
    expect(empty.endpoints).toEqual([]);
    expect(empty.ui[0]!.button_keys).toEqual([]);
    expect(
      resolveResourceConfig(catalogFixture, 'admin:system:user', 'update', [
        'admin:system:user:edit',
      ]).ui[0]!.page_entry,
    ).toBe(false);
  });
  it('rejects other operations, resources, scopes and repeated features', () => {
    for (const keys of [
      ['admin:system:user:edit'],
      ['mini:work:order:query'],
      ['admin:system:user:query', 'admin:system:user:query'],
    ]) {
      expect(() =>
        resolveResourceConfig(
          catalogFixture,
          'admin:system:user',
          'read',
          keys,
        ),
      ).toThrow();
    }
    expect(() =>
      resolveResourceConfig(catalogFixture, 'admin:system:user', 'export', []),
    ).toThrow();
  });
});
