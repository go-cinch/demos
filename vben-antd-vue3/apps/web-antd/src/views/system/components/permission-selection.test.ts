import type { ActionConfig, ResourceCatalog } from '#/api/system';

import { describe, expect, it } from 'vitest';

import {
  actionSelection,
  normalizeSelection,
  selectionFingerprint,
} from './permission-selection';

function catalog(): ResourceCatalog {
  return {
    resources: {
      'admin:system': { kind: 'directory', sort: 1 },
      'admin:system:user': {
        kind: 'resource',
        parent: 'admin:system',
        sort: 1,
        operations: {
          read: { entry_keys: [], button_keys: ['query', 'detail'] },
          update: { entry_keys: [], button_keys: ['edit'] },
        },
      },
      'admin:risk:all': { kind: 'resource', sort: 2, permission_scope: '*' },
      'mini:risk:all': { kind: 'resource', sort: 1, permission_scope: '*' },
    },
    buttons: Object.fromEntries(
      ['query', 'detail', 'edit'].map((key) => [
        key,
        { btn: [], http: [], grpc: [] },
      ]),
    ),
  };
}
const action = (config?: ActionConfig, word = 'admin:read:custom:users') => ({
  code: 'A',
  word,
  config,
});

describe('permission selection normalization', () => {
  it('merges repeated resource/operation pairs without expanding explicit empty features', () => {
    const selections = [
      {
        resource_key: 'admin:system:user',
        operation: 'update',
        feature_keys: [],
      },
      {
        resource_key: 'admin:system:user',
        operation: 'read',
        feature_keys: ['query'],
      },
      {
        resource_key: 'admin:system:user',
        operation: 'read',
        feature_keys: ['detail'],
      },
    ];
    const before = structuredClone(selections);
    expect(normalizeSelection(catalog(), selections)).toEqual([
      {
        resource_key: 'admin:system:user',
        operation: 'read',
        feature_keys: ['detail', 'query'],
      },
      {
        resource_key: 'admin:system:user',
        operation: 'update',
        feature_keys: [],
      },
    ]);
    expect(selections).toEqual(before);
    expect(
      selectionFingerprint(normalizeSelection(catalog(), selections)),
    ).toBe(
      selectionFingerprint(
        normalizeSelection(catalog(), [...selections].reverse()),
      ),
    );
  });

  it('expands omitted features only from the selected operation and rejects invalid features', () => {
    expect(
      normalizeSelection(catalog(), [
        { resource_key: 'admin:system:user', operation: 'read' },
      ])[0]?.feature_keys,
    ).toEqual(['detail', 'query']);
    expect(() =>
      normalizeSelection(catalog(), [
        {
          resource_key: 'admin:system:user',
          operation: 'read',
          feature_keys: ['edit'],
        },
      ]),
    ).toThrow();
    expect(() =>
      normalizeSelection(catalog(), [
        { resource_key: 'admin:missing', operation: 'read' },
      ]),
    ).toThrow();
  });

  it('supports legacy single bindings and explicit empty default grants', () => {
    expect(
      actionSelection(
        catalog(),
        action({
          resource_key: 'admin:system:user',
          operation: 'read',
          feature_keys: [],
          ui: [],
          endpoints: [],
        }),
      ),
    ).toEqual([
      {
        resource_key: 'admin:system:user',
        operation: 'read',
        feature_keys: [],
      },
    ]);
    expect(
      actionSelection(
        catalog(),
        action({
          builtin: 'default',
          resource_keys: ['admin:system:user'],
          feature_keys: [],
          ui: [],
          endpoints: [],
        }),
      ),
    ).toEqual([
      {
        resource_key: 'admin:system:user',
        operation: 'read',
        feature_keys: [],
      },
    ]);
  });

  it('resolves builtin all through a scope-specific wildcard resource', () => {
    expect(
      actionSelection(
        catalog(),
        action(
          { builtin: 'all', ui: [], endpoints: [] },
          'mini:all:system:all',
        ),
      ),
    ).toEqual([
      { resource_key: 'mini:risk:all', operation: '*', feature_keys: [] },
    ]);
  });

  it('keeps unrepresentable assignments visible as errors rather than silently discarding them', () => {
    expect(() => actionSelection(catalog(), action())).toThrow(
      'Missing permission definition',
    );
    expect(() =>
      actionSelection(
        catalog(),
        action({
          ui: [],
          endpoints: [{ protocol: 'http', method: 'GET', path: '/user' }],
        }),
      ),
    ).toThrow('not represented');
    expect(() =>
      actionSelection(
        catalog(),
        action(
          { builtin: 'all', ui: [], endpoints: [] },
          'unknown:all:system:all',
        ),
      ),
    ).toThrow('not represented');
  });
});
