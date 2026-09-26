import { authRequestClient } from '#/api/request';

import { createRegistrationPasswordCredentialApi } from '../core/auth';

export interface PageParams {
  p?: number;
  s?: number;
  [key: string]: boolean | number | string | undefined;
}

export interface PageResult<T> {
  items: T[];
  p: number;
  s: number;
  t: number;
}

export interface ActionRecord {
  button: string;
  code: string;
  created_at: number;
  group: string;
  id: number;
  menu: string;
  name: string;
  resource: string;
  updated_at: number;
  word: string;
}

export interface ActionGroupResult {
  items: string[];
}

export interface RoleRecord {
  action_codes: string[];
  actions: ActionRecord[];
  created_at: number;
  id: number;
  name: string;
  updated_at: number;
  word: string;
}

export interface UserRecord {
  action_codes: string[];
  actions: ActionRecord[];
  code: string;
  created_at: number;
  id: number;
  last_logged_in_at?: number;
  login_count: number;
  metadata: Record<string, unknown>;
  role?: RoleRecord;
  role_id?: number;
  status: 0 | 1 | 2;
  updated_at: number;
  username: string;
  wrong: number;
}

export interface UserSummary {
  code: string;
  id: number;
  username: string;
}

export interface UserGroupRecord {
  action_codes: string[];
  actions: ActionRecord[];
  created_at: number;
  id: number;
  name: string;
  updated_at: number;
  users: UserSummary[];
  word: string;
}

export interface WhitelistRecord {
  category: 0 | 1;
  created_at: number;
  id: number;
  resource: string;
  updated_at: number;
}

export interface DictionaryRecord {
  created_at: number;
  description: string;
  enabled: boolean;
  id: number;
  key: string;
  name: string;
  updated_at: number;
  value: unknown;
}

export interface ActionPayload {
  button?: string;
  group?: string;
  menu?: string;
  name?: string;
  resource?: string;
  word?: string;
}

export interface RolePayload {
  action_codes?: string[];
  name?: string;
  word?: string;
}

export interface UserPayload {
  action_codes?: string[];
  metadata?: Record<string, unknown>;
  password?: string;
  role_id?: number;
  status?: 0 | 1 | 2;
  username?: string;
}

interface CreateUserRequest {
  action_codes?: string[];
  challenge_id: string;
  credential: string;
  metadata?: Record<string, unknown>;
  role_id?: number;
  username: string;
}

interface UpdateUserRequest extends Omit<UserPayload, 'password'> {
  challenge_id?: string;
  credential?: string;
}

export interface UserGroupPayload {
  action_codes?: string[];
  name?: string;
  user_ids?: number[];
  word?: string;
}

export interface WhitelistPayload {
  category?: 0 | 1;
  resource?: string;
}

export interface DictionaryPayload {
  description?: string;
  enabled?: boolean;
  key?: string;
  name?: string;
  value?: unknown;
}

function list<T>(resource: string, params: PageParams) {
  return authRequestClient.get<PageResult<T>>(`/${resource}`, { params });
}

function create<T, P>(resource: string, idempotencyKey: string, data: P) {
  return authRequestClient.post<T>(`/${resource}`, data, {
    headers: { 'x-idempotent': idempotencyKey },
  });
}

function update<T, P>(resource: string, id: number, data: P) {
  return authRequestClient.request<T>(`/${resource}/${id}`, {
    data,
    method: 'PATCH',
  });
}

async function remove(resource: string, ids: number[]) {
  await authRequestClient.delete<unknown>(`/${resource}/${ids.join(',')}`);
}

export const listActions = (params: PageParams = {}) =>
  list<ActionRecord>('action', params);
export const listActionGroups = (keyword = '') =>
  authRequestClient.get<ActionGroupResult>('/action/group', {
    params: keyword ? { keyword } : {},
  });
export const createAction = (idempotencyKey: string, data: ActionPayload) =>
  create<ActionRecord, ActionPayload>('action', idempotencyKey, data);
export const updateAction = (id: number, data: ActionPayload) =>
  update<ActionRecord, ActionPayload>('action', id, data);
export const deleteActions = (ids: number[]) => remove('action', ids);

export const listRoles = (params: PageParams = {}) =>
  list<RoleRecord>('role', params);
export const createRole = (idempotencyKey: string, data: RolePayload) =>
  create<RoleRecord, RolePayload>('role', idempotencyKey, data);
export const updateRole = (id: number, data: RolePayload) =>
  update<RoleRecord, RolePayload>('role', id, data);
export const deleteRoles = (ids: number[]) => remove('role', ids);

export const listUsers = (params: PageParams = {}) =>
  list<UserRecord>('user', params);
export const createUser = async (idempotencyKey: string, data: UserPayload) => {
  const username = data.username?.trim();
  if (!username || !data.password) {
    throw new TypeError('Username and password are required');
  }
  const encrypted = await createRegistrationPasswordCredentialApi(
    data.password,
  );
  const request: CreateUserRequest = {
    action_codes: data.action_codes,
    metadata: data.metadata,
    role_id: data.role_id,
    username,
    ...encrypted,
  };
  return create<UserRecord, CreateUserRequest>('user', idempotencyKey, request);
};
export const updateUser = async (id: number, data: UserPayload) => {
  const { password, ...fields } = data;
  let request: UpdateUserRequest = fields;
  if (password) {
    const encrypted = await createRegistrationPasswordCredentialApi(password);
    request = { ...fields, ...encrypted };
  }
  return update<UserRecord, UpdateUserRequest>('user', id, request);
};
export const deleteUsers = (ids: number[]) => remove('user', ids);

export const listUserGroups = (params: PageParams = {}) =>
  list<UserGroupRecord>('user-group', params);
export const createUserGroup = (
  idempotencyKey: string,
  data: UserGroupPayload,
) =>
  create<UserGroupRecord, UserGroupPayload>('user-group', idempotencyKey, data);
export const updateUserGroup = (id: number, data: UserGroupPayload) =>
  update<UserGroupRecord, UserGroupPayload>('user-group', id, data);
export const deleteUserGroups = (ids: number[]) => remove('user-group', ids);

export const listWhitelists = (params: PageParams = {}) =>
  list<WhitelistRecord>('whitelist', params);
export const createWhitelist = (
  idempotencyKey: string,
  data: WhitelistPayload,
) =>
  create<WhitelistRecord, WhitelistPayload>('whitelist', idempotencyKey, data);
export const updateWhitelist = (id: number, data: WhitelistPayload) =>
  update<WhitelistRecord, WhitelistPayload>('whitelist', id, data);
export const deleteWhitelists = (ids: number[]) => remove('whitelist', ids);

export const listDictionaries = (params: PageParams = {}) =>
  list<DictionaryRecord>('dictionary', params);
export const createDictionary = (
  idempotencyKey: string,
  data: DictionaryPayload,
) =>
  create<DictionaryRecord, DictionaryPayload>(
    'dictionary',
    idempotencyKey,
    data,
  );
export const updateDictionary = (id: number, data: DictionaryPayload) =>
  update<DictionaryRecord, DictionaryPayload>('dictionary', id, data);
export const deleteDictionaries = (ids: number[]) => remove('dictionary', ids);
