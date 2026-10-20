import { authRequestClient } from '#/api/request';
import { refreshI18nCatalog } from '#/locales';

import { createRegistrationPasswordCredentialApi } from '../core/auth';

export interface PageParams {
  p?: number;
  s?: number;
  [key: string]: boolean | number | string | undefined;
}

type FieldNames<F extends string> = F extends `${infer First},${infer Rest}`
  ? FieldNames<Rest> | First
  : F;
export type SelectedRecord<T, F extends string> = string extends F
  ? Partial<T>
  : Pick<T, Extract<FieldNames<F>, keyof T>>;

interface ListApi<T> {
  <F extends string>(
    params: PageParams & { f: F },
  ): Promise<PageResult<SelectedRecord<T, F>>>;
  (params?: PageParams): Promise<PageResult<T>>;
}

export interface PageResult<T> {
  items: T[];
  p: number;
  s: number;
  t: number;
}

export interface ActionUI {
  menu_key: string;
  parent_menu_key?: string;
  menu_path: string;
  page_entry: boolean;
  button_keys?: string[];
}
export interface ActionResourceBinding {
  resource_key: string;
  operation: string;
  feature_keys?: null | string[];
}
export interface ActionConfig {
  permission_scopes?: string[];
  permission_scope?: '*';
  bindings?: ActionResourceBinding[];
  resource_key?: string;
  operation?: string;
  resource_keys?: string[];
  feature_keys?: string[];
  builtin?: 'all' | 'default';
  ui: ActionUI[];
  endpoints: { protocol: 'grpc' | 'http'; method: string; path: string }[];
}

