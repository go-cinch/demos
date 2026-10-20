import { describe, expect, it } from 'vitest';

import {
  applyGroupOrder,
  changePermissionGroup,
  cleanGroupCatalog,
  groupNames,
  groupWords,
  isPermissionGroupType,
  legacyGroupRenames,
  pendingGroupRenames,
  recordGroupRename,
  removePermissionGroup,
} from './action-group-model';

function catalog() {
  return {
    default_locale: 'en-US',
    locales: [
      { tag: 'en-US', name: 'English', enabled: true },
      { tag: 'zh-CN', name: '中文', enabled: true },
    ],
    messages: {
      'en-US': {
        frontend: {
          groups: { 'admin:people': 'People', 'admin:audit': 'Audit' },
          other: 'Keep',
        },
      },
      'zh-CN': { frontend: { groups: { 'admin:people': '人员' } } },
    },
    group_order: ['admin:people', 'admin:audit'],
    group_defaults: { 'admin:people': true, 'admin:unused': false },
    group_aliases: { retired: 'admin:people' },
  };
}

describe('permission group catalog editing', () => {
  it('collects multilingual groups and preserves absent translations as empty', () => {
    expect(groupWords(catalog())).toEqual(['admin:people', 'admin:audit']);
    expect(groupNames(catalog(), 'admin:audit')).toEqual({
      'en-US': 'Audit',
      'zh-CN': '',
    });
  });

  it('renames labels, ordering and defaults without mutating its source', () => {
    const source = catalog();
    const before = structuredClone(source);
    const next = changePermissionGroup(
      source,
      'admin:people',
      'admin:accounts',
      { 'en-US': ' Accounts ' },
    );
    expect(groupNames(next, 'admin:accounts')).toEqual({
      'en-US': 'Accounts',
      'zh-CN': '人员',
    });
    expect(groupWords(next)).not.toContain('admin:people');
    expect(next.group_order).toEqual(['admin:accounts', 'admin:audit']);
    expect(next.group_defaults).toEqual({ 'admin:accounts': true });
    expect(next).not.toHaveProperty('group_aliases');
    expect(next.messages['en-US'].frontend.other).toBe('Keep');
    expect(source).toEqual(before);
  });

  it('clears an optional translation and removes false defaults instead of retaining tombstones', () => {
    const next = changePermissionGroup(
      catalog(),
      'admin:people',
      'admin:people',
      { 'zh-CN': '  ' },
      false,
    );
    expect(groupNames(next, 'admin:people')).toEqual({
      'en-US': 'People',
      'zh-CN': '',
    });
    expect(next).not.toHaveProperty('group_defaults');
    expect(cleanGroupCatalog(catalog()).group_defaults).toEqual({
      'admin:people': true,
    });
  });

  it('appends a new group once and removes it from every locale, order and defaults', () => {
    const added = changePermissionGroup(
      catalog(),
      undefined,
      'admin:new',
      { 'en-US': 'New' },
      true,
    );
    expect(added.group_order).toEqual([
      'admin:people',
      'admin:audit',
      'admin:new',
    ]);
    expect(added.group_defaults).toHaveProperty('admin:new', true);
    const removed = removePermissionGroup(added, 'admin:new');
    expect(groupWords(removed)).not.toContain('admin:new');
    expect(removed.group_order).toEqual(['admin:people', 'admin:audit']);
    expect(removed.group_defaults).toEqual({ 'admin:people': true });
  });

  it('rejects a duplicate identifier, missing default name and stale language fields', () => {
    expect(() =>
      changePermissionGroup(catalog(), undefined, 'admin:audit', {
        'en-US': 'Duplicate',
      }),
    ).toThrow('groupExists');
    expect(() =>
      changePermissionGroup(catalog(), undefined, 'admin:new', {
        'zh-CN': '新增',
      }),
    ).toThrow('groupLanguagesChanged');
    expect(() =>
      changePermissionGroup(catalog(), 'admin:people', 'admin:people', {
        'en-US': ' ',
      }),
    ).toThrow('groupLanguagesChanged');
    expect(() =>
      changePermissionGroup(catalog(), 'admin:people', 'admin:people', {
        'fr-FR': 'Personnes',
      }),
    ).toThrow('groupLanguagesChanged');
  });

  it('collapses rename chains and submits only changes to persisted identifiers', () => {
    const base = catalog();
    const next = changePermissionGroup(
      base,
      'admin:people',
      'admin:accounts',
      {},
    );
    const renames = recordGroupRename(
      recordGroupRename({}, 'admin:people', 'admin:intermediate'),
      'admin:intermediate',
      'admin:accounts',
    );
    expect(pendingGroupRenames(base, next, renames)).toEqual({
      'admin:people': 'admin:accounts',
    });
    const restored = changePermissionGroup(
      next,
      'admin:accounts',
      'admin:people',
      {},
    );
    expect(
      pendingGroupRenames(
        base,
        restored,
        recordGroupRename(renames, 'admin:accounts', 'admin:people'),
      ),
    ).toEqual({});
    const legacyDocument = {
      ...next,
      group_aliases: { 'admin:people': 'admin:accounts', bad: 1 },
    };
    expect(legacyGroupRenames(base, legacyDocument)).toEqual({
      'admin:people': 'admin:accounts',
    });
  });

  it('ignores unknown or repeated ordering entries while retaining new groups', () => {
    const groups = [
      { name: 'a', count: 1 },
      { name: 'b', count: 2 },
      { name: 'c', count: 3 },
    ];
    expect(applyGroupOrder(groups, ['gone', 'b', 'b'])).toEqual([
      groups[1],
      groups[0],
      groups[2],
    ]);
    expect(groups.map((group) => group.name)).toEqual(['a', 'b', 'c']);
  });

  it.each([0, 1, 2, 3, -1, '1', null, undefined])(
    'validates group type %s without coercion',
    (value) => {
      expect(isPermissionGroupType(value)).toBe(
        value === 0 || value === 1 || value === 2,
      );
    },
  );
});
