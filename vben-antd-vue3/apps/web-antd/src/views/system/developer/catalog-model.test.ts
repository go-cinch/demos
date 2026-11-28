/* oxlint-disable typescript/no-non-null-assertion -- Fixtures explicitly populate these records. */
import { describe, expect, it } from 'vitest';

import { fixture } from './__fixtures__/catalog';
import {
  assign,
  at,
  differences,
  editor,
  initialUI,
  isCatalog,
  menuPathConflicts,
  merge,
  normalizeCatalog,
  validate,
} from './catalog-model';
import { DraftStorage } from './draft-storage';
import { createResourceEditor } from './resource-editor-model';

describe('catalog diff and merge', () => {
  it('ignores object key order but retains meaningful array ordering and null', () => {
    expect(differences({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    expect(differences([1, 2], [2, 1])).toHaveLength(1);
    expect(differences({ a: null }, {})).toMatchObject([
      { path: ['a'], kind: 'deleted', before: null },
    ]);
  });
  it('keeps colon and dotted identifiers as exact path segments', () => {
    const before = { 'a.b:c': { x: 1 } };
    const changes = differences(before, { 'a.b:c': { x: 2 } });
    expect(changes[0]!.path).toEqual(['a.b:c', 'x']);
    assign(before, changes[0]!.path, 3);
    expect(at(before, ['a.b:c', 'x'])).toBe(3);
  });
  it('merges independent changes and identical concurrent edits', () => {
    const b = { a: 1, b: 2 };
    expect(merge(b, { a: 3, b: 2 }, { a: 1, b: 4 })).toMatchObject({
      document: { a: 3, b: 4 },
      conflicts: [],
    });
    expect(merge(b, { a: 3, b: 2 }, { a: 3, b: 2 }).conflicts).toEqual([]);
  });
  it('reports conflicting edits and delete-versus-edit at the owning node', () => {
    expect(merge({ a: { b: 1 } }, {}, { a: { b: 2 } }).conflicts).toMatchObject(
      [{ path: ['a'], base: { b: 1 }, after: undefined }],
    );
    expect(merge({ a: 1 }, { a: 2 }, { a: 3 }).conflicts).toMatchObject([
      { path: ['a'], base: 1, before: 3, after: 2 },
    ]);
    expect(merge({}, { a: 1 }, { a: 2 }).conflicts).toHaveLength(1);
  });
  it('retains unchanged online additions and local deletions', () => {
    expect(merge({ a: 1 }, {}, { a: 1, b: 2 })).toMatchObject({
      document: { b: 2 },
      conflicts: [],
    });
  });
  it('blocks prototype paths and malformed imported structures', () => {
    expect(() => assign({}, ['__proto__', 'polluted'], 1)).toThrow(
      'Invalid field path',
    );
    expect(
      isCatalog({
        ...fixture(),
        resource_catalog: { resources: { x: 1 }, buttons: {} },
      }),
    ).toBe(false);
    expect(isCatalog(JSON.parse('{"__proto__": {}}'))).toBe(false);
    expect(isCatalog(fixture())).toBe(true);
  });
});
describe('catalog validation', () => {
  it('upgrades empty retired defaults but rejects nonempty implicit grants', () => {
    const c = fixture();
    Reflect.set(c.resource_catalog, 'defaults', {});
    expect(isCatalog(c)).toBe(true);
    expect(normalizeCatalog(c).resource_catalog).not.toHaveProperty('defaults');
    Reflect.set(c.resource_catalog, 'defaults', {
      admin: { ui: [], endpoints: [] },
    });
    expect(isCatalog(c)).toBe(false);
    expect(() => normalizeCatalog(c)).toThrow('Legacy default mappings');
  });

  it('accepts the registered fixture and identifies graph cycles', () => {
    const c = fixture();
    expect(validate(c)).toEqual([]);
    c.resource_catalog.resources['admin:system']!.parent = 'admin:system';
    expect(validate(c).some((p) => p.code === 'invalidParent')).toBe(true);
  });
  it('detects invalid paths, unsupported operations and orphan features', () => {
    const c = fixture();
    c.resource_catalog.buttons['admin:system:user:query']!.http[0]!.path =
      '/user/*';
    c.operations.push('export');
    c.resource_catalog.buttons['admin:system:user:orphan'] = {
      btn: [],
      http: [],
      grpc: [],
    };
    expect(validate(c).filter((p) => !p.warning).length).toBe(3);
  });
  it('warns on missing translations without blocking submission', () => {
    const c = fixture();
    c.messages['en-US']!.frontend = { label: '' };
    expect(validate(c)).toMatchObject([{ code: 'translation', warning: true }]);
  });
  it('requires an enabled canonical default language', () => {
    const c = fixture();
    c.locales[0]!.enabled = false;
    expect(validate(c).filter((p) => !p.warning).length).toBe(1);
  });
});
describe('scoped menu paths', () => {
  it('checks draft entries against their scope and replaces the original while editing', () => {
    const catalog = fixture();
    const draft = createResourceEditor(catalog, 'admin', 'admin:system:user');
    const entries = draft.entries;
    const original = entries[0]!;
    const check = () => menuPathConflicts(catalog, { scope: 'admin', draft });
    expect(check().size).toBe(0);
    entries.push({ ...original, key: 'admin:menu:second' });
    expect(check().get('admin:menu:second')).toBe(original.key);
    entries.pop();
    catalog.resource_catalog.resources['admin:system:other'] = {
      kind: 'resource',
      parent: 'admin:system',
      sort: 3,
      entries: { 'admin:menu:other': { path: '/other' } },
    };
    original.path = '/other';
    expect(check().get(original.key)).toBe('admin:menu:other');
    original.path = '/corrected';
    expect(check().size).toBe(0);
    catalog.resource_catalog.resources['mini:system:user'] = {
      kind: 'resource',
      sort: 1,
      entries: { 'mini:menu:user': { path: '/system/user' } },
    };
    expect(menuPathConflicts(catalog).size).toBe(0);
    catalog.resource_catalog.resources['admin:system:other']!.entries![
      'admin:menu:other'
    ]!.path = '/system/user';
    expect(
      validate(catalog).filter((issue) => issue.code === 'duplicateMenuPath'),
    ).toHaveLength(2);
  });
});

describe('synchronous local draft persistence', () => {
  function value() {
    return {
      version: 1 as const,
      owner: 'tab-one',
      sequence: 1,
      savedAt: 1,
      base: fixture(),
      document: fixture(),
      ui: initialUI(),
    };
  }
  it('restores the latest character and incomplete editor input immediately', () => {
    localStorage.clear();
    const storage = new DraftStorage(localStorage, 'draft');
    const draft = value();
    draft.ui.buffer = editor('message');
    draft.ui.buffer.key = 'unfinished.';
    draft.document.messages['en-US']!.frontend = { label: 'last character!' };
    storage.save(draft);
    const restored = new DraftStorage(localStorage, 'draft').load()!;
    expect(restored.document).toEqual(draft.document);
    expect(restored.ui.buffer?.key).toBe('unfinished.');
  });
  it('allows independent browsing but protects an unsubmitted edit in another tab', () => {
    localStorage.clear();
    const first = new DraftStorage(localStorage, 'draft');
    first.save(value());
    const second = new DraftStorage(localStorage, 'draft');
    const browsing = second.load()!;
    browsing.ui.tab = 'resources';
    browsing.ui.query = 'user';
    second.save(browsing);
    expect(first.changed()).toBe(false);

    const editing = first.load()!;
    editing.ui.buffer = editor('message', 'test');
    first.save(editing);
    expect(second.changed()).toBe(true);
    expect(() => second.save(browsing)).toThrow('LOCAL_DRAFT_CHANGED');
  });
  it('refuses to overwrite a write from another tab', () => {
    localStorage.clear();
    const a = new DraftStorage(localStorage, 'draft');
    const b = new DraftStorage(localStorage, 'draft');
    const first = value();
    a.save(first);
    expect(() => b.save({ ...value(), owner: 'tab-two' })).toThrow(
      'LOCAL_DRAFT_CHANGED',
    );
    expect(a.load()?.owner).toBe('tab-one');
  });
  it('restores the selected group and invalid multilingual group input without filling blanks', () => {
    localStorage.clear();
    const draft = value();
    draft.ui.group = 'admin:system:user';
    draft.ui.groupEditor = {
      original: draft.ui.group,
      word: 'admin:unfinished:',
      names: { 'en-US': '', 'zh-CN': '未完成' },
      attempted: true,
      type: 2,
    };
    draft.ui.groupTypes = { [draft.ui.group]: 1 };
    new DraftStorage(localStorage, 'group-draft').save(draft);
    expect(
      new DraftStorage(localStorage, 'group-draft').load()?.ui,
    ).toMatchObject({
      group: draft.ui.group,
      groupEditor: draft.ui.groupEditor,
      groupTypes: { [draft.ui.group]: 1 },
    });
  });
  it('upgrades older drafts without a group editor and rejects corrupted group input without overwriting it', () => {
    localStorage.clear();
    const old = value();
    Reflect.deleteProperty(old.ui, 'group');
    Reflect.deleteProperty(old.ui, 'groupEditor');
    Reflect.deleteProperty(old.ui, 'groupTypes');
    localStorage.setItem('old-group-draft', JSON.stringify(old));
    expect(
      new DraftStorage(localStorage, 'old-group-draft').load()?.ui,
    ).toMatchObject({ group: '', groupEditor: null, groupTypes: {} });
    const broken = {
      ...old,
      ui: {
        ...old.ui,
        groupEditor: {
          original: '',
          word: '',
          names: { 'en-US': 1 },
          attempted: false,
        },
      },
    };
    const raw = JSON.stringify(broken);
    localStorage.setItem('broken-group-draft', raw);
    expect(() =>
      new DraftStorage(localStorage, 'broken-group-draft').load(),
    ).toThrow('Invalid group editor');
    expect(localStorage.getItem('broken-group-draft')).toBe(raw);
  });
  it('restores a retired message category without losing draft edits or unfinished input', () => {
    localStorage.clear();
    const storage = new DraftStorage(localStorage, 'draft');
    const draft = value();
    draft.document.messages['en-US']!.frontend = { label: 'Unpublished edit' };
    draft.ui.category = 'shared';
    draft.ui.messagePage = 4;
    draft.ui.buffer = {
      ...editor('message'),
      category: 'shared',
      key: 'unfinished.',
    };
    storage.save(draft);

    const restored = new DraftStorage(localStorage, 'draft').load()!;
    expect(restored.ui.category).toBe('frontend');
    expect(restored.ui.messagePage).toBe(1);
    expect(restored.ui.buffer).toMatchObject({
      category: 'frontend',
      key: 'unfinished.',
    });
    expect(restored.document).toEqual(draft.document);
    expect(restored.base).toEqual(draft.base);
  });
  it('preserves a corrupted draft and isolates storage keys', () => {
    localStorage.clear();
    localStorage.setItem('broken', '{');
    expect(() => new DraftStorage(localStorage, 'broken').load()).toThrow(
      SyntaxError,
    );
    expect(localStorage.getItem('broken')).toBe('{');
    const a = new DraftStorage(localStorage, 'account-a');
    a.save(value());
    expect(new DraftStorage(localStorage, 'account-b').load()).toBeNull();
  });
  it('does not acknowledge a failed storage write and permits a retry', () => {
    let raw: null | string = null;
    let fail = true;
    const storage = {
      getItem: () => raw,
      setItem: (_: string, value: string) => {
        if (fail) throw new Error('quota');
        raw = value;
      },
    } as unknown as Storage;
    const draft = new DraftStorage(storage, 'draft');
    expect(() => draft.save(value())).toThrow('quota');
    expect(raw).toBeNull();
    fail = false;
    draft.save(value());
    expect(draft.load()?.version).toBe(1);
  });
});
