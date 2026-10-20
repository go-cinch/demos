import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createAction,
  createDictionary,
  createRole,
  createUser,
  deleteActions,
  deleteDictionaries,
  deleteRoles,
  deleteUserGroups,
  deleteUsers,
  getAction,
  getEffectivePermissionPaths,
  getPermissionCatalog,
  getSystemRecord,
  listActionGroups,
  listActions,
  listDictionaries,
  listRoles,
  listUserGroups,
  listUsers,
  systemDetailFields,
  updateAction,
  updateDictionary,
  updateRole,
  updateUser,
} from './index';

const {
  createRegistrationPasswordCredentialApi,
  get,
  post,
  refreshI18nCatalog,
  remove,
  request,
} = vi.hoisted(() => ({
  createRegistrationPasswordCredentialApi: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  refreshI18nCatalog: vi.fn(),
  remove: vi.fn(),
  request: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  authRequestClient: {
    get,
    post,
    delete: remove,
    request,
  },
}));

vi.mock('../core/auth', () => ({
  createRegistrationPasswordCredentialApi,
}));
vi.mock('#/locales', () => ({ refreshI18nCatalog }));

beforeEach(() => vi.resetAllMocks());

describe('action detail API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the selected fields and returns only their declared types', async () => {
    const response = { id: 7, names: { 'en-US': 'Read users' } };
    get.mockResolvedValue(response);

    const record = await getAction(7, { f: 'id,names' });

    expect(get).toHaveBeenCalledWith('/action/7', {
      params: { f: 'id,names' },
    });
    expect(record).toEqual(response);
    expectTypeOf(record).toEqualTypeOf<{
      id: number;
      names?: Record<string, string>;
    }>();
  });

  it('preserves the full response contract when f is omitted', async () => {
    get.mockResolvedValue({ id: 7 });
    await getAction(7);
    expect(get).toHaveBeenCalledWith('/action/7', { params: {} });
  });
});

describe('listActionGroups', () => {
  it('queries the dedicated action group endpoint', async () => {
    get.mockResolvedValue({ items: ['User'] });

    await expect(listActionGroups('user')).resolves.toEqual({
      items: ['User'],
    });
    expect(get).toHaveBeenCalledWith('/action/group', {
      params: { keyword: 'user' },
    });
  });
});

describe('dictionary API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the dictionary CRUD endpoints with arbitrary JSON values', async () => {
    get.mockResolvedValue({ items: [], p: 1, s: 10, t: 0 });
    post.mockResolvedValue({ id: 1 });
    request.mockResolvedValue({ id: 1 });
    remove.mockResolvedValue(undefined);

    await listDictionaries({ key: 'POINT_CAPTCHA', p: 1, s: 10 });
    expect(get).toHaveBeenCalledWith('/dictionary', {
      params: { key: 'POINT_CAPTCHA', p: 1, s: 10 },
    });

    const payload = {
      enabled: true,
      key: 'POINT_CAPTCHA_TEST',
      name: 'Captcha test',
      value: ['A', 'B'],
    };
    await createDictionary('idempotency-key', payload);
    expect(post).toHaveBeenCalledWith('/dictionary', payload, {
      headers: { 'x-idempotent': 'idempotency-key' },
    });

    await updateDictionary(1, { value: { enabled: false } });
    expect(request).toHaveBeenCalledWith('/dictionary/1', {
      data: { value: { enabled: false } },
      method: 'PATCH',
    });

    await deleteDictionaries([1, 2]);
    expect(remove).toHaveBeenCalledWith('/dictionary/1,2');
  });
});

