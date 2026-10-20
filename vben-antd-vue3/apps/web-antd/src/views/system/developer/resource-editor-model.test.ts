import { describe, expect, it } from 'vitest';

import { fixture } from './__fixtures__/catalog';
import {
  applyResourceEditor,
  createResourceEditor,
  resourceTypeChangeIssue,
} from './resource-editor-model';

function catalog() {
  const value = fixture();
  value.messages['en-US']!.frontend = {
    resources: { 'admin:system:user': 'Users' },
    features: { 'admin:system:user:query': 'Query' },
  };
  value.messages['zh-CN']!.frontend = {
    resources: { 'admin:system:user': '用户' },
    features: { 'admin:system:user:query': '查询' },
  };
  return value;
}

describe('resource editor model', () => {
  it('detaches nested form values from the online document', () => {
    const value = catalog();
    const before = structuredClone(value);
    const draft = createResourceEditor(value, 'admin', 'admin:system:user');
    expect(draft.position).toBe(1);
    expect(draft.entries[0]).toMatchObject({
      key: 'admin:menu:system:user',
      path: '/system/user',
      operations: ['read'],
    });
    draft.features[0]!.http[0]!.path = '/changed';
    draft.features[0]!.buttons.push('admin:btn:system:user:new');
    draft.entries[0]!.operations.push('update');
    expect(value).toEqual(before);
  });

  it('saves entry paths and feature labels without changing the source', () => {
    const value = catalog();
    const draft = createResourceEditor(value, 'admin', 'admin:system:user');
    draft.entries[0]!.path = '/people';
    draft.features[0]!.en = 'Search users';
    const next = applyResourceEditor(value, 'admin', draft);
    expect(
      next.resource_catalog.resources['admin:system:user']?.entries?.[
        'admin:menu:system:user'
      ]?.path,
    ).toBe('/people');
    expect(next.messages['en-US']?.frontend).toHaveProperty(
      ['features', 'admin:system:user:query'],
      'Search users',
    );
    expect(
      value.resource_catalog.resources['admin:system:user']?.entries?.[
        'admin:menu:system:user'
      ]?.path,
    ).toBe('/system/user');
  });

  it('removes retired features and translations when an operation is removed', () => {
    const value = catalog();
    const draft = createResourceEditor(value, 'admin', 'admin:system:user');
    draft.operations = [];
    const next = applyResourceEditor(value, 'admin', draft);
    expect(
      next.resource_catalog.resources['admin:system:user']?.operations,
    ).toBeUndefined();
    expect(next.resource_catalog.buttons).not.toHaveProperty(
      'admin:system:user:query',
    );
    expect(next.messages['en-US']?.frontend).not.toHaveProperty([
      'features',
      'admin:system:user:query',
    ]);
    expect(next.messages['zh-CN']?.frontend).not.toHaveProperty([
      'features',
      'admin:system:user:query',
    ]);
  });

  it.each([
    ['admin:', 'nodeIdentifierIncomplete'],
    ['mini:system:new', 'nodeIdentifierScope'],
    ['admin:system:Bad', 'nodeIdentifierCharacters'],
    ['admin:new', 'resourceIdentifierFormat'],
  ])('rejects invalid identifier %s before applying changes', (key, error) => {
    const value = catalog();
    const draft = createResourceEditor(value, 'admin', '', 'admin:system');
    Object.assign(draft, { key, nodeKind: 'resource', zh: '新增', en: 'New' });
    expect(() => applyResourceEditor(value, 'admin', draft)).toThrow(error);
  });

  it('rejects reserved identifiers, duplicate entries, invalid positions and parent edits', () => {
    const value = catalog();
    const draft = createResourceEditor(value, 'admin', 'admin:system:user');
    draft.entries.push({ ...draft.entries[0]! });
    expect(() => applyResourceEditor(value, 'admin', draft)).toThrow(
      'duplicate',
    );
    draft.entries.pop();
    draft.position = 0;
    expect(() => applyResourceEditor(value, 'admin', draft)).toThrow(
      'invalidPosition',
    );
    draft.position = 1;
    draft.parent = 'admin:elsewhere';
    expect(() => applyResourceEditor(value, 'admin', draft)).toThrow(
      'useTreeToMove',
    );
    const fresh = createResourceEditor(value, 'admin', '', 'admin:system');
    Object.assign(fresh, {
      key: 'admin:system:new',
      nodeKind: 'resource',
      zh: '新增',
      en: 'New',
    });
    expect(() =>
      applyResourceEditor(value, 'admin', fresh, {
        'admin:system:new': 'admin:old',
      }),
    ).toThrow('duplicate');
  });

  it('prevents type changes that would discard children, references or configuration', () => {
    const value = catalog();
    expect(
      resourceTypeChangeIssue(
        value,
        createResourceEditor(value, 'admin', 'admin:system'),
        'resource',
      ),
    ).toBe('rootTypeFixed');
    expect(
      resourceTypeChangeIssue(
        value,
        createResourceEditor(value, 'admin', 'admin:system:user'),
        'directory',
      ),
    ).toBe('resourceTypeHasConfiguration');
    value.resource_catalog.resources['admin:system:folder'] = {
      kind: 'directory',
      parent: 'admin:system',
      sort: 3,
      references: ['admin:system:user'],
    };
    const draft = createResourceEditor(value, 'admin', 'admin:system:folder');
    expect(resourceTypeChangeIssue(value, draft, 'resource')).toBe(
      'directoryTypeHasReferences',
    );
    value.resource_catalog.resources['admin:system:folder:item'] = {
      kind: 'resource',
      parent: draft.key,
      sort: 1,
    };
    expect(resourceTypeChangeIssue(value, draft, 'resource')).toBe(
      'directoryTypeHasChildren',
    );
  });
});
