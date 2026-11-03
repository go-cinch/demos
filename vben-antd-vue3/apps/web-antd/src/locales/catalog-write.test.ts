import type { I18nCatalog } from './catalog';

import { i18n } from '@vben/locales';

import { afterEach, expect, it, vi } from 'vitest';

import {
  createPermissionGroup,
  deletePermissionGroup,
  savePermissionGroup,
  savePermissionGroupOrder,
} from '../views/system/components/action-groups';
import {
  catalogGroupNames,
  catalogGroupOrder,
  catalogGroupWords,
  refreshI18nCatalog,
} from './catalog';

const transport = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn() }));
vi.mock('#/api/request', () => ({ authRequestClient: transport }));
vi.mock('#/api/core/auth', () => ({ createRegistrationPasswordCredentialApi: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('updates visible groups with one i18n request per successful save', async () => {
  i18n.global.locale.value = 'en-US';
  let stored: I18nCatalog = {
    schema_version: 2,
    default_locale: 'en-US',
    locales: [{ tag: 'en-US', name: 'English', enabled: true }],
    messages: { 'en-US': { frontend: { groups: { 'admin:old': 'Old' } } } },
    group_order: ['admin:old'],
  };
  const record = () => ({ id: 7, key: 'I18N_CATALOG', enabled: true, value: structuredClone(stored) });
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => structuredClone(stored) }));
  vi.stubGlobal('fetch', fetcher);
  transport.get.mockImplementation(async () => ({ items: [record()] }));
  transport.request.mockImplementation(async (_url: string, config: { data: { value: I18nCatalog } }) => {
    stored = structuredClone(config.data.value);
    return record();
  });

  await refreshI18nCatalog();
  expect(fetcher).toHaveBeenCalledOnce();

  await createPermissionGroup('admin:new', { 'en-US': 'New' });
  expect(catalogGroupWords()).toContain('admin:new');
  expect(catalogGroupNames('admin:new')).toEqual({ 'en-US': 'New' });
  expect(fetcher).toHaveBeenCalledTimes(2);

  await savePermissionGroup('admin:renamed', { 'en-US': 'Renamed' }, 'admin:new');
  expect(catalogGroupWords()).not.toContain('admin:new');
  expect(catalogGroupNames('admin:renamed')).toEqual({ 'en-US': 'Renamed' });
  expect(fetcher).toHaveBeenCalledTimes(3);

  await savePermissionGroupOrder(['admin:renamed', 'admin:old']);
  expect(catalogGroupOrder()).toEqual(['admin:renamed', 'admin:old']);
  expect(fetcher).toHaveBeenCalledTimes(4);

  await deletePermissionGroup('admin:renamed');
  expect(catalogGroupWords()).toEqual(['admin:old']);
  expect(fetcher).toHaveBeenCalledTimes(5);

  transport.request.mockRejectedValueOnce(new Error('conflict'));
  await expect(createPermissionGroup('admin:failed', { 'en-US': 'Failed' })).rejects.toThrow('conflict');
  expect(catalogGroupWords()).toEqual(['admin:old']);
  expect(fetcher).toHaveBeenCalledTimes(5);
});
