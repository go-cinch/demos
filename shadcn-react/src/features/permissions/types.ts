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
  actions: Pick<ActionRecord, 'code' | 'word' | 'config'>[];
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
