import { t as $t } from '../locales';
import type { ResourceKind } from './types';
export interface FieldDefinition {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  createRequired?: boolean;
  createVisible?: boolean;
  defaultValue?: unknown;
  editLabel?: string;
  editPlaceholder?: string;
  placeholder?: string;
}
export interface FilterDefinition {
  key: string;
  label: string;
  type: string;
  splitLines?: boolean;
  suggestion?: { fieldKey: string; resource: ResourceKind };
}
export interface DisplayColumn {
  dataIndex: string;
  key: string;
  title: string;
  width?: number;
  display?: string;
}
export interface ResourceConfig {
  columns: DisplayColumn[];
  fields: FieldDefinition[];
  filters: FilterDefinition[];
  entity: string;
  title: string;
}
export const configs = {
  get value(): Record<ResourceKind, ResourceConfig> {
    return {
      action: {
        columns: [
          {
            dataIndex: 'id',
            key: 'id',
            title: $t('system.fields.id'),
            width: 90,
          },
          {
            dataIndex: 'name',
            key: 'name',
            title: $t('system.fields.name'),
            width: 150,
          },
          {
            dataIndex: 'group',
            key: 'group',
            title: $t('system.fields.group'),
            width: 140,
          },
          {
            dataIndex: 'word',
            key: 'word',
            title: $t('system.fields.word'),
            width: 150,
          },
          {
            dataIndex: 'code',
            key: 'code',
            title: $t('system.fields.code'),
            width: 120,
          },
          {
            dataIndex: 'resource',
            display: 'resource-rules',
            key: 'resource',
            title: $t('system.fields.resourceRules'),
            width: 240,
          },
          {
            dataIndex: 'menu',
            key: 'menu',
            title: $t('system.fields.menuPaths'),
            width: 180,
          },
          {
            dataIndex: 'button',
            key: 'button',
            title: $t('system.fields.buttonPermission'),
            width: 180,
          },
          {
            dataIndex: 'created_at',
            display: 'date',
            key: 'created_at',
            title: $t('system.fields.createdAt'),
            width: 180,
          },
          {
            dataIndex: 'updated_at',
            display: 'date',
            key: 'updated_at',
            title: $t('system.fields.updatedAt'),
            width: 180,
          },
        ],
        entity: $t('system.action.entity'),
        fields: [
          {
            key: 'name',
            label: $t('system.fields.name'),
            required: true,
            type: 'input',
          },
          {
            key: 'group',
            label: $t('system.fields.group'),
            required: true,
            type: 'action-group',
          },
          {
            key: 'word',
            label: $t('system.fields.word'),
            required: true,
            type: 'input',
          },
          {
            key: 'resource',
            label: $t('system.fields.resourceRules'),
            type: 'textarea',
          },
          { key: 'menu', label: $t('system.fields.menuPaths'), type: 'textarea' },
          {
            key: 'button',
            label: $t('system.fields.buttonPermission'),
            type: 'textarea',
          },
        ],
        filters: [
          { key: 'name', label: $t('system.fields.name'), type: 'input' },
          {
            key: 'group',
            label: $t('system.fields.group'),
            type: 'input-multi-select',
          },
          {
            key: 'word',
            label: $t('system.fields.word'),
            type: 'input-multi-select',
          },
          {
            key: 'code',
            label: $t('system.fields.code'),
            type: 'input-multi-select',
          },
          {
            key: 'resource',
            label: $t('system.fields.resource'),
            splitLines: true,
            type: 'input-multi-select',
          },
          {
            key: 'menu',
            label: $t('system.fields.menuPath'),
            splitLines: true,
            type: 'input-multi-select',
          },
          {
            key: 'button',
            label: $t('system.fields.buttonPermission'),
            splitLines: true,
            type: 'input-multi-select',
          },
        ],
        title: $t('system.action.title'),
      },
      role: {
        columns: [
          {
            dataIndex: 'id',
            key: 'id',
            title: $t('system.fields.id'),
            width: 90,
          },
          {
            dataIndex: 'name',
            key: 'name',
            title: $t('system.fields.name'),
            width: 180,
          },
          {
            dataIndex: 'word',
            key: 'word',
            title: $t('system.fields.word'),
            width: 160,
          },
          {
            dataIndex: 'action_codes',
            display: 'actions',
            key: 'action_codes',
            title: $t('system.fields.permissions'),
          },
          {
            dataIndex: 'created_at',
            display: 'date',
            key: 'created_at',
            title: $t('system.fields.createdAt'),
            width: 180,
          },
          {
            dataIndex: 'updated_at',
            display: 'date',
            key: 'updated_at',
            title: $t('system.fields.updatedAt'),
            width: 180,
          },
        ],
        entity: $t('system.fields.role'),
        fields: [
          {
            key: 'name',
            label: $t('system.fields.name'),
            required: true,
            type: 'input',
          },
          {
            key: 'word',
            label: $t('system.fields.word'),
            required: true,
            type: 'input',
          },
          {
            key: 'action_codes',
            label: $t('system.fields.permissions'),
            type: 'action-select',
          },
        ],
        filters: [
          { key: 'name', label: $t('system.fields.name'), type: 'input' },
          {
            key: 'word',
            label: $t('system.fields.word'),
            type: 'input-multi-select',
          },
          {
            key: 'action_code',
            label: $t('system.fields.actionCode'),
            suggestion: { fieldKey: 'code', resource: 'action' },
            type: 'input-multi-select',
          },
        ],
        title: $t('system.role.title'),
      },
      user: {
        columns: [
          {
            dataIndex: 'id',
            key: 'id',
            title: $t('system.fields.id'),
            width: 90,
          },
          {
            dataIndex: 'username',
            key: 'username',
            title: $t('system.fields.username'),
            width: 170,
          },
          {
            dataIndex: 'code',
            key: 'code',
            title: $t('system.fields.userCode'),
            width: 120,
          },
          {
            dataIndex: 'role',
            display: 'role',
            key: 'role',
            title: $t('system.fields.role'),
            width: 140,
          },
          {
            dataIndex: 'status',
            display: 'status',
            key: 'status',
            title: $t('system.fields.status'),
            width: 130,
          },
          {
            dataIndex: 'metadata',
            display: 'json',
            key: 'metadata',
            title: $t('system.fields.metadata'),
            width: 320,
          },
          {
            dataIndex: 'action_codes',
            display: 'actions',
            key: 'action_codes',
            title: $t('system.fields.permissions'),
          },
          {
            dataIndex: 'created_at',
            display: 'date',
            key: 'created_at',
            title: $t('system.fields.createdAt'),
            width: 180,
          },
          {
            dataIndex: 'updated_at',
            display: 'date',
            key: 'updated_at',
            title: $t('system.fields.updatedAt'),
            width: 180,
          },
        ],
        entity: $t('system.user.entity'),
        fields: [
          {
            key: 'username',
            label: $t('system.fields.username'),
            required: true,
            type: 'input',
          },
          {
            createRequired: true,
            editLabel: $t('system.fields.newPassword'),
            editPlaceholder: $t('system.user.keepPassword'),
            key: 'password',
            label: $t('system.fields.password'),
            type: 'password',
          },
          {
            key: 'role_id',
            label: $t('system.fields.role'),
            type: 'role-select',
          },
          {
            key: 'action_codes',
            label: $t('system.fields.permissions'),
            type: 'action-select',
          },
        ],
        filters: [
          { key: 'username', label: $t('system.fields.username'), type: 'input' },
          {
            key: 'code',
            label: $t('system.fields.userCode'),
            type: 'input-multi-select',
          },
          {
            key: 'status',
            label: $t('system.fields.status'),
            type: 'status-multi-select',
          },
        ],
        title: $t('system.user.title'),
      },
      'user-group': {
        columns: [
          {
            dataIndex: 'id',
            key: 'id',
            title: $t('system.fields.id'),
            width: 90,
          },
          {
            dataIndex: 'name',
            key: 'name',
            title: $t('system.fields.name'),
            width: 180,
          },
          {
            dataIndex: 'word',
            key: 'word',
            title: $t('system.fields.word'),
            width: 160,
          },
          {
            dataIndex: 'users',
            display: 'users',
            key: 'users',
            title: $t('system.fields.members'),
          },
          {
            dataIndex: 'action_codes',
            display: 'actions',
            key: 'action_codes',
            title: $t('system.fields.permissions'),
          },
          {
            dataIndex: 'created_at',
            display: 'date',
            key: 'created_at',
            title: $t('system.fields.createdAt'),
            width: 180,
          },
          {
            dataIndex: 'updated_at',
            display: 'date',
            key: 'updated_at',
            title: $t('system.fields.updatedAt'),
            width: 180,
          },
        ],
        entity: $t('system.userGroup.entity'),
        fields: [
          {
            key: 'name',
            label: $t('system.fields.name'),
            required: true,
            type: 'input',
          },
          {
            key: 'word',
            label: $t('system.fields.word'),
            required: true,
            type: 'input',
          },
          {
            key: 'user_ids',
            label: $t('system.fields.members'),
            type: 'user-select',
          },
          {
            key: 'action_codes',
            label: $t('system.fields.permissions'),
            type: 'action-select',
          },
        ],
        filters: [
          { key: 'name', label: $t('system.fields.name'), type: 'input' },
          {
            key: 'word',
            label: $t('system.fields.word'),
            type: 'input-multi-select',
          },
          {
            key: 'action_code',
            label: $t('system.fields.actionCode'),
            suggestion: { fieldKey: 'code', resource: 'action' },
            type: 'input-multi-select',
          },
        ],
        title: $t('system.userGroup.title'),
      },
      dictionary: {
        columns: [
          {
            dataIndex: 'id',
            key: 'id',
            title: $t('system.fields.id'),
            width: 90,
          },
          {
            dataIndex: 'key',
            key: 'key',
            title: $t('system.fields.dictionaryKey'),
            width: 280,
          },
          {
            dataIndex: 'name',
            key: 'name',
            title: $t('system.fields.name'),
            width: 220,
          },
          {
            dataIndex: 'value',
            display: 'json',
            key: 'value',
            title: $t('system.fields.dictionaryValue'),
          },
          {
            dataIndex: 'description',
            key: 'description',
            title: $t('system.fields.description'),
            width: 260,
          },
          {
            dataIndex: 'enabled',
            display: 'boolean',
            key: 'enabled',
            title: $t('system.fields.enabled'),
            width: 110,
          },
          {
            dataIndex: 'created_at',
            display: 'date',
            key: 'created_at',
            title: $t('system.fields.createdAt'),
            width: 180,
          },
          {
            dataIndex: 'updated_at',
            display: 'date',
            key: 'updated_at',
            title: $t('system.fields.updatedAt'),
            width: 180,
          },
        ],
        entity: $t('system.dictionary.entity'),
        fields: [
          {
            key: 'key',
            label: $t('system.fields.dictionaryKey'),
            required: true,
            type: 'input',
          },
          {
            key: 'name',
            label: $t('system.fields.name'),
            required: true,
            type: 'input',
          },
          {
            defaultValue: '[]',
            key: 'value',
            label: $t('system.fields.dictionaryValue'),
            required: true,
            type: 'json',
          },
          {
            key: 'description',
            label: $t('system.fields.description'),
            type: 'textarea',
          },
          {
            defaultValue: true,
            key: 'enabled',
            label: $t('system.fields.enabled'),
            type: 'enabled',
          },
        ],
        filters: [
          {
            key: 'key',
            label: $t('system.fields.dictionaryKey'),
            type: 'input',
          },
          { key: 'name', label: $t('system.fields.name'), type: 'input' },
          {
            key: 'enabled',
            label: $t('system.fields.enabled'),
            type: 'enabled',
          },
        ],
        title: $t('system.dictionary.title'),
      },
      whitelist: {
        columns: [
          {
            dataIndex: 'id',
            key: 'id',
            title: $t('system.fields.id'),
            width: 90,
          },
          {
            dataIndex: 'category',
            display: 'category',
            key: 'category',
            title: $t('system.fields.category'),
            width: 120,
          },
          {
            dataIndex: 'resource',
            display: 'resource-rules',
            key: 'resource',
            title: $t('system.fields.resourceRules'),
            width: 240,
          },
          {
            dataIndex: 'created_at',
            display: 'date',
            key: 'created_at',
            title: $t('system.fields.createdAt'),
            width: 180,
          },
          {
            dataIndex: 'updated_at',
            display: 'date',
            key: 'updated_at',
            title: $t('system.fields.updatedAt'),
            width: 180,
          },
        ],
        entity: $t('system.whitelist.entity'),
        fields: [
          {
            defaultValue: 0,
            key: 'category',
            label: $t('system.fields.category'),
            required: true,
            type: 'category',
          },
          {
            key: 'resource',
            label: $t('system.fields.resourceRules'),
            required: true,
            type: 'textarea',
          },
        ],
        filters: [
          {
            key: 'category',
            label: $t('system.fields.category'),
            type: 'category',
          },
          {
            key: 'resource',
            label: $t('system.fields.resource'),
            splitLines: true,
            type: 'input-multi-select',
          },
        ],
        title: $t('system.whitelist.title'),
      },
    };
  },
};