describe('createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRegistrationPasswordCredentialApi.mockResolvedValue({
      challenge_id: 'challenge-id',
      credential: 'encrypted-credential',
    });
    post.mockResolvedValue({ id: 1 });
    request.mockResolvedValue({ id: 1 });
  });

  it('encrypts credentials and posts the user fields to /user', async () => {
    await createUser('idempotency-key', {
      action_codes: ['ABCDEFGH'],
      metadata: { source: 'admin' },
      password: 'secret1',
      role_id: 2,
      status: 0,
      username: ' operator ',
    });

    expect(createRegistrationPasswordCredentialApi).toHaveBeenCalledWith(
      'secret1',
    );
    expect(post).toHaveBeenCalledWith(
      '/user',
      {
        action_codes: ['ABCDEFGH'],
        challenge_id: 'challenge-id',
        credential: 'encrypted-credential',
        metadata: { source: 'admin' },
        role_id: 2,
        username: 'operator',
      },
      { headers: { 'x-idempotent': 'idempotency-key' } },
    );
    const requestBody = post.mock.calls[0]?.[1];
    expect(requestBody).toHaveProperty('username', 'operator');
    expect(requestBody).not.toHaveProperty('password');
    expect(requestBody).not.toHaveProperty('status');
  });

  it('rejects missing plaintext credentials before requesting a challenge', async () => {
    await expect(createUser('idempotency-key', {})).rejects.toThrow(
      'Username and password are required',
    );
    expect(createRegistrationPasswordCredentialApi).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('updateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRegistrationPasswordCredentialApi.mockResolvedValue({
      challenge_id: 'challenge-id',
      credential: 'encrypted-credential',
    });
    request.mockResolvedValue({ id: 1 });
  });

  it('encrypts a changed password before patching the user', async () => {
    await updateUser(7, {
      password: 'secret2',
      role_id: 2,
      username: 'operator',
    });

    expect(createRegistrationPasswordCredentialApi).toHaveBeenCalledWith(
      'secret2',
    );
    expect(request).toHaveBeenCalledWith('/user/7', {
      data: {
        challenge_id: 'challenge-id',
        credential: 'encrypted-credential',
        role_id: 2,
        username: 'operator',
      },
      method: 'PATCH',
    });
    expect(request.mock.calls[0]?.[1]?.data).not.toHaveProperty('password');
  });

  it('patches non-password fields without requesting a challenge', async () => {
    await updateUser(7, { password: '', status: 1 });

    expect(createRegistrationPasswordCredentialApi).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith('/user/7', {
      data: { status: 1 },
      method: 'PATCH',
    });
    expect(request.mock.calls[0]?.[1]?.data).not.toHaveProperty('password');
  });
});

describe('bounded user group requests', () => {
  it('selects lightweight fields on list, create and update, and pages members separately', async () => {
    const {
      listUserGroups,
      listUserGroupMembers,
      createUserGroup,
      updateUserGroup,
    } = await import('./index');
    const f = 'actions,member_count,member_preview';
    await listUserGroups({ p: 1, s: 20 });
    expect(get).toHaveBeenLastCalledWith('/user-group', {
      params: { p: 1, s: 20, f },
    });
    await listUserGroupMembers(7, { p: 2, s: 20, q: 'reader' });
    expect(get).toHaveBeenLastCalledWith('/user-group/7/member', {
      params: { p: 2, s: 20, q: 'reader' },
    });
    await createUserGroup('create-group', {
      name: 'Group',
      word: 'group',
      user_ids: [],
    });
    expect(post).toHaveBeenLastCalledWith(
      '/user-group',
      { name: 'Group', word: 'group', user_ids: [] },
      { headers: { 'x-idempotent': 'create-group' }, params: { f } },
    );
    await updateUserGroup(7, { add_user_ids: [1001], remove_user_ids: [1] });
    expect(request).toHaveBeenLastCalledWith('/user-group/7', {
      data: { add_user_ids: [1001], remove_user_ids: [1] },
      method: 'PATCH',
      params: { f },
    });
  });
});