export interface ActionRecord {
  names?: Record<string, string>;
  scope?: string;
  config?: ActionConfig;
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

export type ActionSummary = Pick<ActionRecord, 'code' | 'group' | 'name'>;

export interface RoleRecord {
  action_summaries?: ActionSummary[];
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
  last_logged_in_at?: null | number;
  login_count: number;
  metadata: Record<string, unknown>;
  role?: null | RoleRecord;
  role_summary?: null | Pick<RoleRecord, 'id' | 'name' | 'word'>;
  role_id?: null | number;
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
  action_summaries?: ActionSummary[];
  action_codes: string[];
  actions?: ActionRecord[];
  created_at: number;
  id: number;
  name: string;
  updated_at: number;
  users?: UserSummary[];
  member_count?: number;
  member_preview?: UserSummary[];
  word: string;
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
  names?: Record<string, string>;
  config?: ActionConfig;
  button?: string;
  group?: string;
  menu?: string;
  name?: string;
  resource?: string;
  word?: string;
}

export interface RolePayload {
  action_codes?: string[];
  action_bindings?: ActionResourceBinding[];
  name?: string;
  word?: string;
}

export interface UserPayload {
  action_codes?: string[];
  action_bindings?: ActionResourceBinding[];
  metadata?: Record<string, unknown>;
  password?: string;
  role_id?: number;
  status?: 0 | 1 | 2;
  username?: string;
}

interface CreateUserRequest {
  action_codes?: string[];
  action_bindings?: ActionResourceBinding[];
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
  add_user_ids?: number[];
  remove_user_ids?: number[];
  action_codes?: string[];
  action_bindings?: ActionResourceBinding[];
  name?: string;
  user_ids?: number[];
  word?: string;
}



export interface DictionaryPayload {
  expected_value?: unknown;
  group_renames?: Record<string, string>;
  resource_renames?: Record<string, string>;
  feature_renames?: Record<string, string>;
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

export const listActions: ListApi<ActionRecord> = (params: PageParams = {}) =>
  list<ActionRecord>('action', params);
export function getAction<F extends string>(
  id: number,
  params: { f: F },
): Promise<SelectedRecord<ActionRecord, F>>;
export function getAction(id: number): Promise<ActionRecord>;
export function getAction(id: number, params?: { f: string }) {
  return authRequestClient.get<ActionRecord>(`/action/${id}`, {
    params: params ?? {},
  });
}
export const listActionGroups = (keyword = '') =>
  authRequestClient.get<ActionGroupResult>('/action/group', {
    params: keyword ? { keyword } : {},
  });
export const createAction = async (idempotencyKey: string, data: ActionPayload) => {
  const record = await create<ActionRecord, ActionPayload>('action', idempotencyKey, data);
  await refreshI18nCatalog();
  return record;
};
export const updateAction = async (id: number, data: ActionPayload) => {
  const record = await update<ActionRecord, ActionPayload>('action', id, data);
  await refreshI18nCatalog();
  return record;
};
export const deleteActions = (ids: number[]) => remove('action', ids);

export const listRoles: ListApi<RoleRecord> = (params: PageParams = {}) =>
  list<RoleRecord>('role', params);
export const createRole = (idempotencyKey: string, data: RolePayload) =>
  create<RoleRecord, RolePayload>('role', idempotencyKey, data);
export const updateRole = (id: number, data: RolePayload) =>
  update<RoleRecord, RolePayload>('role', id, data);
export const deleteRoles = (ids: number[]) => remove('role', ids);

export const listUsers: ListApi<UserRecord> = (params: PageParams = {}) =>
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
    action_bindings: data.action_bindings,
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

const groupFields = 'actions,member_count,member_preview';
export const listUserGroups: ListApi<UserGroupRecord> = (
  params: PageParams = {},
) => list<UserGroupRecord>('user-group', { f: groupFields, ...params });
export const listUserGroupMembers = (id: number, params: PageParams = {}) =>
  authRequestClient.get<PageResult<UserSummary>>(`/user-group/${id}/member`, {
    params,
  });
export const createUserGroup = (
  idempotencyKey: string,
  data: UserGroupPayload,
) =>
  authRequestClient.post<UserGroupRecord>('/user-group', data, {
    headers: { 'x-idempotent': idempotencyKey },
    params: { f: groupFields },
  });
export const updateUserGroup = (id: number, data: UserGroupPayload) =>
  authRequestClient.request<UserGroupRecord>(`/user-group/${id}`, {
    data,
    method: 'PATCH',
    params: { f: groupFields },
  });
export const deleteUserGroups = (ids: number[]) => remove('user-group', ids);






export const listDictionaries: ListApi<DictionaryRecord> = (
  params: PageParams = {},
) => list<DictionaryRecord>('dictionary', params);
export const createDictionary = (
  idempotencyKey: string,
  data: DictionaryPayload,
) =>
  create<DictionaryRecord, DictionaryPayload>(
    'dictionary',
    idempotencyKey,
    data,
  );
export const updateDictionary = async (id: number, data: DictionaryPayload) => {
  const result = await update<DictionaryRecord, DictionaryPayload>(
    'dictionary',
    id,
    data,
  );
  if (result.key === 'I18N_CATALOG') await refreshI18nCatalog();
  return result;
};
export const deleteDictionaries = (ids: number[]) => remove('dictionary', ids);

// Details and editors hydrate independently of a sparse list row.
export const systemDetailFields: Record<string, string> = {
  action: 'id,created_at,updated_at,code,name,names,group,word,scope,config,resource,menu,button',
  role: 'id,created_at,updated_at,name,word,action_codes,actions',
  user: 'id,created_at,updated_at,username,code,role_id,role_summary,last_logged_in_at,login_count,status,metadata,wrong,action_codes,actions',
  'user-group': groupFields,
};

export function getSystemRecord<T>(resource: string, id: number) {
  const fields = systemDetailFields[resource];
  return authRequestClient.get<T>(`/${resource}/${id}`, {
    params: fields ? { f: fields } : {},
  });
}

export interface ResourceEntry {
  path: string;
  parent_menu_key?: string;
}
export interface ResourceOperation {
  entry_keys: string[];
  button_keys: string[];
}
export interface ResourceChildOrder {
  kind: 'node' | 'reference';
  key: string;
}
export interface ResourceNode {
  permission_group?: string;
  permission_scope?: '*';
  frontend_visible?: boolean;
  child_order?: ResourceChildOrder[];
  kind: 'directory' | 'resource';
  parent?: string;
  references?: string[];
  reference_operations?: Record<string, string[]>;
  sort: number;
  entries?: Record<string, ResourceEntry>;
  operations?: Record<string, ResourceOperation>;
}
export interface ResourceFeature {
  permission_resource?: string;
  entry_keys?: string[];
  btn: string[];
  http: { method: string; path: string }[];
  grpc: string[];
}
export interface ResourceCatalog {
  resources: Record<string, ResourceNode>;
  buttons: Record<string, ResourceFeature>;
}
export interface PermissionCatalog {
  defined_actions?: { id: number; word: string }[];
  scopes: string[];
  operations: string[];
  resource_catalog: ResourceCatalog;
}
export interface EffectivePermissionPaths {
  scope: string;
  btn: string[];
  http: { method: string; path: string }[];
  grpc: string[];
}
export const getPermissionCatalog = (fields = 'scopes,operations,resource_catalog,defined_actions') =>
  authRequestClient.get<PermissionCatalog>('/action/catalog', {
    params: { f: fields },
  });
/** Query scope selects the inspection target; X-Auth-Scope authorizes the request. */
export const getEffectivePermissionPaths = (scope: string) =>
  authRequestClient.get<EffectivePermissionPaths>('/action/effective', {
    params: { scope, f: 'btn,http,grpc' },
  });
