import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDictionary,
  createUser,
  deleteDictionaries,
  listActionGroups,
  listDictionaries,
  updateDictionary,
  updateUser,
} from './index';

const { createRegistrationPasswordCredentialApi, get, post, remove, request } =
  vi.hoisted(() => ({
    createRegistrationPasswordCredentialApi: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
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