describe('management resource contracts', () => {
  it.each([
    ['action', listActions],
    ['role', listRoles],
    ['user', listUsers],
    ['dictionary', listDictionaries],
    ['user-group', listUserGroups],
  ] as const)(
    'forwards sparse fields and exact filters for %s',
    async (resource, load) => {
      const params = { f: 'id,name', p: 2, s: 20, q: 'reader', enabled: false };
      const response = { items: [{ id: 7 }], p: 2, s: 20, t: 1 };
      get.mockResolvedValue(response);
      await expect(load(params)).resolves.toBe(response);
      expect(get).toHaveBeenCalledWith(`/${resource}`, { params });
    },
  );

  it.each([
    ['action', deleteActions],
    ['role', deleteRoles],
    ['user', deleteUsers],
    ['dictionary', deleteDictionaries],
    ['user-group', deleteUserGroups],
  ] as const)(
    'deletes selected %s records with service-internal paths',
    async (resource, removeRecords) => {
      await removeRecords([7, 9]);
      expect(remove).toHaveBeenCalledExactlyOnceWith(`/${resource}/7,9`);
    },
  );

  it('preserves explicit assignment clearing and bindings when saving roles', async () => {
    const payload = {
      name: 'Reader',
      action_codes: [],
      action_bindings: [
        {
          resource_key: 'admin:system:user',
          operation: 'read',
          feature_keys: [],
        },
      ],
    };
    await createRole('role-once', payload);
    expect(post).toHaveBeenCalledWith('/role', payload, {
      headers: { 'x-idempotent': 'role-once' },
    });
    await updateRole(7, payload);
    expect(request).toHaveBeenCalledWith('/role/7', {
      method: 'PATCH',
      data: payload,
    });
    expect(refreshI18nCatalog).not.toHaveBeenCalled();
  });

  it('hydrates sparse rows through detail endpoints, with bounded group fields', async () => {
    await getSystemRecord('user', 7);
    expect(get).toHaveBeenLastCalledWith('/user/7', { params: { f: systemDetailFields.user } });
    expect(systemDetailFields.user!.split(',')).toContain('role_summary');
    expect(systemDetailFields.user!.split(',')).not.toContain('role');
    await getSystemRecord('role', 9);
    expect(get).toHaveBeenLastCalledWith('/role/9', { params: { f: systemDetailFields.role } });
    await getSystemRecord('dictionary', 3);
    expect(get).toHaveBeenLastCalledWith('/dictionary/3', { params: {} });
    await getSystemRecord('user-group', 8);
    expect(get).toHaveBeenLastCalledWith('/user-group/8', {
      params: { f: 'actions,member_count,member_preview' },
    });
  });

  it('keeps inspection scope in the query and allows compact catalog field selection', async () => {
    await getPermissionCatalog();
    expect(get).toHaveBeenLastCalledWith('/action/catalog', {
      params: { f: 'scopes,operations,resource_catalog,defined_actions' },
    });
    await getPermissionCatalog('scopes,resource_catalog');
    expect(get).toHaveBeenLastCalledWith('/action/catalog', {
      params: { f: 'scopes,resource_catalog' },
    });
    await getEffectivePermissionPaths('mini');
    expect(get).toHaveBeenLastCalledWith('/action/effective', {
      params: { scope: 'mini', f: 'btn,http,grpc' },
    });
    await listActionGroups();
    expect(get).toHaveBeenLastCalledWith('/action/group', { params: {} });
  });

  it('refreshes translated definitions only after successful writes', async () => {
    const record = { id: 7, name: 'Read users' };
    post.mockResolvedValue(record);
    request.mockResolvedValue(record);
    await expect(
      createAction('action-once', { name: record.name }),
    ).resolves.toBe(record);
    await expect(
      updateAction(7, { names: { 'en-US': 'Users' } }),
    ).resolves.toBe(record);
    expect(refreshI18nCatalog).toHaveBeenCalledTimes(2);
    request.mockResolvedValue({ id: 3, key: 'I18N_CATALOG' });
    const update = {
      value: { locales: [] },
      expected_value: { locales: ['en-US'] },
      group_renames: { old: 'new' },
      resource_renames: { a: 'b' },
      feature_renames: { x: 'y' },
    };
    await updateDictionary(3, update);
    expect(request).toHaveBeenLastCalledWith('/dictionary/3', {
      method: 'PATCH',
      data: update,
    });
    expect(refreshI18nCatalog).toHaveBeenCalledTimes(3);
    request.mockRejectedValue(new Error('conflict'));
    await expect(updateDictionary(3, update)).rejects.toThrow('conflict');
    await expect(updateAction(7, {})).rejects.toThrow('conflict');
    expect(refreshI18nCatalog).toHaveBeenCalledTimes(3);
  });

  it('does not create or update a user if credential encryption fails', async () => {
    createRegistrationPasswordCredentialApi.mockRejectedValue(
      new Error('challenge failed'),
    );
    await expect(
      createUser('once', { username: 'reader', password: 'secret' }),
    ).rejects.toThrow('challenge failed');
    await expect(updateUser(7, { password: 'secret' })).rejects.toThrow(
      'challenge failed',
    );
    expect(post).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
