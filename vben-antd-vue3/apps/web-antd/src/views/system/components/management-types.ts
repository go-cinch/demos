import type { Recordable } from '@vben/types';

import type { PageParams, PageResult } from '#/api';
export type ResourceKind =
  | 'action'
  | 'dictionary'
  | 'role'
  | 'user'
  | 'user-group';
export type LockMode = 'permanent' | 'until';
export type TableSize = 'large' | 'middle' | 'small';
export type SystemRecord = import('./system-record-format').SystemRecord;
export type FormModel = Recordable<any>;
export type FilterHistory = Record<string, string[]>;
export type FilterSuggestionSource = 'backend' | 'history';
export type FieldType =
  | 'action-group'
  | 'action-select'
  | 'category'
  | 'enabled'
  | 'input'
  | 'json'
  | 'password'
  | 'role-select'
  | 'status'
  | 'textarea'
  | 'user-select';

export interface FieldDefinition {
  createRequired?: boolean;
  createVisible?: boolean;
  defaultValue?: unknown;
  editLabel?: string;
  editPlaceholder?: string;
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type: FieldType;
}

export interface FormValidationRule {
  message?: string;
  required?: boolean;
  trigger?: 'blur' | 'change';
  validator?: (_rule: unknown, value: unknown) => Promise<void>;
}

export interface FilterDefinition {
  key: string;
  label: string;
  splitLines?: boolean;
  suggestion?: {
    fieldKey: string;
    resource: ResourceKind;
  };
  type:
    | 'category'
    | 'enabled'
    | 'input'
    | 'input-multi-select'
    | 'status'
    | 'status-multi-select';
}

export interface FilterSuggestionOption {
  label: string;
  source: FilterSuggestionSource;
  value: string;
}

export interface FilterSuggestionGroup {
  label: string;
  options: FilterSuggestionOption[];
}

export interface FilterSuggestionSegment {
  matched: boolean;
  text: string;
}

export interface SearchableSelectOption<T extends number | string> {
  label: string;
  value: T;
}

export interface ActionGroupOption extends SearchableSelectOption<string> {
  isNew?: boolean;
}

export interface DisplayColumn {
  dataIndex: string;
  display?:
    | 'actions'
    | 'boolean'
    | 'category'
    | 'date'
    | 'json'
    | 'resource-rules'
    | 'role'
    | 'status'
    | 'users';
  key: string;
  title: string;
  width?: number;
}

export interface CrudApi {
  create: (idempotencyKey: string, data: FormModel) => Promise<SystemRecord>;
  delete: (ids: number[]) => Promise<void>;
  list: (params: PageParams) => Promise<PageResult<SystemRecord>>;
  update: (id: number, data: FormModel) => Promise<SystemRecord>;
}

export interface ResourceConfig {
  api: CrudApi;
  columns: DisplayColumn[];
  entity: string;
  fields: FieldDefinition[];
  filters: FilterDefinition[];
  title: string;
}

export interface ManagementRecordActions {
  openDetail: (record: Recordable<any>, field?: string) => unknown;
  openEditor: (record?: Recordable<any>) => unknown;
  openApproval: (record: Recordable<any>) => void;
  openLock: (record: Recordable<any>) => void;
  unlockUser: (record: Recordable<any>) => Promise<void>;
  unlockPasswordChange: (record: Recordable<any>) => Promise<void>;
  confirmResetMFA: (record: Recordable<any>) => void;
  confirmRemove: (record: SystemRecord) => void;
  removeRecords: (ids: number[], control?: string) => Promise<void>;
  removeSelected: () => void;
}
