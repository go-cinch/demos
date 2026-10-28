import { apiRequest, jsonRequest } from "./client";
import { userPasswordCredential } from "./auth";

export type ResourceKind =
  "user" | "role" | "user-group" | "action" | "dictionary" | "whitelist";

export interface PageResult<T = SystemRecord> {
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

export interface RoleRecord {
  id: number;
  name: string;
  word: string;
  action_codes: string[];
  actions: ActionRecord[];
  action_summaries?: Pick<ActionRecord, "code" | "name" | "group">[];
  created_at: number;
  updated_at: number;
}

export interface UserRecord {
  id: number;
  username: string;
  code: string;
  status: 0 | 1 | 2;
  role_id?: number;
  role?: RoleRecord;
  action_codes: string[];
  actions: ActionRecord[];
  metadata: Record<string, unknown>;
  login_count: number;
  wrong: number;
  last_logged_in_at?: number;
  created_at: number;
  updated_at: number;
}

export interface UserGroupRecord {
  id: number;
  name: string;
  word: string;
  action_codes: string[];
  actions: ActionRecord[];
  action_summaries?: Pick<ActionRecord, "code" | "name" | "group">[];
  users: { id: number; username: string; code: string }[];
  created_at: number;
  updated_at: number;
}

export interface DictionaryRecord {
  id: number;
  key: string;
  name: string;
  value: unknown;
  description: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface WhitelistRecord {
  id: number;
  category: 0 | 1;
  resource: string;
  created_at: number;
  updated_at: number;
}

export type SystemRecord =
  | ActionRecord
  | DictionaryRecord
  | RoleRecord
  | UserGroupRecord
  | UserRecord
  | WhitelistRecord;

export type Payload = Record<string, unknown>;

function queryString(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (
      value === undefined ||
      (value === "" && !key.endsWith("_exact")) ||
      value === null
    )
      return;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });
  return query.toString();
}

export function listRecords<T extends SystemRecord = SystemRecord>(
  resource: ResourceKind,
  params: Record<string, unknown> = {},
) {
  return apiRequest<PageResult<T>>(
    `/${resource}?${queryString(resource === "user-group" ? { f: "actions,member_count,member_preview", ...params } : params)}`,
  );
}

export async function createRecord(resource: ResourceKind, payload: Payload) {
  let body = payload;
  if (resource === "user") {
    const { password, ...fields } = payload;
    if (typeof password === "string") {
      body = { ...fields, ...(await userPasswordCredential(password)) };
    }
  }
  return jsonRequest<SystemRecord>(
    `/${resource}${resource === "user-group" ? "?f=actions,member_count,member_preview" : ""}`,
    "POST",
    body,
    {
      headers: { "x-idempotent": crypto.randomUUID() },
    },
  );
}

export async function updateRecord(
  resource: ResourceKind,
  id: number,
  payload: Payload,
) {
  let body = payload;
  if (resource === "user") {
    const { password, ...fields } = payload;
    body = fields;
    if (typeof password === "string" && password) {
      body = { ...fields, ...(await userPasswordCredential(password)) };
    }
  }
  return jsonRequest<SystemRecord>(
    `/${resource}/${id}${resource === "user-group" ? "?f=actions,member_count,member_preview" : ""}`,
    "PATCH",
    body,
  );
}

export function deleteRecords(resource: ResourceKind, ids: number[]) {
  return apiRequest<void>(`/${resource}/${ids.join(",")}`, {
    method: "DELETE",
  });
}

export function listActionGroups(keyword = "") {
  return apiRequest<{ items: string[] }>(
    `/action/group${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""}`,
  );
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

export const getPermissionCatalog = () => apiRequest<PermissionCatalog>('/action/catalog?f=scopes,operations,resource_catalog,defined_actions');
export const getEffectivePermissionPaths = (scope: string) => apiRequest<EffectivePermissionPaths>(`/action/effective?scope=${encodeURIComponent(scope)}&f=btn,http,grpc`);
export const systemDetailFields: Record<string, string> = {
 action: 'id,created_at,updated_at,code,name,names,group,word,scope,config,resource,menu,button',
 role: 'id,created_at,updated_at,name,word,action_codes,actions',
 user: 'id,created_at,updated_at,username,code,role_id,role_summary,last_logged_in_at,login_count,status,metadata,wrong,action_codes,actions,permission_sources',
 // User-group detail selectors request associations; base fields are always returned.
 'user-group': 'actions,member_count,member_preview',
};

export interface UserPermissionSource {
  kind: 'direct' | 'group' | 'role';
  id: number;
  name: string;
  action_codes: string[];
  actions: Pick<ActionRecord, 'code' | 'word' | 'config'>[];
}
