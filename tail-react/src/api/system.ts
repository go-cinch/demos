import { apiRequest, jsonRequest } from "./client";
import { userPasswordCredential } from "./auth";

export type ResourceKind =
  | "user"
  | "role"
  | "user-group"
  | "action"
  | "dictionary"
  | "whitelist";

export interface PageResult<T = SystemRecord> {
  items: T[];
  p: number;
  s: number;
  t: number;
}

export interface ActionRecord {
  id: number;
  name: string;
  group: string;
  word: string;
  code: string;
  resource: string;
  menu: string;
  button: string;
  created_at: number;
  updated_at: number;
}

export interface RoleRecord {
  id: number;
  name: string;
  word: string;
  action_codes: string[];
  actions: ActionRecord[];
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
    if (value === undefined || value === "" || value === null) return;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });
  return query.toString();
}

export function listRecords<T extends SystemRecord = SystemRecord>(
  resource: ResourceKind,
  params: Record<string, unknown> = {},
) {
  return apiRequest<PageResult<T>>(`/${resource}?${queryString(params)}`);
}

export async function createRecord(
  resource: ResourceKind,
  payload: Payload,
) {
  let body = payload;
  if (resource === "user") {
    const { password, ...fields } = payload;
    if (typeof password === "string") {
      body = { ...fields, ...(await userPasswordCredential(password)) };
    }
  }
  return jsonRequest<SystemRecord>(`/${resource}`, "POST", body, {
    headers: { "x-idempotent": crypto.randomUUID() },
  });
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
  return jsonRequest<SystemRecord>(`/${resource}/${id}`, "PATCH", body);
}

export function deleteRecords(resource: ResourceKind, ids: number[]) {
  return apiRequest<void>(`/${resource}/${ids.join(",")}`, { method: "DELETE" });
}

export function listActionGroups(keyword = "") {
  return apiRequest<{ items: string[] }>(
    `/action/group${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""}`,
  );
}
