import type { ResourceCatalog } from '#/api/system';

import { describe, expect, it } from 'vitest';

import { resourceChildren, storeResourceOrder } from './resource-order';

function catalog(): ResourceCatalog {
  return {
    resources: {
      'admin:root': {
        kind: 'directory',
        sort: 1,
        references: ['admin:other:item', 'gone'],
        reference_operations: {
          'admin:other:item': ['read'],
          gone: ['update'],
        },
        child_order: [
          { kind: 'reference', key: 'admin:other:item' },
          { kind: 'node', key: 'admin:root:b' },
          { kind: 'node', key: 'gone' },
          { kind: 'node', key: 'admin:root:b' },
        ],
      },
      'admin:root:a': { kind: 'resource', parent: 'admin:root', sort: 10 },
      'admin:root:b': { kind: 'resource', parent: 'admin:root', sort: 10 },
      'admin:other:item': { kind: 'resource', parent: 'admin:other', sort: 99 },
      'mini:root': { kind: 'directory', sort: 0 },
    },
    buttons: {},
  };
}

describe('resource child ordering', () => {
  it('preserves reference positions, drops stale/duplicate order entries and appends missing nodes', () => {
    expect(resourceChildren(catalog(), 'admin:root', 'admin')).toEqual([
      { kind: 'reference', key: 'admin:other:item' },
      { kind: 'node', key: 'admin:root:b' },
      { kind: 'node', key: 'admin:root:a' },
    ]);
    expect(resourceChildren(catalog(), '', 'mini')).toEqual([
      { kind: 'node', key: 'mini:root' },
    ]);
  });

  it('renumbers owned nodes without changing the referenced target sort', () => {
    const value = catalog();
    const order = [
      { kind: 'node' as const, key: 'admin:root:b' },
      { kind: 'reference' as const, key: 'admin:other:item' },
      { kind: 'node' as const, key: 'admin:root:a' },
    ];
    storeResourceOrder(value, 'admin:root', order);
    expect(value.resources['admin:root']?.references).toEqual([
      'admin:other:item',
    ]);
    expect(value.resources['admin:root']?.reference_operations).toEqual({
      'admin:other:item': ['read'],
    });
    expect(value.resources['admin:root:b']?.sort).toBe(10);
    expect(value.resources['admin:root:a']?.sort).toBe(20);
    expect(value.resources['admin:other:item']?.sort).toBe(99);
  });

  it('can reorder references without renumbering nodes and removes obsolete operation filters', () => {
    const value = catalog();
    storeResourceOrder(
      value,
      'admin:root',
      [{ kind: 'node', key: 'admin:root:b' }],
      false,
    );
    expect(value.resources['admin:root']?.references).toEqual([]);
    expect(value.resources['admin:root']?.reference_operations).toEqual({});
    expect(value.resources['admin:root:a']?.sort).toBe(10);
  });
});
