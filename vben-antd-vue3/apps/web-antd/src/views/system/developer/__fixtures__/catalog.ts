import type { Catalog } from '../catalog-model';

export function fixture(): Catalog {
  return {
    schema_version: 2,
    default_locale: 'en-US',
    scopes: ['admin'],
    operations: ['read', 'create', 'update', 'delete'],
    locales: [
      { tag: 'en-US', name: 'English', enabled: true },
      { tag: 'zh-CN', name: '简体中文', enabled: true },
    ],
    messages: {
      'en-US': { frontend: { label: 'User' } },
      'zh-CN': { frontend: { label: '用户' } },
    },
    resource_catalog: {
      resources: {
        'admin:system': { kind: 'directory', sort: 1 },
        'admin:system:user': {
          kind: 'resource',
          sort: 2,
          parent: 'admin:system',
          entries: {
            'admin:menu:system:user': { path: '/system/user' },
          },
          operations: {
            read: {
              entry_keys: ['admin:menu:system:user'],
              button_keys: ['admin:system:user:query'],
            },
          },
        },
      },
      buttons: {
        'admin:system:user:query': {
          btn: ['admin:btn:system:user:query'],
          http: [{ method: 'GET', path: '/user' }],
          grpc: [],
        },
      },
    },
  };
}
