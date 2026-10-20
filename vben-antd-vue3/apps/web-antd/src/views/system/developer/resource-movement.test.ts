import { describe, expect, it } from 'vitest';

import { resourceChildren } from '../components/resource-order';
import { fixture } from './__fixtures__/catalog';
import {
  canMoveResource,
  moveReference,
  moveResource,
  resourceStep,
} from './resource-movement';

function catalog() {
  const value = fixture();
  value.scopes.push('mini');
  Object.assign(value.resource_catalog.resources, {
    'admin:audit': {
      kind: 'directory',
      sort: 10,
      references: ['admin:system:user'],
      reference_operations: { 'admin:system:user': ['read'] },
    },
    'admin:system:role': { kind: 'resource', parent: 'admin:system', sort: 3 },
    'mini:work': { kind: 'directory', sort: 1 },
  });
  value.messages['en-US']!.frontend = {
    resources: { 'admin:system:user': 'Users' },
    features: { 'admin:system:user:query': 'Query' },
  };
  return value;
}

describe('resource tree movement', () => {
  it('rejects cross-scope moves, resource roots, missing parents and cycles', () => {
    const value = catalog();
    for (const parent of ['', 'mini:work', 'missing', 'admin:system:role'])
      expect(canMoveResource(value, 'admin:system:user', parent)).toBe(false);
    expect(canMoveResource(value, 'admin:system', 'admin:system')).toBe(false);
    // A directory cannot move beneath a target it already references.
    value.resource_catalog.resources['admin:audit']!.references = [
      'admin:system',
    ];
    expect(canMoveResource(value, 'admin:audit', 'admin:system')).toBe(false);
    expect(() =>
      moveResource(value, 'admin:system:user', { parent: 'mini:work' }),
    ).toThrow('invalidMove');
  });

  it('moves a node beside its own reference, migrating keys and labels while preserving endpoint contracts', () => {
    const value = catalog();
    const before = structuredClone(value);
    const result = moveResource(value, 'admin:system:user', {
      parent: 'admin:audit',
      before: { kind: 'reference', key: 'admin:system:user' },
    });
    expect(result.key).toBe('admin:audit:user');
    expect(result.resourceKeys).toEqual({
      'admin:system:user': 'admin:audit:user',
    });
    expect(result.featureKeys).toEqual({
      'admin:system:user:query': 'admin:audit:user:query',
    });
    expect(
      result.document.resource_catalog.resources['admin:audit']?.references,
    ).toEqual([]);
    expect(
      result.document.resource_catalog.resources['admin:audit']
        ?.reference_operations,
    ).toEqual({});
    expect(
      result.document.resource_catalog.resources[result.key]?.entries,
    ).toEqual(value.resource_catalog.resources['admin:system:user']?.entries);
    expect(
      result.document.resource_catalog.buttons['admin:audit:user:query'],
    ).toEqual(value.resource_catalog.buttons['admin:system:user:query']);
    expect(result.document.messages['en-US']?.frontend).toEqual({
      resources: { 'admin:audit:user': 'Users' },
      features: { 'admin:audit:user:query': 'Query' },
    });
    expect(value).toEqual(before);
  });

  it('numbers key collisions and respects names reserved by unpublished migrations', () => {
    const value = catalog();
    value.resource_catalog.resources['admin:audit:user'] = {
      kind: 'resource',
      parent: 'admin:audit',
      sort: 1,
    };
    const result = moveResource(
      value,
      'admin:system:user',
      { parent: 'admin:audit' },
      { 'admin:audit:user-2': 'admin:elsewhere:user' },
    );
    expect(result.key).toBe('admin:audit:user-3');
    expect(result.changes).toContainEqual({
      before: 'admin:system:user',
      after: 'admin:audit:user-3',
      numbered: true,
    });
    expect(
      result.document.resource_catalog.resources['admin:audit:user'],
    ).toEqual(value.resource_catalog.resources['admin:audit:user']);
  });

  it('returns the same document for a no-op order and computes adjacent moves', () => {
    const value = catalog();
    const destination = {
      parent: 'admin:system',
      before: { kind: 'node' as const, key: 'admin:system:role' },
    };
    const result = moveResource(value, 'admin:system:user', destination);
    expect(result.moved).toBe(false);
    expect(result.document).toBe(value);
    expect(resourceStep(value, 'admin:system:role', -1)).toEqual({
      parent: 'admin:system',
      before: { kind: 'node', key: 'admin:system:user' },
    });
    expect(resourceStep(value, 'missing', 1)).toBeNull();
  });

  it('reorders a reference locally without moving or renumbering its target', () => {
    const value = catalog();
    value.resource_catalog.resources['admin:audit:log'] = {
      kind: 'resource',
      parent: 'admin:audit',
      sort: 50,
    };
    const next = moveReference(value, 'admin:audit', 'admin:system:user', {
      parent: 'admin:audit',
      before: { kind: 'node', key: 'admin:audit:log' },
    });
    expect(
      resourceChildren(next.resource_catalog, 'admin:audit', 'admin'),
    ).toEqual([
      { kind: 'reference', key: 'admin:system:user' },
      { kind: 'node', key: 'admin:audit:log' },
    ]);
    expect(next.resource_catalog.resources['admin:system:user']).toEqual(
      value.resource_catalog.resources['admin:system:user'],
    );
    expect(next.resource_catalog.resources['admin:audit:log']?.sort).toBe(50);
    expect(() =>
      moveReference(value, 'admin:audit', 'admin:system:user', {
        parent: 'admin:system',
      }),
    ).toThrow('invalidMove');
  });
});
