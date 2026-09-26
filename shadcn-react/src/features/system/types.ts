export type ResourceKind = 'action' | 'role' | 'user' | 'user-group' | 'dictionary' | 'whitelist';
export type RecordValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];
export type SystemRecord = {
  id: number;
  created_at?: number;
  updated_at?: number;
  [key: string]: RecordValue;
};
export interface PageResult {
  items: SystemRecord[];
  p: number;
  s: number;
  t: number;
}
export type FieldType =
  | 'text'
  | 'multi-text'
  | 'textarea'
  | 'password'
  | 'json'
  | 'boolean'
  | 'status'
  | 'multi-status'
  | 'category'
  | 'number'
  | 'csv'
  | 'number-csv'
  | 'action-group'
  | 'action-select'
  | 'role-select'
  | 'user-select';
export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  createOnly?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
}
export interface ResourceConfig {
  title: string;
  permission: string;
  columns: Array<{ key: string; label: string }>;
  fields: FieldConfig[];
  filters: FieldConfig[];
}
