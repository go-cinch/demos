import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPermissionGroup,
  deletePermissionGroup,
  savePermissionGroup,
  savePermissionGroupOrder,
} from './action-groups';

const api = vi.hoisted(() => ({
  listDictionaries: vi.fn(),
  updateDictionary: vi.fn(),
}));
vi.mock('#/api/system', () => api);
const catalog = () => ({
  schema_version: 2,
  default_locale: 'en-US',
  locales: [{ tag: 'en-US', name: 'English', enabled: true }],
  messages: { 'en-US': { frontend: { groups: { 'admin:old': 'Old' } } } },
  group_order: ['admin:old'],
});
beforeEach(() => vi.resetAllMocks());

describe('permission group persistence', () => {
  it('renames against a freshly loaded version with an atomic expected value', async () => {
    const value = catalog();
    api.listDictionaries.mockResolvedValue({
      items: [{ id: 7, key: 'I18N_CATALOG', enabled: true, value }],
    });
    await savePermissionGroup('admin:new', { 'en-US': 'New' }, 'admin:old');
    expect(api.listDictionaries).toHaveBeenCalledWith({
      key: 'I18N_CATALOG',
      p: 1,
      s: 100,
      f: 'id,key,value,enabled,updated_at',
    });
    expect(api.updateDictionary).toHaveBeenCalledWith(7, {
      expected_value: value,
      group_renames: { 'admin:old': 'admin:new' },
      value: {
        ...value,
        group_order: ['admin:new'],
        messages: { 'en-US': { frontend: { groups: { 'admin:new': 'New' } } } },
      },
    });
    expect(value.messages['en-US'].frontend.groups).toEqual({
      'admin:old': 'Old',
    });
  });

  it('creates, deletes and orders groups without sending spurious renames', async () => {
    const value = catalog();
    api.listDictionaries.mockResolvedValue({
      items: [{ id: 7, key: 'I18N_CATALOG', enabled: true, value }],
    });
    await createPermissionGroup('admin:new', { 'en-US': 'New' });
    expect(api.updateDictionary.mock.calls[0]![1]).not.toHaveProperty(
      'group_renames',
    );
    await deletePermissionGroup('admin:old');
    expect(api.updateDictionary).toHaveBeenLastCalledWith(7, {
      expected_value: value,
      value: {
        ...value,
        group_order: [],
        messages: { 'en-US': { frontend: { groups: {} } } },
      },
    });
    await savePermissionGroupOrder(['admin:new', 'admin:new']);
    expect(api.updateDictionary).toHaveBeenLastCalledWith(7, {
      expected_value: value,
      value: { ...value, group_order: ['admin:new', 'admin:old'] },
    });
  });

  it.each(['missing', 'disabled', 'old-schema', 'empty-locales'] as const)(
    'blocks writes for a %s catalog',
    async (kind) => {
      const record = {
        id: 7,
        key: 'I18N_CATALOG',
        enabled: kind !== 'disabled',
        value: {
          ...catalog(),
          ...(kind === 'old-schema' ? { schema_version: 1 } : {}),
          ...(kind === 'empty-locales' ? { locales: [] } : {}),
        },
      };
      api.listDictionaries.mockResolvedValue({
        items: kind === 'missing' ? [] : [record],
      });
      await expect(
        createPermissionGroup('admin:new', { 'en-US': 'New' }),
      ).rejects.toThrow('groupCatalogUnavailable');
      expect(api.updateDictionary).not.toHaveBeenCalled();
    },
  );

  it('propagates version conflicts so the editor can preserve its draft', async () => {
    api.listDictionaries.mockResolvedValue({
      items: [{ id: 7, key: 'I18N_CATALOG', enabled: true, value: catalog() }],
    });
    api.updateDictionary.mockRejectedValue(new Error('version conflict'));
    await expect(deletePermissionGroup('admin:old')).rejects.toThrow(
      'version conflict',
    );
    expect(api.updateDictionary).toHaveBeenCalledOnce();
  });
});
