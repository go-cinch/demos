import type { ResourceCatalog } from '../permissions/types';
import type { ActionGroupDraft, PermissionGroupType } from '../permissions/action-group-model';
import { pruneGroupDefaults } from '../permissions/action-group-model';
import { referenceGraphIssues, referencedOperations } from '../permissions/resource-references';
import { menuResourceKeys } from '../permissions/resource-catalog';

export const messageCategories = ['frontend', 'backend'];

export interface Catalog {
  schema_version: number;
  default_locale: string;
  scopes: string[];
  group_order?: string[];
  group_defaults?: Record<string, boolean>;
  operations: string[];
  locales: { tag: string; name: string; enabled: boolean }[];
  messages: Record<string, Record<string, unknown>>;
  resource_catalog: ResourceCatalog;
}
export interface Change {
  path: string[];
  kind: 'added' | 'changed' | 'deleted';
  before: unknown;
  after: unknown;
}
export interface Conflict extends Change {
  base: unknown;
}
export interface EditorBuffer {
  kind: 'resource' | 'entry' | 'feature' | 'message';
  original: string;
  key: string;
  parent: string;
  zh: string;
  en: string;
  nodeKind: 'directory' | 'resource';
  sort: number;
  operation: string;
  path: string;
  parentMenu: string;
  buttons: string[];
  http: { method: string; path: string }[];
  grpc: string[];
  category: string;
}
export interface ResourceEntryDraft {
  key: string;
  path: string;
  parentMenu: string;
  operations: string[];
}
export interface ResourceFeatureDraft {
  permissionResource?: string;
  entryKeys?: string[];
  key: string;
  zh: string;
  en: string;
  operation: string;
  buttons: string[];
  http: { method: string; path: string }[];
  grpc: string[];
}
export interface ResourceEditor {
  permissionScope?: '' | '*';
  frontendVisible?: boolean;
  editorTab?: 'basic' | 'entries' | 'operations';
  editorOperation?: string;
  original: string;
  key: string;
  parent: string;
  nodeKind: 'directory' | 'resource';
  sort: number;
  position?: number | null;
  references: string[];
  referenceOperations?: Record<string, string[]>;
  zh: string;
  en: string;
  operations: string[];
  entries: ResourceEntryDraft[];
  features: ResourceFeatureDraft[];
}
export type CatalogNavigate = (action: () => void) => Promise<boolean>;
export type ResourceDetailTab = 'basic' | 'entries' | 'operations' | 'references';
export interface EditorUI {
  group: string;
  groupEditor: (ActionGroupDraft & { original: string }) | null;
  groupRenames: Record<string, string>;
  groupTypes: Record<string, PermissionGroupType>;
  resourcePreviewVersion: number;
  resourceRenames: Record<string, string>;
  featureRenames: Record<string, string>;
  tab: string;
  scope: string;
  resource: string;
  resourceTab?: ResourceDetailTab;
  query: string;
  messageQuery: string;
  category: string;
  messagePage: number;
  missingOnly: boolean;
  expanded: string[];
  scroll: number;
  buffer: EditorBuffer | null;
  resourceEditor: ResourceEditor | null;
  diffQuery: string;
  diffKind: string;
  jsonDiff: boolean;
  bufferScroll: number;
  newScope: string;
  resolutions: Record<string, { choice: string; custom: string }>;
  resolutionSnapshot: string;
}
export interface Draft {
  version: 1;
  owner: string;
  sequence: number;
  savedAt: number;
  base: Catalog;
  document: Catalog;
  ui: EditorUI;
}
export const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));
// Keep old drafts and imports compatible with canonical resource names.
export function normalizeCatalog(value: Catalog): Catalog {
  const document = clone(value);
  pruneGroupDefaults(document);
  Reflect.deleteProperty(document, 'group_aliases');
  Reflect.deleteProperty(document.resource_catalog, 'resource_aliases');
  Reflect.deleteProperty(document.resource_catalog, 'feature_aliases');
  const legacyDefaults: unknown = Reflect.get(document.resource_catalog, 'defaults');
  if (
    legacyDefaults !== undefined &&
    (!isObject(legacyDefaults) || Object.keys(legacyDefaults).length)
  )
    throw new Error('Legacy default mappings must be migrated to explicit resource bindings');
  Reflect.deleteProperty(document.resource_catalog, 'defaults');
  for (const resource of Object.values(document.resource_catalog.resources)) {
    Reflect.deleteProperty(resource, 'action_word');
    // Upgrade old browser drafts once; current data has no collection marker.
    if (Reflect.get(resource, 'collection') === 'default_permissions') {
      if (
        resource.kind === 'directory' &&
        !resource.parent &&
        resource.frontend_visible === undefined
      )
        resource.frontend_visible = false;
      for (const target of resource.references ?? [])
        (resource.reference_operations ??= {})[target] ??= ['read'];
    }
    Reflect.deleteProperty(resource, 'collection');
    if (resource.entries && !Object.keys(resource.entries).length) delete resource.entries;
    if (resource.operations && !Object.keys(resource.operations).length) delete resource.operations;
    for (const entry of Object.values(resource.entries ?? {}))
      Reflect.deleteProperty(entry, 'type');
  }
  // Freeze legacy node-only references at their current operation scope. Later
  // edits to the target never silently broaden a saved draft's references.
  const referenceScopes = Object.entries(document.resource_catalog.resources).map(
    ([owner, node]) =>
      [
        owner,
        Object.fromEntries(
          (node.references ?? []).map((target) => [
            target,
            clone(referencedOperations(document.resource_catalog, owner, target))
          ])
        )
      ] as const
  );
  for (const [owner, operations] of referenceScopes)
    if (Object.keys(operations).length)
      document.resource_catalog.resources[owner]!.reference_operations = operations;
  const owners = menuResourceKeys(document.resource_catalog);
  for (const messages of Object.values(document.messages)) {
    if (isObject(messages.backend))
      for (const code of [
        'HTTP_INVALID_CATEGORY_FORMAT',
        'HTTP_INVALID_CATEGORY_VALUE',
        'HTTP_BAD_REQUEST'
      ])
        Reflect.deleteProperty(messages.backend, code);
    if (!isObject(messages.frontend)) continue;
    const frontend = messages.frontend;
    Reflect.deleteProperty(frontend, 'demos');
    if (isObject(frontend.actions)) {
      for (const [previous, current] of Object.entries({
        'admin:all:system:general': 'admin:all:system:all',
        'admin:default:system:general': 'admin:default:system:default'
      })) {
        if (!Object.hasOwn(frontend.actions, previous)) continue;
        if (!Object.hasOwn(frontend.actions, current))
          frontend.actions[current] = frontend.actions[previous];
        Reflect.deleteProperty(frontend.actions, previous);
      }
    }
    if (
      !document.resource_catalog.resources['admin:system:user-test'] &&
      isObject(frontend.resources)
    )
      Reflect.deleteProperty(frontend.resources, 'admin:system:user-test');
    if (!isObject(frontend.menus)) continue;
    const names: Record<string, unknown> = isObject(frontend.resources) ? frontend.resources : {};
    for (const [menu, resource] of [...owners].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (!Object.hasOwn(frontend.menus, menu)) continue;
      if (!Object.hasOwn(names, resource) && typeof frontend.menus[menu] === 'string')
        names[resource] = frontend.menus[menu];
      Reflect.deleteProperty(frontend.menus, menu);
    }
    if (Object.keys(names).length) frontend.resources = names;
    if (!Object.keys(frontend.menus).length) Reflect.deleteProperty(frontend, 'menus');
  }
  return document;
}
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value, (_, entry: unknown) =>
    isObject(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .toSorted()
            .map((key) => [key, entry[key]])
        )
      : entry
  );
}
export const equal = (a: unknown, b: unknown) => stable(a) === stable(b);
const safeSegment = (key: string) => !['__proto__', 'constructor', 'prototype'].includes(key);
export function at(value: unknown, path: string[]): unknown {
  for (const key of path) {
    if (!safeSegment(key) || !isObject(value)) return undefined;
    value = Object.hasOwn(value, key) ? value[key] : undefined;
  }
  return value;
}
export function assign(root: unknown, path: string[], value: unknown) {
  if (!isObject(root) || path.length === 0 || path.some((key) => !safeSegment(key)))
    throw new Error('Invalid field path');
  let node = root;
  for (const key of path.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  const key = path.at(-1);
  if (key === undefined) throw new Error('Invalid field path');
  if (value === undefined) Reflect.deleteProperty(node, key);
  else node[key] = clone(value);
}
function changeKind(before: unknown, after: unknown): Change['kind'] {
  if (before === undefined) return 'added';
  if (after === undefined) return 'deleted';
  return 'changed';
}
export function differences(before: unknown, after: unknown, path: string[] = []): Change[] {
  if (equal(before, after)) return [];
  if (isObject(before) && isObject(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .toSorted()
      .flatMap((key) => differences(before[key], after[key], [...path, key]));
  return [
    {
      path,
      kind: changeKind(before, after),
      before,
      after
    }
  ];
}
export function merge(base: unknown, local: unknown, online: unknown) {
  const conflicts: Conflict[] = [];
  function walk(b: unknown, l: unknown, o: unknown, path: string[]): unknown {
    if (equal(l, b)) return clone(o);
    if (equal(o, b) || equal(o, l)) return clone(l);
    if (isObject(b) && isObject(l) && isObject(o)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(o)])) {
        if (!safeSegment(key)) throw new Error('Invalid field path');
        const value = walk(b[key], l[key], o[key], [...path, key]);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push({
      path,
      base: clone(b),
      before: clone(o),
      after: clone(l),
      kind: changeKind(o, l)
    });
    return clone(l);
  }
  return { document: walk(base, local, online, []) as Catalog, conflicts };
}
export function isCatalog(value: unknown): value is Catalog {
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((s) => typeof s === 'string');
  const map = (v: unknown, check: (v: unknown) => boolean) =>
    isObject(v) && Object.values(v).every((child) => check(child));
  const safe = (v: unknown): boolean =>
    Array.isArray(v)
      ? v.every((child) => safe(child))
      : !isObject(v) || Object.entries(v).every(([key, child]) => safeSegment(key) && safe(child));
  return (
    isObject(value) &&
    safe(value) &&
    value.schema_version === 2 &&
    typeof value.default_locale === 'string' &&
    Array.isArray(value.scopes) &&
    Array.isArray(value.operations) &&
    Array.isArray(value.locales) &&
    isObject(value.messages) &&
    isObject(value.resource_catalog) &&
    isObject(value.resource_catalog.resources) &&
    isObject(value.resource_catalog.buttons) &&
    (value.resource_catalog.defaults === undefined ||
      (isObject(value.resource_catalog.defaults) &&
        !Object.keys(value.resource_catalog.defaults).length)) &&
    (value.group_defaults === undefined ||
      map(value.group_defaults, (v) => typeof v === 'boolean')) &&
    strings(value.scopes) &&
    strings(value.operations) &&
    value.locales.every(
      (l) =>
        isObject(l) &&
        typeof l.tag === 'string' &&
        typeof l.name === 'string' &&
        typeof l.enabled === 'boolean'
    ) &&
    map(value.messages, (m) => isObject(m)) &&
    map(
      value.resource_catalog.resources,
      (r) =>
        isObject(r) &&
        typeof r.kind === 'string' &&
        typeof r.sort === 'number' &&
        (r.frontend_visible === undefined || typeof r.frontend_visible === 'boolean') &&
        (r.parent === undefined || typeof r.parent === 'string') &&
        (r.collection === undefined || r.collection === 'default_permissions') &&
        (r.references === undefined || strings(r.references)) &&
        (r.reference_operations === undefined || map(r.reference_operations, strings)) &&
        (r.child_order === undefined ||
          (Array.isArray(r.child_order) &&
            r.child_order.every(
              (item) =>
                isObject(item) &&
                ['node', 'reference'].includes(String(item.kind)) &&
                typeof item.key === 'string'
            ))) &&
        (r.entries === undefined ||
          map(
            r.entries,
            (e) =>
              isObject(e) &&
              typeof e.path === 'string' &&
              (e.parent_menu_key === undefined || typeof e.parent_menu_key === 'string')
          )) &&
        (r.operations === undefined ||
          map(r.operations, (o) => isObject(o) && strings(o.entry_keys) && strings(o.button_keys)))
    ) &&
    map(
      value.resource_catalog.buttons,
      (f) =>
        isObject(f) &&
        strings(f.btn) &&
        strings(f.grpc) &&
        Array.isArray(f.http) &&
        f.http.every(
          (h) => isObject(h) && typeof h.method === 'string' && typeof h.path === 'string'
        )
    )
  );
}
export function isResourceEditor(value: unknown): value is ResourceEditor {
  const strings = (values: unknown): values is string[] =>
    Array.isArray(values) && values.every((value) => typeof value === 'string');
  const labels = (item: unknown): item is Record<string, unknown> =>
    isObject(item) && ['key', 'zh', 'en'].every((key) => typeof item[key] === 'string');
  return (
    isObject(value) &&
    labels(value) &&
    ['original', 'parent'].every((key) => typeof value[key] === 'string') &&
    ['directory', 'resource'].includes(String(value.nodeKind)) &&
    typeof value.sort === 'number' &&
    (value.permissionScope === undefined ||
      value.permissionScope === '' ||
      value.permissionScope === '*') &&
    (value.frontendVisible === undefined || typeof value.frontendVisible === 'boolean') &&
    (value.position === undefined ||
      value.position === null ||
      typeof value.position === 'number') &&
    strings(value.references) &&
    (value.referenceOperations === undefined ||
      (isObject(value.referenceOperations) &&
        Object.values(value.referenceOperations).every(strings))) &&
    strings(value.operations) &&
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        isObject(entry) &&
        typeof entry.key === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.parentMenu === 'string' &&
        strings(entry.operations)
    ) &&
    Array.isArray(value.features) &&
    value.features.every(
      (feature) =>
        labels(feature) &&
        typeof feature.operation === 'string' &&
        strings(feature.buttons) &&
        strings(feature.grpc) &&
        Array.isArray(feature.http) &&
        feature.http.every(
          (endpoint) =>
            isObject(endpoint) &&
            typeof endpoint.method === 'string' &&
            typeof endpoint.path === 'string'
        )
    )
  );
}
export function initialUI(): EditorUI {
  return {
    group: '',
    groupEditor: null,
    groupRenames: {},
    groupTypes: {},
    resourcePreviewVersion: 0,
    resourceRenames: {},
    featureRenames: {},
    tab: 'languages',
    scope: 'admin',
    resource: '',
    query: '',
    messageQuery: '',
    category: 'frontend',
    messagePage: 1,
    missingOnly: false,
    expanded: [],
    scroll: 0,
    buffer: null,
    resourceEditor: null,
    diffQuery: '',
    diffKind: '',
    jsonDiff: false,
    bufferScroll: 0,
    newScope: '',
    resolutions: {},
    resolutionSnapshot: ''
  };
}
export function editor(kind: EditorBuffer['kind'], key = ''): EditorBuffer {
  return {
    kind,
    original: key,
    key,
    parent: '',
    zh: '',
    en: '',
    nodeKind: 'resource',
    sort: 0,
    operation: 'read',
    path: '',
    parentMenu: '',
    buttons: [],
    http: [],
    grpc: [],
    category: 'frontend'
  };
}
export function text(catalog: Catalog, locale: string, group: string, key: string): string {
  if (group === 'menus') {
    const resource = menuResourceKeys(catalog.resource_catalog).get(key);
    if (resource) return text(catalog, locale, 'resources', resource);
  }
  const value = at(catalog.messages, [locale, 'frontend', group, key]);
  return typeof value === 'string' ? value : '';
}
export function setText(
  catalog: Catalog,
  locale: string,
  group: string,
  key: string,
  value: string
) {
  assign(catalog.messages, [locale, 'frontend', group, key], value);
}
export function messagePaths(value: unknown, path: string[] = []): string[][] {
  if (typeof value === 'string') return [path];
  return isObject(value)
    ? Object.entries(value).flatMap(([key, child]) => messagePaths(child, [...path, key]))
    : [];
}

export interface Problem {
  path: string[];
  code: string;
  warning?: boolean;
}
const keyPattern = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*$/;
export function catalogPath(path: string, params = false) {
  if (!path.startsWith('/') || /[*?#\\\n\r\t %]/.test(path) || path.includes('//')) return false;
  return path
    .split('/')
    .every(
      (part) =>
        !['.', '..'].includes(part) &&
        (!/[{}:]/.test(part) || (params && /^\{[a-z][a-z0-9_-]*\}$/.test(part)))
    );
}
// Unconfigured resources are valid local drafts. Mirror the remaining catalog
// structural rules for actionable local errors. The server
// remains authoritative, including validation of defaults and language adapters.
export function validate(c: Catalog): Problem[] {
  const issues: Problem[] = [];
  const add = (path: string[], code = 'invalid', warning = false) =>
    issues.push({ path, code, warning });
  if (
    c.group_order !== undefined &&
    (!Array.isArray(c.group_order) ||
      new Set(c.group_order).size !== c.group_order.length ||
      c.group_order.some(
        (key) =>
          typeof key !== 'string' ||
          key.length > 128 ||
          !/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){2,}$/.test(key)
      ))
  )
    add(['group_order']);
  const groups = new Set(
    Object.values(c.messages).flatMap((messages) =>
      isObject(messages.frontend) && isObject(messages.frontend.groups)
        ? Object.keys(messages.frontend.groups)
        : []
    )
  );
  for (const [key, enabled] of Object.entries(c.group_defaults ?? {}))
    if (
      !groups.has(key) ||
      !c.scopes.includes(key.split(':')[0] ?? '') ||
      typeof enabled !== 'boolean'
    )
      add(['group_defaults', key]);
  if (!equal(c.operations, ['read', 'create', 'update', 'delete'])) add(['operations']);
  if (
    c.scopes.length === 0 ||
    new Set(c.scopes).size !== c.scopes.length ||
    c.scopes.some((s) => !/^[a-z][a-z0-9_-]*$/.test(s))
  )
    add(['scopes']);
  const enabled = c.locales.filter((l) => l.enabled);
  const tags = c.locales.map((l) => l.tag);
  if (!enabled.some((l) => l.tag === c.default_locale) || new Set(tags).size !== tags.length)
    add(['locales']);
  for (const locale of c.locales) {
    try {
      if (Intl.getCanonicalLocales(locale.tag)[0] !== locale.tag) add(['locales']);
    } catch {
      add(['locales']);
    }
    if (locale.enabled && !isObject(c.messages[locale.tag])) add(['messages', locale.tag]);
  }
  const resources = c.resource_catalog.resources;
  for (const issue of referenceGraphIssues(c.resource_catalog))
    add(['resource_catalog', 'resources', issue.key, issue.field], issue.code);
  const features = c.resource_catalog.buttons;
  const owners = new Set<string>();
  const entries = new Set<string>();
  for (const [key, resource] of Object.entries(resources)) {
    const p = ['resource_catalog', 'resources', key];
    const parts = key.split(':');
    const ordered = new Set<string>();
    for (const item of resource.child_order ?? []) {
      const id = `${item.kind}:${item.key}`;
      if (
        resource.kind !== 'directory' ||
        ordered.has(id) ||
        (item.kind === 'node'
          ? resources[item.key]?.parent !== key
          : item.kind !== 'reference' || !resource.references?.includes(item.key))
      )
        add([...p, 'child_order'], 'invalidOrder');
      ordered.add(id);
    }
    if (
      !keyPattern.test(key) ||
      !c.scopes.includes(parts[0] ?? '') ||
      parts.length < 2 ||
      key.length + 7 > 128 ||
      !['directory', 'resource'].includes(resource.kind) ||
      !Number.isInteger(resource.sort) ||
      resource.sort < 0
    )
      add(p);
    if (
      resource.permission_group !== undefined &&
      (typeof resource.permission_group !== 'string' ||
        resource.kind !== 'directory' ||
        !!resource.parent ||
        resource.permission_group.length > 128 ||
        !keyPattern.test(resource.permission_group) ||
        resource.permission_group.split(':').length < 3 ||
        resource.permission_group.split(':')[0] !== parts[0])
    )
      add([...p, 'permission_group']);
    if (
      resource.permission_scope !== undefined &&
      (resource.kind !== 'resource' || resource.permission_scope !== '*')
    )
      add([...p, 'permission_scope']);
    if (
      resource.frontend_visible !== undefined &&
      (typeof resource.frontend_visible !== 'boolean' ||
        resource.kind !== 'directory' ||
        !!resource.parent)
    )
      add([...p, 'frontend_visible']);
    if (resource.kind === 'resource' && parts.length < 3) add(p);
    if (
      resource.kind === 'directory' &&
      (Object.keys(resource.entries ?? {}).length > 0 ||
        Object.keys(resource.operations ?? {}).length > 0)
    )
      add(p, 'directoryCannotGrant');
    const seen = new Set([key]);
    for (let parent = resource.parent; parent; parent = resources[parent]?.parent) {
      if (
        seen.has(parent) ||
        !resources[parent] ||
        resources[parent]?.kind !== 'directory' ||
        parent.split(':')[0] !== parts[0]
      ) {
        add([...p, 'parent'], 'invalidParent');
        break;
      }
      seen.add(parent);
    }
    for (const [entryKey, entry] of Object.entries(resource.entries ?? {})) {
      if (
        entries.has(entryKey) ||
        !keyPattern.test(entryKey) ||
        !entryKey.startsWith(`${parts[0]}:menu:`) ||
        entryKey.split(':').length < 3 ||
        !catalogPath(entry.path) ||
        (entry.parent_menu_key &&
          (!keyPattern.test(entry.parent_menu_key) ||
            !entry.parent_menu_key.startsWith(`${parts[0]}:menu:`) ||
            entry.parent_menu_key === entryKey))
      )
        add([...p, 'entries', entryKey]);
      entries.add(entryKey);
    }
    for (const [op, binding] of Object.entries(resource.operations ?? {})) {
      const bp = [...p, 'operations', op];
      if (
        !c.operations.includes(op) ||
        !Array.isArray(binding.entry_keys) ||
        !Array.isArray(binding.button_keys)
      ) {
        add(bp);
        continue;
      }
      if (
        new Set(binding.entry_keys).size !== binding.entry_keys.length ||
        binding.entry_keys.some((k) => !resource.entries?.[k])
      )
        add(bp);
      for (const feature of binding.button_keys) {
        if (
          !features[feature] ||
          !feature.startsWith(`${key}:`) ||
          feature.slice(key.length + 1).includes(':') ||
          owners.has(feature)
        )
          add([...bp, 'button_keys']);
        owners.add(feature);
      }
    }
  }
  for (const [key, f] of Object.entries(features)) {
    const p = ['resource_catalog', 'buttons', key];
    const parts = key.split(':');
    if (
      !keyPattern.test(key) ||
      parts.length < 4 ||
      !owners.has(key) ||
      !Array.isArray(f.btn) ||
      !Array.isArray(f.http) ||
      !Array.isArray(f.grpc)
    ) {
      add(p);
      continue;
    }
    const prefixes = [...entries]
      .filter((entry) => entry.startsWith(`${parts[0]}:menu:`))
      .map((entry) => `${entry.replace(':menu:', ':btn:')}:`);
    if (
      f.permission_resource !== undefined &&
      f.permission_resource !== '' &&
      !/^[a-z][a-z0-9_-]*$/.test(f.permission_resource)
    )
      add([...p, 'permission_resource']);
    if (
      f.entry_keys !== undefined &&
      (!Array.isArray(f.entry_keys) ||
        new Set(f.entry_keys).size !== f.entry_keys.length ||
        f.entry_keys.some((key) => !entries.has(key) || !key.startsWith(`${parts[0]}:menu:`)))
    )
      add([...p, 'entry_keys']);
    if (
      new Set(f.btn).size !== f.btn.length ||
      f.btn.some(
        (k) =>
          !keyPattern.test(k) ||
          k.split(':').length < 5 ||
          !prefixes.some((prefix) => k.startsWith(prefix) && !k.slice(prefix.length).includes(':'))
      )
    )
      add([...p, 'btn']);
    if (
      f.http.some(
        (h) =>
          !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(h.method) ||
          !catalogPath(h.path, true)
      )
    )
      add([...p, 'http']);
    if (f.grpc.some((g) => !catalogPath(g) || g.split('/').length !== 3)) add([...p, 'grpc']);
  }
  for (const category of messageCategories) {
    const paths = [
      ...new Map(
        ['zh-CN', 'en-US']
          .flatMap((locale) => messagePaths(c.messages[locale]?.[category]))
          .map((p) => [JSON.stringify(p), p])
      ).values()
    ];
    for (const path of paths) {
      if (['zh-CN', 'en-US'].some((locale) => !at(c.messages, [locale, category, ...path])))
        add(['messages', category, ...path], 'translation', true);
    }
  }
  return issues;
}
