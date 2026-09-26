import type { ResourceKind } from "@/api/system";

export type FieldType =
  | "text"
  | "password"
  | "textarea"
  | "json"
  | "boolean"
  | "category"
  | "role-select"
  | "action-select"
  | "action-group"
  | "user-select";

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: unknown;
}

export interface ColumnConfig {
  key: string;
  label: string;
  kind?:
    | "date"
    | "status"
    | "role"
    | "tags"
    | "users"
    | "json"
    | "boolean"
    | "category"
    | "rules";
}

export interface FilterConfig {
  key: string;
  label: string;
  type?: "text" | "status" | "boolean" | "category";
}

export interface ResourceConfig {
  resource: ResourceKind;
  permission: string;
  title: string;
  entity: string;
  fields: FieldConfig[];
  columns: ColumnConfig[];
  filters: FilterConfig[];
}

export const resourceConfigs: Record<ResourceKind, ResourceConfig> = {
  action: {
    resource: "action",
    permission: "system.action",
    title: "system.actionTitle",
    entity: "system.action",
    fields: [
      { key: "name", label: "fields.name", type: "text", required: true },
      {
        key: "group",
        label: "fields.group",
        type: "action-group",
        required: true,
      },
      { key: "word", label: "fields.word", type: "text", required: true },
      { key: "resource", label: "fields.resourceRules", type: "textarea" },
      { key: "menu", label: "fields.menuPaths", type: "textarea" },
      { key: "button", label: "fields.buttonPermission", type: "textarea" },
    ],
    columns: [
      { key: "id", label: "fields.id" },
      { key: "name", label: "fields.name" },
      { key: "group", label: "fields.group" },
      { key: "word", label: "fields.word" },
      { key: "code", label: "fields.code" },
      { key: "resource", label: "fields.resourceRules", kind: "rules" },
      { key: "menu", label: "fields.menuPaths", kind: "rules" },
      { key: "button", label: "fields.buttonPermission", kind: "rules" },
      { key: "created_at", label: "fields.createdAt", kind: "date" },
      { key: "updated_at", label: "fields.updatedAt", kind: "date" },
    ],
    filters: [
      { key: "name", label: "fields.name" },
      { key: "group", label: "fields.group" },
      { key: "word", label: "fields.word" },
      { key: "code", label: "fields.code" },
      { key: "resource", label: "fields.resource" },
      { key: "menu", label: "fields.menuPaths" },
      { key: "button", label: "fields.buttonPermission" },
    ],
  },
  role: {
    resource: "role",
    permission: "system.role",
    title: "system.roleTitle",
    entity: "system.role",
    fields: [
      { key: "name", label: "fields.name", type: "text", required: true },
      { key: "word", label: "fields.word", type: "text", required: true },
      {
        key: "action_codes",
        label: "fields.permissions",
        type: "action-select",
      },
    ],
    columns: [
      { key: "id", label: "fields.id" },
      { key: "name", label: "fields.name" },
      { key: "word", label: "fields.word" },
      { key: "action_codes", label: "fields.permissions", kind: "tags" },
      { key: "created_at", label: "fields.createdAt", kind: "date" },
      { key: "updated_at", label: "fields.updatedAt", kind: "date" },
    ],
    filters: [
      { key: "name", label: "fields.name" },
      { key: "word", label: "fields.word" },
      { key: "action_code", label: "fields.actionCode" },
    ],
  },
  user: {
    resource: "user",
    permission: "system.user",
    title: "system.userTitle",
    entity: "system.user",
    fields: [
      {
        key: "username",
        label: "fields.username",
        type: "text",
        required: true,
      },
      { key: "password", label: "fields.password", type: "password" },
      { key: "role_id", label: "fields.role", type: "role-select" },
      {
        key: "action_codes",
        label: "fields.permissions",
        type: "action-select",
      },
    ],
    columns: [
      { key: "id", label: "fields.id" },
      { key: "username", label: "fields.username" },
      { key: "code", label: "fields.userCode" },
      { key: "role", label: "fields.role", kind: "role" },
      { key: "status", label: "fields.status", kind: "status" },
      { key: "metadata", label: "fields.metadata", kind: "json" },
      { key: "action_codes", label: "fields.permissions", kind: "tags" },
      { key: "created_at", label: "fields.createdAt", kind: "date" },
      { key: "updated_at", label: "fields.updatedAt", kind: "date" },
    ],
    filters: [
      { key: "username", label: "fields.username" },
      { key: "code", label: "fields.userCode" },
      { key: "status", label: "fields.status", type: "status" },
    ],
  },
  "user-group": {
    resource: "user-group",
    permission: "system.user.group",
    title: "system.userGroupTitle",
    entity: "system.userGroup",
    fields: [
      { key: "name", label: "fields.name", type: "text", required: true },
      { key: "word", label: "fields.word", type: "text", required: true },
      { key: "user_ids", label: "fields.members", type: "user-select" },
      {
        key: "action_codes",
        label: "fields.permissions",
        type: "action-select",
      },
    ],
    columns: [
      { key: "id", label: "fields.id" },
      { key: "name", label: "fields.name" },
      { key: "word", label: "fields.word" },
      { key: "users", label: "fields.members", kind: "users" },
      { key: "action_codes", label: "fields.permissions", kind: "tags" },
      { key: "created_at", label: "fields.createdAt", kind: "date" },
      { key: "updated_at", label: "fields.updatedAt", kind: "date" },
    ],
    filters: [
      { key: "name", label: "fields.name" },
      { key: "word", label: "fields.word" },
      { key: "action_code", label: "fields.actionCode" },
    ],
  },
  dictionary: {
    resource: "dictionary",
    permission: "system.dictionary",
    title: "system.dictionaryTitle",
    entity: "system.dictionary",
    fields: [
      {
        key: "key",
        label: "fields.dictionaryKey",
        type: "text",
        required: true,
      },
      { key: "name", label: "fields.name", type: "text", required: true },
      {
        key: "value",
        label: "fields.dictionaryValue",
        type: "json",
        required: true,
        defaultValue: "[]",
      },
      { key: "description", label: "fields.description", type: "textarea" },
      {
        key: "enabled",
        label: "fields.enabled",
        type: "boolean",
        defaultValue: true,
      },
    ],
    columns: [
      { key: "id", label: "fields.id" },
      { key: "key", label: "fields.dictionaryKey" },
      { key: "name", label: "fields.name" },
      { key: "value", label: "fields.dictionaryValue", kind: "json" },
      { key: "description", label: "fields.description" },
      { key: "enabled", label: "fields.enabled", kind: "boolean" },
      { key: "created_at", label: "fields.createdAt", kind: "date" },
      { key: "updated_at", label: "fields.updatedAt", kind: "date" },
    ],
    filters: [
      { key: "key", label: "fields.dictionaryKey" },
      { key: "name", label: "fields.name" },
      { key: "enabled", label: "fields.enabled", type: "boolean" },
    ],
  },
  whitelist: {
    resource: "whitelist",
    permission: "system.whitelist",
    title: "system.whitelistTitle",
    entity: "system.whitelist",
    fields: [
      {
        key: "category",
        label: "fields.category",
        type: "category",
        required: true,
        defaultValue: 0,
      },
      {
        key: "resource",
        label: "fields.resourceRules",
        type: "textarea",
        required: true,
      },
    ],
    columns: [
      { key: "id", label: "fields.id" },
      { key: "category", label: "fields.category", kind: "category" },
      { key: "resource", label: "fields.resourceRules", kind: "rules" },
      { key: "created_at", label: "fields.createdAt", kind: "date" },
      { key: "updated_at", label: "fields.updatedAt", kind: "date" },
    ],
    filters: [
      { key: "category", label: "fields.category", type: "category" },
      { key: "resource", label: "fields.resource" },
    ],
  },
};
