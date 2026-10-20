import { describe, expect, it } from 'vitest';
import type { Catalog } from './catalog-model';
import { clone, initialUI } from './catalog-model';
import { DraftStorage } from './draft-storage';
import { moveResource } from './resource-movement';
import { mergeKeyRenames, pendingResourceRenames } from './resource-renames';

function catalog(): Catalog {
  return {
    schema_version: 2,
    default_locale: 'en-US',
    scopes: ['admin'],
    operations: ['read'],
    locales: [{ tag: 'en-US', name: 'English', enabled: true }],
    messages: { 'en-US': { frontend: {} } },
    resource_catalog: {
      
      resources: {
        'admin:system': { kind: 'directory', sort: 1 },
        'admin:audit': { kind: 'directory', sort: 2 },
        'admin:system:user': {
          kind: 'resource', parent: 'admin:system', sort: 1,
          operations: { read: { entry_keys: [], button_keys: ['admin:system:user:query'] } },
        },
      },
      buttons: { 'admin:system:user:query': { btn: [], http: [{ method: 'GET', path: '/user' }], grpc: [] } },
    },
  };
}

describe('unpublished resource migrations', () => {
  it.each<[Record<string, string>, Record<string, string>, Record<string, string>]>([
    [{}, { a: 'b' }, { a: 'b' }],
    [{ a: 'b' }, { b: 'c' }, { a: 'c' }],
    [{ a: 'b' }, { b: 'a' }, {}],
    [{ a: 'c' }, { c: 'b' }, { a: 'b' }],
    [{ a: 'b', d: 'e' }, { b: 'c', f: 'g' }, { a: 'c', d: 'e', f: 'g' }],
    [{ a: 'b' }, { b: 'a', x: 'x' }, {}],
  ])('composes %j with %j without keeping intermediate keys', (previous, changes, expected) => {
    expect(mergeKeyRenames(previous, changes)).toEqual(expected);
  });

  it('reclaims the original resource and feature keys after moving back', () => {
    const original = catalog();
    const moved = moveResource(original, 'admin:system:user', { parent: 'admin:audit' });
    const resources = mergeKeyRenames({}, moved.resourceKeys);
    const features = mergeKeyRenames({}, moved.featureKeys);
    const returned = moveResource(moved.document, moved.key, { parent: 'admin:system' }, resources);
    const resourceRenames = mergeKeyRenames(resources, returned.resourceKeys);
    const featureRenames = mergeKeyRenames(features, returned.featureKeys);
    expect(returned.key).toBe('admin:system:user');
    expect(resourceRenames).toEqual({});
    expect(featureRenames).toEqual({});
    expect(pendingResourceRenames(original, returned.document, resourceRenames, featureRenames)).toEqual({ resources: {}, features: {} });
    expect(returned.document.resource_catalog.buttons).toEqual(original.resource_catalog.buttons);
  });

  it('repairs reverse and intermediate mappings in existing drafts while preserving real pending moves', () => {
    const base = catalog();
    const moved = moveResource(base, 'admin:system:user', { parent: 'admin:audit' });
    const draft = { version: 1 as const, owner: 'test', sequence: 1, savedAt: 1, base, document: moved.document, ui: initialUI() };
    draft.ui.resourceRenames = { 'admin:system:user': moved.key, 'admin:temporary:user': moved.key };
    draft.ui.featureRenames = { 'admin:system:user:query': 'admin:audit:user:query', 'admin:temporary:user:query': 'admin:audit:user:query' };
    const storage = new DraftStorage(localStorage, 'rename-repair');
    storage.save(draft);
    const restored = new DraftStorage(localStorage, 'rename-repair').load();
    expect(restored?.ui.resourceRenames).toEqual({ 'admin:system:user': moved.key });
    expect(restored?.ui.featureRenames).toEqual({ 'admin:system:user:query': 'admin:audit:user:query' });

    draft.document = clone(base);
    draft.ui.resourceRenames = { 'admin:audit:user': 'admin:system:user' };
    draft.ui.featureRenames = { 'admin:audit:user:query': 'admin:system:user:query' };
    storage.save(draft);
    const returned = new DraftStorage(localStorage, 'rename-repair').load();
    expect(returned?.ui.resourceRenames).toEqual({});
    expect(returned?.ui.featureRenames).toEqual({});
    localStorage.removeItem('rename-repair');
  });
});
