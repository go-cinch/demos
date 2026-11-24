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

vi.mock('#/store/system-properties', () => ({
  loadSystemProperties: vi.fn().mockResolvedValue(undefined),
}));

const { publicGet, request } = vi.hoisted(() => ({
  publicGet: vi.fn(),
  request: vi.fn(),
}));
vi.mock('#/api/request', () => ({
  authRequestClient: { request },
  authSilentPublicRequestClient: { get: publicGet },
}));
vi.mock('#/api/core/auth', () => ({
  createRegistrationPasswordCredentialApi: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
});

function catalog(
  groups: Record<string, string>,
  order = Object.keys(groups),
): I18nCatalog {
  return {
    schema_version: 2,
    default_locale: 'en-US',
    locales: [{ tag: 'en-US', name: 'English', enabled: true }],
    messages: { 'en-US': { frontend: { groups } } },
    group_order: order,
  };
}

it('updates visible groups with one i18n request per successful save', async () => {
  i18n.global.locale.value = 'en-US';
  const original = { 'admin:old': 'Old' };
  const renamed = { ...original, 'admin:renamed': 'Renamed' };
  publicGet.mockResolvedValueOnce(catalog(original));
  await refreshI18nCatalog();
  expect(publicGet).toHaveBeenCalledOnce();

  publicGet.mockResolvedValueOnce(catalog({ ...original, 'admin:new': 'New' }));
  await createPermissionGroup('admin:new', { 'en-US': 'New' });
  expect(request).toHaveBeenCalledWith('/action/group', {
    method: 'PATCH',
    data: { operation: 'create', word: 'admin:new', names: { 'en-US': 'New' } },
  });
  expect(catalogGroupWords()).toContain('admin:new');
  expect(catalogGroupNames('admin:new')).toEqual({ 'en-US': 'New' });
  expect(publicGet).toHaveBeenCalledTimes(2);

  publicGet.mockResolvedValueOnce(catalog(renamed));
  await savePermissionGroup(
    'admin:renamed',
    { 'en-US': 'Renamed' },
    'admin:new',
  );
  expect(request).toHaveBeenLastCalledWith('/action/group', {
    method: 'PATCH',
    data: {
      operation: 'update',
      original_word: 'admin:new',
      word: 'admin:renamed',
      expected_names: { 'en-US': 'New' },
      names: { 'en-US': 'Renamed' },
    },
  });
  expect(catalogGroupWords()).not.toContain('admin:new');
  expect(catalogGroupNames('admin:renamed')).toEqual({ 'en-US': 'Renamed' });
  expect(publicGet).toHaveBeenCalledTimes(3);

  publicGet.mockResolvedValueOnce(
    catalog(renamed, ['admin:renamed', 'admin:old']),
  );
  await savePermissionGroupOrder(['admin:renamed', 'admin:old']);
  expect(request).toHaveBeenLastCalledWith('/action/group/order', {
    method: 'PATCH',
    data: {
      expected_order: ['admin:old', 'admin:renamed'],
      order: ['admin:renamed', 'admin:old'],
    },
  });
  expect(catalogGroupOrder()).toEqual(['admin:renamed', 'admin:old']);
  expect(publicGet).toHaveBeenCalledTimes(4);

  publicGet.mockResolvedValueOnce(catalog(original));
  await deletePermissionGroup('admin:renamed');
  expect(request).toHaveBeenLastCalledWith('/action/group', {
    method: 'PATCH',
    data: {
      operation: 'delete',
      word: 'admin:renamed',
      expected_names: { 'en-US': 'Renamed' },
    },
  });
  expect(catalogGroupWords()).toEqual(['admin:old']);
  expect(publicGet).toHaveBeenCalledTimes(5);

  request.mockRejectedValueOnce(new Error('offline'));
  await expect(
    createPermissionGroup('admin:failed', { 'en-US': 'Failed' }),
  ).rejects.toThrow('offline');
  expect(catalogGroupWords()).toEqual(['admin:old']);
  expect(publicGet).toHaveBeenCalledTimes(5);

  const conflict = {
    response: { status: 409, data: { error_code: 'ACTION_GROUP_CONFLICT' } },
  };
  request.mockRejectedValueOnce(conflict);
  publicGet.mockResolvedValueOnce(
    catalog({ ...original, 'admin:other': 'Concurrent edit' }),
  );
  await expect(
    createPermissionGroup('admin:failed', { 'en-US': 'Failed' }),
  ).rejects.toBe(conflict);
  expect(publicGet).toHaveBeenCalledTimes(6);
  expect(catalogGroupWords()).toEqual(['admin:old', 'admin:other']);
});
