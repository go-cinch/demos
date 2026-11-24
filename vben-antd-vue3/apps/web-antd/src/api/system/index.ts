import type {
  RequestErrorFeedback,
  ServiceRequestConfig,
} from '#/api/request-types';

import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { authRequestClient } from '#/api/request';
import { quietRequest } from '#/api/request-types';
import { refreshI18nCatalog } from '#/locales/catalog';

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
  email?: null | string;
  permission_sources?: UserPermissionSource[];
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

export interface UserPermissionSource {
  kind: 'direct' | 'group' | 'role';
  id: number;
  name: string;
  action_codes: string[];
  actions: Pick<ActionRecord, 'code' | 'config' | 'word'>[];
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

export interface UpdateUserPayload {
  action_codes?: string[];
  action_bindings?: ActionResourceBinding[];
  metadata?: Record<string, unknown>;
  role_id?: number;
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

export interface UserPayload extends UpdateUserPayload {
  password?: string;
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

function create<T, P>(
  resource: string,
  idempotencyKey: string,
  data: P,
  feedback?: RequestErrorFeedback,
) {
  return authRequestClient.post<T>(`/${resource}`, data, {
    ...feedback,
    headers: { 'x-idempotent': idempotencyKey },
  });
}

function update<T, P>(
  resource: string,
  id: number,
  data: P,
  feedback?: RequestErrorFeedback,
) {
  return authRequestClient.request<T>(`/${resource}/${id}`, {
    data,
    method: 'PATCH',
    ...feedback,
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
export type ActionGroupChange =
  | { operation: 'create'; word: string; names: Record<string, string> }
  | {
      operation: 'delete';
      word: string;
      expected_names: Record<string, string>;
    }
  | {
      operation: 'update';
      word: string;
      original_word: string;
      names: Record<string, string>;
      expected_names: Record<string, string>;
    };

async function writeActionGroups(
  path: '/action/group' | '/action/group/order',
  data: ActionGroupChange | { order: string[]; expected_order: string[] },
) {
  const refresh = () =>
    refreshI18nCatalog(() =>
      message.warning($t('developer.translationRefreshFailed')),
    );
  try {
    await authRequestClient.request(path, { method: 'PATCH', data });
  } catch (error) {
    const response = (
      error as {
        response?: { status?: number; data?: { error_code?: string } };
      }
    )?.response;
    if (
      response?.status === 409 &&
      response.data?.error_code === 'ACTION_GROUP_CONFLICT'
    )
      await refresh();
    throw error;
  }
  await refresh();
}

export function updateActionGroup(data: ActionGroupChange) {
  return writeActionGroups('/action/group', data);
}

export function reorderActionGroups(order: string[], expectedOrder: string[]) {
  return writeActionGroups('/action/group/order', {
    order,
    expected_order: expectedOrder,
  });
}

export const listActionGroups = (keyword = '') =>
  authRequestClient.get<ActionGroupResult>('/action/group', {
    params: keyword ? { keyword } : {},
  });
export const createAction = async (
  idempotencyKey: string,
  data: ActionPayload,
  feedback?: RequestErrorFeedback,
) => {
  const { names, ...fields } = data;
  const hasNames = names && Object.keys(names).length > 0;
  const record = await create<ActionRecord, ActionPayload>(
    'action',
    idempotencyKey,
    hasNames ? data : fields,
    feedback,
  );
  if (hasNames) await refreshI18nCatalog();
  return record;
};
export const updateAction = async (
  id: number,
  data: ActionPayload,
  feedback?: RequestErrorFeedback,
) => {
  const record = await update<ActionRecord, ActionPayload>(
    'action',
    id,
    data,
    feedback,
  );
  if (data.names !== undefined || data.word !== undefined)
    await refreshI18nCatalog();
  return record;
};
export const deleteActions = (ids: number[]) => remove('action', ids);

export const listRoles: ListApi<RoleRecord> = (params: PageParams = {}) =>
  list<RoleRecord>('role', params);
export const createRole = (
  idempotencyKey: string,
  data: RolePayload,
  feedback?: RequestErrorFeedback,
) => create<RoleRecord, RolePayload>('role', idempotencyKey, data, feedback);
export const updateRole = (
  id: number,
  data: RolePayload,
  feedback?: RequestErrorFeedback,
) => update<RoleRecord, RolePayload>('role', id, data, feedback);
export const deleteRoles = (ids: number[]) => remove('role', ids);

export const listUsers: ListApi<UserRecord> = (params: PageParams = {}) =>
  list<UserRecord>('user', params);
export const createUser = async (
  idempotencyKey: string,
  data: UserPayload,
  feedback?: RequestErrorFeedback,
) => {
  const username = data.username?.trim();
  if (!username || !data.password) {
    throw new TypeError('Username and password are required');
  }
  const password = data.password;
  const encrypted = await createRegistrationPasswordCredentialApi(password);
  const request: CreateUserRequest = {
    action_codes: data.action_codes,
    action_bindings: data.action_bindings,
    metadata: data.metadata,
    role_id: data.role_id,
    username,
    ...encrypted,
  };
  const options = {
    ...feedback,
    headers: { 'x-idempotent': idempotencyKey },
    verificationRetryCredential: () =>
      createRegistrationPasswordCredentialApi(password),
  } satisfies ServiceRequestConfig;
  return authRequestClient.post<UserRecord>('/user', request, options);
};
export const updateUser = (
  id: number,
  data: UpdateUserPayload,
  feedback?: RequestErrorFeedback,
) => update<UserRecord, UpdateUserPayload>('user', id, data, feedback);

export const reviewUser = (
  id: number,
  decision: 'approve' | 'reject',
  reason: string,
) =>
  update(
    'user',
    id,
    decision === 'reject'
      ? { review_decision: decision, reject_reason: reason }
      : { review_decision: decision },
  );

export const lockUserAccount = (id: number, lockExpiredAt: number) =>
  authRequestClient.post<UserRecord>(`/user/${id}/lock`, {
    lock_expired_at: lockExpiredAt,
  });

export const unlockUserAccount = (id: number) =>
  authRequestClient.post<UserRecord>(`/user/${id}/unlock`);

export async function resetUserPassword(id: number, newPassword: string) {
  const password = newPassword.trim();
  const encrypt = () => createRegistrationPasswordCredentialApi(password);
  const options: ServiceRequestConfig = {
    verificationRetryCredential: encrypt,
  };
  return authRequestClient.post<UserRecord>(
    `/user/${id}/reset-password`,
    await encrypt(),
    options,
  );
}
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
  feedback?: RequestErrorFeedback,
) =>
  authRequestClient.post<UserGroupRecord>('/user-group', data, {
    ...feedback,
    headers: { 'x-idempotent': idempotencyKey },
    params: { f: groupFields },
  });
export const updateUserGroup = (
  id: number,
  data: UserGroupPayload,
  feedback?: RequestErrorFeedback,
) =>
  authRequestClient.request<UserGroupRecord>(`/user-group/${id}`, {
    data,
    method: 'PATCH',
    ...feedback,
    params: { f: groupFields },
  });
export const deleteUserGroups = (ids: number[]) => remove('user-group', ids);

export const listDictionaries: ListApi<DictionaryRecord> = (
  params: PageParams = {},
) => list<DictionaryRecord>('dictionary', params);
export const createDictionary = (
  idempotencyKey: string,
  data: DictionaryPayload,
  feedback?: RequestErrorFeedback,
) =>
  create<DictionaryRecord, DictionaryPayload>(
    'dictionary',
    idempotencyKey,
    data,
    feedback,
  );
export const updateDictionary = (
  id: number,
  data: DictionaryPayload,
  feedback?: RequestErrorFeedback,
) =>
  update<DictionaryRecord, DictionaryPayload>('dictionary', id, data, feedback);

export async function publishDictionaryCatalog(
  data: Pick<
    DictionaryPayload,
    'feature_renames' | 'group_renames' | 'resource_renames'
  > & {
    expected_value: unknown;
    value: unknown;
  },
) {
  const result = await authRequestClient.request<DictionaryRecord>(
    '/dictionary/catalog',
    {
      ...quietRequest,
      method: 'PATCH',
      data,
    },
  );
  await refreshI18nCatalog(() =>
    message.warning($t('developer.translationRefreshFailed')),
  );
  return result;
}
export const deleteDictionaries = (ids: number[]) => remove('dictionary', ids);

// Details and editors hydrate independently of a sparse list row.
export const systemDetailFields: Record<string, string> = {
  action:
    'id,created_at,updated_at,code,name,names,group,word,scope,config,resource,menu,button',
  role: 'id,created_at,updated_at,name,word,action_codes,actions',
  user: 'id,created_at,updated_at,username,code,role_id,role_summary,last_logged_in_at,login_count,status,metadata,wrong,action_codes,actions,permission_sources',
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
export const getPermissionCatalog = (
  fields = 'scopes,operations,resource_catalog,defined_actions',
) =>
  authRequestClient.get<PermissionCatalog>('/action/catalog', {
    params: { f: fields },
  });
/** Query scope selects the inspection target; X-Auth-Scope authorizes the request. */
export const getEffectivePermissionPaths = (scope: string) =>
  authRequestClient.get<EffectivePermissionPaths>('/action/effective', {
    params: { scope, f: 'btn,http,grpc' },
  });
