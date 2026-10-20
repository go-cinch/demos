import { describe, expect, it } from 'vitest';
import type { Catalog } from './catalog-model';
import { resourceChildren } from '../components/resource-order';
import { resolveResourceBindings } from '../components/resource-catalog';
import { harmonizeResourceModelDraft, seedResourceCatalog, upgradeResourceCatalog } from './resource-preview';
import { applyResourceEditor, createResourceEditor } from './resource-editor-model';

function fixture(): Catalog {
  return { schema_version: 2, default_locale: 'zh-CN', scopes: ['admin'], operations: ['read', 'create', 'update', 'delete'],
    locales: [{ tag: 'zh-CN', name: '中文', enabled: true }, { tag: 'en-US', name: 'English', enabled: true }],
    messages: { 'zh-CN': { frontend: {} }, 'en-US': { frontend: {} } },
    resource_catalog: { resources: { 'admin:default': { kind: 'directory', sort: 0, frontend_visible: false }, 'admin:system': { kind: 'directory', sort: 10 } }, buttons: {} } };
}

describe('editable resource definitions', () => {
  it('defines wildcard scope and concrete CRUD features without action back references', () => {
    const source = fixture(); const before = JSON.stringify(source);
    const catalog = seedResourceCatalog(source);
    expect(resourceChildren(catalog.resource_catalog, '', 'admin').map((item) => item.key)).toEqual(['admin:default', 'admin:high-risk', 'admin:system']);
    expect(catalog.resource_catalog.resources['admin:high-risk']?.frontend_visible).toBe(false);
    expect(catalog.resource_catalog.resources['admin:high-risk:all']?.permission_scope).toBe('*');
    const node = catalog.resource_catalog.resources['admin:high-risk:permission-admin']!;
    expect(Object.keys(node.operations ?? {})).toEqual(['read', 'create', 'update', 'delete']);
    for (const operation of Object.values(node.operations ?? {})) expect(operation.button_keys).toHaveLength(3);
    expect(JSON.stringify(catalog.resource_catalog.resources)).not.toContain('action_word');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('resolves a wildcard by the configured resource rather than a resource name', () => {
    const catalog = seedResourceCatalog(fixture());
    const node = catalog.resource_catalog.resources['admin:high-risk:all']!;
    delete catalog.resource_catalog.resources['admin:high-risk:all'];
    catalog.resource_catalog.resources['admin:business:arbitrary'] = node;
    const config = resolveResourceBindings(catalog.resource_catalog, 'admin', [{ resource_key: 'admin:business:arbitrary', operation: '*', feature_keys: [] }]);
    expect(config.permission_scope).toBe('*');
  });
  it('preserves custom configurations and persists scope through the ordinary editor', () => {
    const source = fixture();
    source.resource_catalog.resources['admin:high-risk'] = { kind: 'directory', sort: 1 };
    source.resource_catalog.resources['admin:high-risk:permission-admin'] = { kind: 'resource', parent: 'admin:high-risk', sort: 0, operations: { read: { entry_keys: [], button_keys: ['admin:high-risk:permission-admin:custom'] } } };
    const catalog = upgradeResourceCatalog(source);
    expect(catalog.resource_catalog.resources['admin:high-risk:permission-admin']?.operations?.read?.button_keys).toEqual(['admin:high-risk:permission-admin:custom']);
    expect(seedResourceCatalog(catalog)).toBe(catalog);
    const empty = fixture();
    empty.resource_catalog.resources['admin:system:all'] = { kind: 'resource', parent: 'admin:system', sort: 0, permission_scope: '*', operations: {} };
    const editor = createResourceEditor(empty, 'admin', 'admin:system:all');
    editor.zh = '全部'; editor.en = 'All';
    expect(applyResourceEditor(empty, 'admin', editor).resource_catalog.resources['admin:system:all']?.permission_scope).toBe('*');
  });
});

it('harmonizes identical root positions while keeping real local edits', () => {
  const online = seedResourceCatalog(fixture());
  const draft = JSON.parse(JSON.stringify(online)) as Catalog;
  draft.resource_catalog.resources['admin:high-risk']!.sort = 5;
  draft.resource_catalog.resources['admin:system']!.sort = 50;
  draft.messages['zh-CN']!.frontend = { resources: { 'admin:high-risk': '本地名称' } };
  const result = harmonizeResourceModelDraft(draft, online);
  expect(result.resource_catalog.resources['admin:high-risk']!.sort).toBe(online.resource_catalog.resources['admin:high-risk']!.sort);
  expect(result.messages['zh-CN']!.frontend).toEqual(draft.messages['zh-CN']!.frontend);
  delete draft.resource_catalog.resources['admin:high-risk:all'];
  expect(harmonizeResourceModelDraft(draft, online).resource_catalog.resources['admin:high-risk:all']).toBeUndefined();
});
