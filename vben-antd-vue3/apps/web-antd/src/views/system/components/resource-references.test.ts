import { describe, expect, it } from 'vitest';
import type { ResourceCatalog } from '#/api/system';
import {
  canReferenceResource,
  referenceGraphIssues,
  resourceReferenceTree,
  supportsResourceReferences,
} from './resource-references';

describe('root directory references', () => {
  it('enables references on every root without checking its name, key or collection', () => {
    expect(supportsResourceReferences({ kind: 'directory' })).toBe(true);
    expect(
      supportsResourceReferences({
        kind: 'directory',
        parent: '',
        references: [],
      }),
    ).toBe(true);
    expect(
      supportsResourceReferences({ kind: 'resource', parent: 'admin:root' }),
    ).toBe(false);
    expect(supportsResourceReferences(undefined)).toBe(false);
  });

  it('preserves the editor for pre-existing nested references', () => {
    expect(
      supportsResourceReferences({
        kind: 'directory',
        parent: 'admin:root',
        references: ['admin:other:page'],
      }),
    ).toBe(true);
  });

  it('supports arbitrary roots and renamed words while retaining reference boundaries', () => {
    const catalog: ResourceCatalog = {
      
      buttons: {},
      resources: {
        'admin:renamed': {
          kind: 'directory',
          sort: 0,
          references: ['admin:system:user'],
        },
        'admin:system': { kind: 'directory', sort: 10 },
        'admin:system:user': {
          kind: 'resource',
          parent: 'admin:system',
          sort: 0,
          operations: { read: { entry_keys: [], button_keys: [] } },
        },
        'mini:other': { kind: 'directory', sort: 0 },
      },
    };
    expect(referenceGraphIssues(catalog)).toEqual([]);
    expect(canReferenceResource(catalog, 'admin:renamed', 'admin:system')).toBe(
      true,
    );
    expect(
      canReferenceResource(catalog, 'admin:renamed', 'admin:system:user'),
    ).toBe(true);
    expect(canReferenceResource(catalog, 'admin:renamed', 'mini:other')).toBe(
      false,
    );
    expect(
      canReferenceResource(catalog, 'admin:renamed', 'admin:renamed'),
    ).toBe(false);
    expect(canReferenceResource(catalog, 'admin:system', 'admin:system:user')).toBe(
      false,
    );
    const tree = resourceReferenceTree(catalog, 'admin', '', (key) => key);
    expect(tree[0]?.children[0]?.referenceTarget).toBe('admin:system:user');
    expect(catalog.resources['admin:system:user']?.parent).toBe('admin:system');
  });
});
