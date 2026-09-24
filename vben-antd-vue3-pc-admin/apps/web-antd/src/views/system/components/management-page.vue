<script lang="ts" setup>
import type {
  FormInstance,
  TableColumnsType,
  TablePaginationConfig,
} from 'ant-design-vue';
import type { Dayjs } from 'dayjs';

import { $t } from '#/locales';

import type { Recordable } from '@vben/types';

import type {
  ActionPayload,
  ActionRecord,
  DictionaryPayload,
  DictionaryRecord,
  PageParams,
  PageResult,
  RolePayload,
  RoleRecord,
  UserGroupPayload,
  UserGroupRecord,
  UserPayload,
  UserRecord,
  WhitelistPayload,
  WhitelistRecord,
} from '#/api';

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import { useDebounceFn, useFullscreen, useTimeoutFn } from '@vueuse/core';
import {
  AutoComplete,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  FormItem,
  Input,
  InputPassword,
  message,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createAction,
  createDictionary,
  createRole,
  createUser,
  createUserGroup,
  createWhitelist,
  deleteActions,
  deleteDictionaries,
  deleteRoles,
  deleteUserGroups,
  deleteUsers,
  deleteWhitelists,
  listActionGroups,
  listActions,
  listDictionaries,
  listRoles,
  listUserGroups,
  listUsers,
  listWhitelists,
  updateAction,
  updateDictionary,
  updateRole,
  updateUser,
  updateUserGroup,
  updateWhitelist,
} from '#/api';

import { buildChangedPayload, snapshotPayload } from './update-payload';
import {
  isValidUsername,
  isValidUserPassword,
  USER_PASSWORD_MESSAGE_KEY,
  USER_USERNAME_MESSAGE_KEY,
} from './user-validation';

type ResourceKind =
  | 'action'
  | 'dictionary'
  | 'role'
  | 'user'
  | 'user-group'
  | 'whitelist';
type LockMode = 'permanent' | 'until';
type TableSize = 'large' | 'middle' | 'small';
type SystemRecord =
  | ActionRecord
  | DictionaryRecord
  | RoleRecord
  | UserGroupRecord
  | UserRecord
  | WhitelistRecord;
type FormModel = Recordable<any>;
type FilterHistory = Record<string, string[]>;
type FilterSuggestionSource = 'backend' | 'history';
type FieldType =
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

interface FieldDefinition {
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

interface FormValidationRule {
  message?: string;
  required?: boolean;
  trigger?: 'blur' | 'change';
  validator?: (_rule: unknown, value: unknown) => Promise<void>;
}

interface FilterDefinition {
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

interface FilterSuggestionOption {
  label: string;
  source: FilterSuggestionSource;
  value: string;
}

interface FilterSuggestionGroup {
  label: string;
  options: FilterSuggestionOption[];
}

interface FilterSuggestionSegment {
  matched: boolean;
  text: string;
}

interface SearchableSelectOption<T extends number | string> {
  label: string;
  value: T;
}

interface ActionGroupOption extends SearchableSelectOption<string> {
  isNew?: boolean;
}

interface DisplayColumn {
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

interface CrudApi {
  create: (idempotencyKey: string, data: FormModel) => Promise<SystemRecord>;
  delete: (ids: number[]) => Promise<void>;
  list: (params: PageParams) => Promise<PageResult<SystemRecord>>;
  update: (id: number, data: FormModel) => Promise<SystemRecord>;
}

interface ResourceConfig {
  api: CrudApi;
  columns: DisplayColumn[];
  entity: string;
  fields: FieldDefinition[];
  filters: FilterDefinition[];
  title: string;
}

const props = defineProps<{ resource: ResourceKind }>();
const route = useRoute();
const { hasAccessByCodes } = useAccess();

const permissionPrefixByResource: Record<ResourceKind, string> = {
  action: 'system.action',
  dictionary: 'system.dictionary',
  role: 'system.role',
  user: 'system.user',
  'user-group': 'system.user.group',
  whitelist: 'system.whitelist',
};

function hasButtonAccess(operation: 'create' | 'delete' | 'read' | 'update') {
  return hasAccessByCodes([
    `${permissionPrefixByResource[props.resource]}.${operation}`,
  ]);
}

const canCreate = computed(() => hasButtonAccess('create'));
const canDelete = computed(() => hasButtonAccess('delete'));
const canRead = computed(() => hasButtonAccess('read'));
const canUpdate = computed(() => hasButtonAccess('update'));

const apiByResource: Record<ResourceKind, CrudApi> = {
  action: {
    create: (key, data) => createAction(key, data as ActionPayload),
    delete: deleteActions,
    list: (params) => listActions(params) as Promise<PageResult<SystemRecord>>,
    update: (id, data) => updateAction(id, data as ActionPayload),
  },
  dictionary: {
    create: (key, data) => createDictionary(key, data as DictionaryPayload),
    delete: deleteDictionaries,
    list: (params) =>
      listDictionaries(params) as Promise<PageResult<SystemRecord>>,
    update: (id, data) => updateDictionary(id, data as DictionaryPayload),
  },
  role: {
    create: (key, data) => createRole(key, data as RolePayload),
    delete: deleteRoles,
    list: (params) => listRoles(params) as Promise<PageResult<SystemRecord>>,
    update: (id, data) => updateRole(id, data as RolePayload),
  },
  user: {
    create: (key, data) => createUser(key, data as UserPayload),
    delete: deleteUsers,
    list: (params) => listUsers(params) as Promise<PageResult<SystemRecord>>,
    update: (id, data) => updateUser(id, data as UserPayload),
  },
  'user-group': {
    create: (key, data) => createUserGroup(key, data as UserGroupPayload),
    delete: deleteUserGroups,
    list: (params) =>
      listUserGroups(params) as Promise<PageResult<SystemRecord>>,
    update: (id, data) => updateUserGroup(id, data as UserGroupPayload),
  },
  whitelist: {
    create: (key, data) => createWhitelist(key, data as WhitelistPayload),
    delete: deleteWhitelists,
    list: (params) =>
      listWhitelists(params) as Promise<PageResult<SystemRecord>>,
    update: (id, data) => updateWhitelist(id, data as WhitelistPayload),
  },
};

const configs = computed<Record<ResourceKind, Omit<ResourceConfig, 'api'>>>(
  () => ({
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
  }),
);

const config = computed<ResourceConfig>(() => ({
  ...configs.value[props.resource],
  api: apiByResource[props.resource],
}));

const filterHistoryStorageKey = 'vben-system-filter-history';

function loadFilterHistory(): FilterHistory {
  try {
    const stored = JSON.parse(
      localStorage.getItem(filterHistoryStorageKey) || '{}',
    ) as FilterHistory;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return {};
    }
    const normalizedHistory = Object.fromEntries(
      Object.entries(stored).map(([key, values]) => [
        key,
        Array.isArray(values)
          ? values.filter((value) => typeof value === 'string').slice(0, 10)
          : [],
      ]),
    );
    localStorage.setItem(
      filterHistoryStorageKey,
      JSON.stringify(normalizedHistory),
    );
    return normalizedHistory;
  } catch {
    return {};
  }
}

const loading = ref(false);
const submitting = ref(false);
const records = ref<SystemRecord[]>([]);
const selectedRowKeys = ref<number[]>([]);
const filters = reactive<FormModel>({});
const filterHistory = reactive<FilterHistory>(loadFilterHistory());
const backendFilterSuggestions = reactive<Record<string, string[]>>({});
const filterSuggestionQueries = reactive<Record<string, string>>({});
const backendSuggestionRequestIds = new Map<string, number>();
const modalOpen = ref(false);
const editingRecord = ref<null | SystemRecord>(null);
const idempotencyKey = ref('');
const formModel = reactive<FormModel>({});
const initialEditorValues = ref<FormModel>({});
const formRef = ref<FormInstance>();
const approvalModalOpen = ref(false);
const approvalSubmitting = ref(false);
const approvalUser = ref<null | UserRecord>(null);
const approvalDecision = ref<'approve' | 'reject'>('approve');
const rejectReason = ref('');
const lockModalOpen = ref(false);
const lockSubmitting = ref(false);
const lockUser = ref<null | UserRecord>(null);
const lockMode = ref<LockMode>('until');
const lockUntil = ref<Dayjs>();
const actionGroupOptions = ref<ActionGroupOption[]>([]);
const actionGroupOptionsLoading = ref(false);
const actionGroupOptionsQuery = ref('');
const initialActionGroup = ref('');
const actionOptions = ref<SearchableSelectOption<string>[]>([]);
const actionOptionsLoading = ref(false);
const actionOptionsQuery = ref('');
const roleOptions = ref<SearchableSelectOption<number>[]>([]);
const roleOptionsLoading = ref(false);
const roleOptionsQuery = ref('');
const userOptions = ref<SearchableSelectOption<number>[]>([]);
const userOptionsLoading = ref(false);
const userOptionsQuery = ref('');
const pagination = reactive({ current: 1, pageSize: 10, total: 0 });
const searchExpanded = ref(false);
const filtersDirty = ref(false);
const tableContainerRef = ref<HTMLElement>();
const tableSize = ref<TableSize>('middle');
const densityOptions = computed<{ label: string; value: TableSize }[]>(() => [
  { label: $t('system.table.compact'), value: 'small' },
  { label: $t('system.table.default'), value: 'middle' },
  { label: $t('system.table.loose'), value: 'large' },
]);
const tableSettings = reactive({
  bordered: true,
  sticky: true,
  striped: true,
});
const selectionColumnKey = '__selection__';
const selectionColumnWidth = 48;
const adaptiveColumnMinWidth = 120;
const adaptiveColumnMaxWidth = 560;
const metadataColumnMaxWidth = 320;
const visibleColumnKeys = ref<string[]>([
  selectionColumnKey,
  ...config.value.columns.map((column) => column.key),
]);
const { isFullscreen, toggle: toggleFullscreen } =
  useFullscreen(tableContainerRef);
const { start: scheduleFilterSearch, stop: cancelFilterSearch } = useTimeoutFn(
  async () => {
    if (!filtersDirty.value || !canRead.value) return;
    filtersDirty.value = false;
    await runSearch();
  },
  500,
  { immediate: false },
);

const visibleFilters = computed(() =>
  searchExpanded.value
    ? config.value.filters
    : config.value.filters.slice(0, 3),
);

const editorFields = computed(() =>
  editingRecord.value
    ? config.value.fields
    : config.value.fields.filter((field) => field.createVisible !== false),
);

const columnOptions = computed(() => [
  { label: $t('system.common.selection'), value: selectionColumnKey },
  ...config.value.columns.map((column) => ({
    label: column.title,
    value: column.key,
  })),
]);

const showSelectionColumn = computed(() =>
  visibleColumnKeys.value.includes(selectionColumnKey),
);

const allColumnsSelected = computed(
  () => visibleColumnKeys.value.length === columnOptions.value.length,
);

const columnsIndeterminate = computed(
  () => visibleColumnKeys.value.length > 0 && !allColumnsSelected.value,
);

function adaptiveColumnValues(
  column: DisplayColumn,
  record: SystemRecord,
): string[] {
  if (column.display === 'actions') {
    return 'action_codes' in record && Array.isArray(record.action_codes)
      ? record.action_codes
      : [];
  }
  if (column.display === 'users') {
    return 'users' in record && Array.isArray(record.users)
      ? record.users.map((user) => user.username)
      : [];
  }
  if (column.display === 'resource-rules') {
    return 'resource' in record ? resourceRules(record.resource) : [];
  }
  if (column.display === 'json') {
    return formatJSON(columnValue(record, column)).split('\n');
  }
  return [];
}

function estimatedTagWidth(value: string, maximumWidth: number) {
  let textWidth = 0;
  for (const character of value) {
    textWidth += (character.codePointAt(0) ?? 0) > 255 ? 14 : 8;
  }
  return Math.min(maximumWidth, Math.max(48, textWidth + 18));
}

function adaptiveColumnWidth(column: DisplayColumn) {
  let widestRow = adaptiveColumnMinWidth;
  const maximumColumnWidth =
    column.display === 'json' ? metadataColumnMaxWidth : adaptiveColumnMaxWidth;
  const usesLongestValue =
    column.display === 'json' || column.display === 'resource-rules';
  const maximumValueWidth = usesLongestValue ? maximumColumnWidth - 32 : 220;
  for (const record of records.value) {
    const values = adaptiveColumnValues(column, record);
    if (values.length === 0) continue;
    let tagsWidth = 0;
    for (const value of values) {
      const tagWidth = estimatedTagWidth(value, maximumValueWidth);
      tagsWidth = usesLongestValue
        ? Math.max(tagsWidth, tagWidth)
        : tagsWidth + tagWidth;
    }
    const gapsWidth = usesLongestValue ? 0 : Math.max(0, values.length - 1) * 8;
    widestRow = Math.max(widestRow, tagsWidth + gapsWidth + 32);
  }

  return Math.min(widestRow, maximumColumnWidth);
}

const tableColumns = computed<TableColumnsType<SystemRecord>>(() => {
  const columns: TableColumnsType<SystemRecord> = config.value.columns
    .filter((column) => visibleColumnKeys.value.includes(column.key))
    .map((column) =>
      column.display === 'actions' ||
      column.display === 'json' ||
      column.display === 'resource-rules' ||
      column.display === 'users'
        ? { ...column, width: adaptiveColumnWidth(column) }
        : column,
    );

  if (canUpdate.value || canDelete.value) {
    columns.push({
      fixed: 'right',
      key: 'operation',
      title: $t('system.common.actions'),
      width: props.resource === 'user' ? 280 : 140,
    });
  }
  return columns;
});

const tableScrollWidth = computed(() => {
  let width = showSelectionColumn.value ? selectionColumnWidth : 0;
  for (const column of tableColumns.value) {
    if ('width' in column && typeof column.width === 'number') {
      width += column.width;
    }
  }
  return width;
});

const rowSelection = computed(() => ({
  onChange: (keys: (number | string)[]) => {
    selectedRowKeys.value = keys.map(Number);
  },
  selectedRowKeys: selectedRowKeys.value,
}));

const formRules = computed(() => {
  const result: Record<string, FormValidationRule[]> = {};
  for (const field of editorFields.value) {
    const required =
      field.required || (!editingRecord.value && field.createRequired);
    if (required) {
      result[field.key] = [
        {
          message: $t('system.validation.required', { field: field.label }),
          required: true,
        },
      ];
    }
  }
  if (props.resource === 'user') {
    result.username ||= [];
    result.username.push({
      trigger: 'blur',
      async validator(_rule, value) {
        if (!isValidUsername(value))
          throw new Error($t(USER_USERNAME_MESSAGE_KEY));
      },
    });
    result.password ||= [];
    result.password.push({
      trigger: 'blur',
      async validator(_rule, value) {
        if (editingRecord.value && !value) return;
        if (!isValidUserPassword(value))
          throw new Error($t(USER_PASSWORD_MESSAGE_KEY));
      },
    });
  }
  if (props.resource === 'dictionary') {
    result.key ||= [];
    result.key.push({
      trigger: 'blur',
      async validator(_rule, value) {
        if (
          typeof value !== 'string' ||
          !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)
        ) {
          throw new Error($t('system.validation.dictionaryKey'));
        }
      },
    });
    result.value ||= [];
    result.value.push({
      trigger: 'blur',
      async validator(_rule, value) {
        try {
          JSON.parse(String(value));
        } catch {
          throw new Error($t('system.validation.json'));
        }
      },
    });
  }
  return result;
});

function getRecordID(record: Recordable<any>) {
  return record.id;
}

function getRecordLabel(record: Recordable<any>) {
  if ('name' in record) return record.name;
  if ('key' in record) return record.key;
  if ('username' in record) return record.username;
  if ('resource' in record) return record.resource;
  return String(record.id);
}

function columnDisplay(column: Recordable<any>) {
  return column.display as DisplayColumn['display'];
}

function columnValue(record: Recordable<any>, column: Recordable<any>) {
  return record[String(column.dataIndex)];
}

function formatDate(value: unknown) {
  return typeof value === 'number' ? formatDateTime(value) : '-';
}

function formatLockExpiration(value: unknown) {
  return typeof value === 'number' && value > 0
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : '-';
}

function userLockExpiration(record: Recordable<any>) {
  const value = record.metadata?.lock_expired_at;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function userPasswordChangeFailures(record: Recordable<any>) {
  const value = record.metadata?.password_change_failures;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

function disablePastDate(value: Dayjs) {
  return value.endOf('day').isBefore(dayjs());
}

function resourceRules(value: unknown) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function resourceRuleColor(rule: string, category?: unknown) {
  if (typeof category === 'number') {
    return category === 0 ? 'blue' : 'green';
  }

  const method = rule.split('|', 1)[0]?.trim().toUpperCase();
  return (
    {
      DELETE: 'red',
      GET: 'green',
      PATCH: 'orange',
      POST: 'blue',
    }[method || ''] || 'default'
  );
}

function formatJSON(value: unknown) {
  const encoded = JSON.stringify(value, null, 2);
  return encoded === undefined ? 'null' : encoded;
}

function statusColor(status: unknown) {
  return ({ 0: 'warning', 1: 'success', 2: 'error' } as const)[
    status as 0 | 1 | 2
  ];
}

function statusLabel(status: unknown) {
  return (
    {
      0: $t('system.status.pending'),
      1: $t('system.status.active'),
      2: $t('system.status.locked'),
    } as const
  )[status as 0 | 1 | 2];
}

function resetObject(target: FormModel) {
  for (const key of Object.keys(target)) target[key] = undefined;
}

function newIdempotencyKey() {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

async function loadData() {
  loading.value = true;
  try {
    const params: PageParams = {
      p: pagination.current,
      s: pagination.pageSize,
    };
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        const joinedValue = value
          .filter(
            (item): item is boolean | number | string =>
              typeof item === 'boolean' ||
              typeof item === 'number' ||
              typeof item === 'string',
          )
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join(',');
        if (joinedValue) params[key] = joinedValue;
      } else if (value !== '' && value !== undefined) {
        params[key] = value as boolean | number | string;
      }
    }
    const result = await config.value.api.list(params);
    records.value = result.items;
    pagination.total = result.t;
    selectedRowKeys.value = [];
  } finally {
    loading.value = false;
  }
}

function handleTableChange(value: TablePaginationConfig) {
  pagination.current = value.current ?? 1;
  pagination.pageSize = value.pageSize ?? 10;
  loadData();
}

function tableRowClassName(_record: SystemRecord, index: number) {
  return tableSettings.striped && index % 2 === 1
    ? 'system-table-row-striped'
    : '';
}

function setTableSize(value: TableSize) {
  tableSize.value = value;
}

function toggleAllColumns() {
  visibleColumnKeys.value = allColumnsSelected.value
    ? []
    : columnOptions.value.map((column) => column.value);
  if (!visibleColumnKeys.value.includes(selectionColumnKey)) {
    selectedRowKeys.value = [];
  }
}

function toggleColumn(key: string) {
  visibleColumnKeys.value = visibleColumnKeys.value.includes(key)
    ? visibleColumnKeys.value.filter((item) => item !== key)
    : [...visibleColumnKeys.value, key];
  if (key === selectionColumnKey && !showSelectionColumn.value) {
    selectedRowKeys.value = [];
  }
}

function filterHistoryKey(fieldKey: string) {
  return `${props.resource}:${fieldKey}`;
}

function normalizeTextFilterValue(fieldKey: string, value: string) {
  return (props.resource === 'user' || props.resource === 'action') &&
    fieldKey === 'code'
    ? value.toUpperCase()
    : value;
}

function updateTextFilterValue(fieldKey: string, value: unknown) {
  const normalizedValue =
    typeof value === 'string'
      ? normalizeTextFilterValue(fieldKey, value)
      : value;
  if (filters[fieldKey] === normalizedValue) return;
  filters[fieldKey] = normalizedValue;
  filtersDirty.value = true;
}

function normalizeMultiFilterValue(fieldKey: string, values: unknown) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .flatMap((value) => value.split(','))
        .map((value) => normalizeTextFilterValue(fieldKey, value).trim())
        .filter(Boolean),
    ),
  ];
}

function updateMultiFilterValue(fieldKey: string, value: unknown) {
  const normalizedValue = normalizeMultiFilterValue(fieldKey, value);
  const currentValue = Array.isArray(filters[fieldKey])
    ? filters[fieldKey]
    : [];
  if (
    currentValue.length !== normalizedValue.length ||
    currentValue.some((item, index) => item !== normalizedValue[index])
  ) {
    filters[fieldKey] = normalizedValue;
    filtersDirty.value = true;
  }
  clearBackendFilterSuggestion(fieldKey);
}

function markFiltersChanged() {
  filtersDirty.value = true;
}

function handleFilterFocus() {
  cancelFilterSearch();
}

function handleFilterBlur(fieldKey?: string) {
  if (fieldKey) clearBackendFilterSuggestion(fieldKey);
  scheduleFilterSearch();
}

function filterSuggestionOptions(fieldKey: string): FilterSuggestionGroup[] {
  const key = filterHistoryKey(fieldKey);
  const backendOptions = filterSuggestionQueries[key]
    ? (backendFilterSuggestions[key] || []).map(
        (value): FilterSuggestionOption => ({
          label: value,
          source: 'backend',
          value,
        }),
      )
    : [];
  const historyOptions = normalizeMultiFilterValue(
    fieldKey,
    filterHistory[key] || [],
  ).map((value): FilterSuggestionOption => ({
    label: value,
    source: 'history',
    value,
  }));
  return [
    ...(backendOptions.length > 0
      ? [{ label: $t('system.suggestions.backend'), options: backendOptions }]
      : []),
    ...(historyOptions.length > 0
      ? [{ label: $t('system.suggestions.history'), options: historyOptions }]
      : []),
  ];
}

function matchingSegments(
  value: string,
  query: string,
): FilterSuggestionSegment[] {
  if (!query) return [{ matched: false, text: value }];

  const segments: FilterSuggestionSegment[] = [];
  const normalizedValue = value.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let cursor = 0;
  let matchIndex = normalizedValue.indexOf(normalizedQuery);
  if (matchIndex < 0) return [{ matched: false, text: value }];

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      segments.push({ matched: false, text: value.slice(cursor, matchIndex) });
    }
    const matchEnd = matchIndex + query.length;
    segments.push({ matched: true, text: value.slice(matchIndex, matchEnd) });
    cursor = matchEnd;
    matchIndex = normalizedValue.indexOf(normalizedQuery, cursor);
  }
  if (cursor < value.length) {
    segments.push({ matched: false, text: value.slice(cursor) });
  }
  return segments;
}

function filterSuggestionSegments(
  value: string,
  fieldKey: string,
): FilterSuggestionSegment[] {
  return matchingSegments(
    value,
    filterSuggestionQueries[filterHistoryKey(fieldKey)] || '',
  );
}

function persistFilterHistory() {
  localStorage.setItem(filterHistoryStorageKey, JSON.stringify(filterHistory));
}

function saveFilterHistory() {
  let changed = false;
  for (const field of config.value.filters) {
    if (field.type !== 'input' && field.type !== 'input-multi-select') {
      continue;
    }
    const value = filters[field.key];
    const values = Array.isArray(value) ? value : [value];
    const normalizedValues = values
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (normalizedValues.length === 0) continue;
    const key = filterHistoryKey(field.key);
    filterHistory[key] = [
      ...normalizedValues,
      ...(filterHistory[key] || []).filter(
        (item) => !normalizedValues.includes(item),
      ),
    ].slice(0, 10);
    changed = true;
  }
  if (changed) persistFilterHistory();
}

function removeFilterHistory(fieldKey: string, value: string) {
  const key = filterHistoryKey(fieldKey);
  const remainingValues = normalizeMultiFilterValue(
    fieldKey,
    filterHistory[key] || [],
  ).filter((item) => item !== value);
  if (remainingValues.length > 0) {
    filterHistory[key] = remainingValues;
  } else {
    delete filterHistory[key];
  }
  persistFilterHistory();
}

const loadBackendFilterSuggestions = useDebounceFn(
  async (
    requestKey: string,
    suggestionResource: ResourceKind,
    suggestionFieldKey: string,
    query: string,
    requestId: number,
  ) => {
    try {
      const result = await apiByResource[suggestionResource].list({
        [suggestionFieldKey]: query,
        p: 1,
        s: 10,
      });
      if (backendSuggestionRequestIds.get(requestKey) !== requestId) return;
      backendFilterSuggestions[requestKey] = [
        ...new Set(
          result.items
            .map(
              (record) =>
                (record as unknown as Record<string, unknown>)[
                  suggestionFieldKey
                ],
            )
            .filter(
              (value): value is number | string =>
                typeof value === 'number' || typeof value === 'string',
            )
            .map(String),
        ),
      ];
    } catch {
      if (backendSuggestionRequestIds.get(requestKey) === requestId) {
        backendFilterSuggestions[requestKey] = [];
      }
    }
  },
  250,
);

function searchBackendFilterSuggestions(fieldKey: string, value: string) {
  const key = filterHistoryKey(fieldKey);
  const requestId = (backendSuggestionRequestIds.get(key) || 0) + 1;
  backendSuggestionRequestIds.set(key, requestId);
  const query = normalizeTextFilterValue(fieldKey, value).trim();
  filterSuggestionQueries[key] = query;
  if (!query) {
    backendFilterSuggestions[key] = [];
    return;
  }
  const field = config.value.filters.find((item) => item.key === fieldKey);
  const suggestionResource = field?.suggestion?.resource ?? props.resource;
  const suggestionFieldKey = field?.suggestion?.fieldKey ?? fieldKey;
  void loadBackendFilterSuggestions(
    key,
    suggestionResource,
    suggestionFieldKey,
    query,
    requestId,
  );
}

function clearBackendFilterSuggestion(fieldKey: string) {
  const key = filterHistoryKey(fieldKey);
  backendSuggestionRequestIds.set(
    key,
    (backendSuggestionRequestIds.get(key) || 0) + 1,
  );
  backendFilterSuggestions[key] = [];
  filterSuggestionQueries[key] = '';
}

function clearBackendFilterSuggestions() {
  for (const key of Object.keys(backendFilterSuggestions)) {
    backendSuggestionRequestIds.set(
      key,
      (backendSuggestionRequestIds.get(key) || 0) + 1,
    );
    backendFilterSuggestions[key] = [];
    filterSuggestionQueries[key] = '';
  }
}

async function runSearch() {
  saveFilterHistory();
  pagination.current = 1;
  await loadData();
}

async function search() {
  cancelFilterSearch();
  filtersDirty.value = false;
  await runSearch();
}

async function resetSearch() {
  cancelFilterSearch();
  filtersDirty.value = false;
  resetObject(filters);
  clearBackendFilterSuggestions();
  await runSearch();
}

function applyRouteFilters() {
  const routeFilters = config.value.filters.flatMap((field) => {
    const queryValue = route.query[field.key];
    const value = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    return typeof value === 'string' && value ? [[field, value] as const] : [];
  });
  if (routeFilters.length === 0) return false;
  resetObject(filters);
  for (const [field, value] of routeFilters) {
    filters[field.key] =
      field.type === 'category' || field.type === 'status'
        ? Number(value)
        : field.type === 'enabled'
          ? value
          : field.type === 'status-multi-select'
            ? [
                ...new Set(
                  value
                    .split(',')
                    .map(Number)
                    .filter(
                      (item) =>
                        Number.isInteger(item) && item >= 0 && item <= 2,
                    ),
                ),
              ]
            : field.type === 'input-multi-select'
              ? normalizeMultiFilterValue(field.key, value.split(','))
              : normalizeTextFilterValue(field.key, value);
  }
  return true;
}

async function loadInitialData() {
  applyRouteFilters();
  await loadData();
}

watch(
  () => route.fullPath,
  async () => {
    if (route.path !== `/system/${props.resource}` || !applyRouteFilters()) {
      return;
    }
    pagination.current = 1;
    await loadData();
  },
);

let actionGroupOptionsRequestId = 0;

function fallbackActionGroupOptions(query: string): ActionGroupOption[] {
  const initialGroup = initialActionGroup.value;
  const options: ActionGroupOption[] =
    initialGroup &&
    (!query || initialGroup.toLowerCase().includes(query.toLowerCase()))
      ? [{ label: initialGroup, value: initialGroup }]
      : [];
  if (
    query &&
    !options.some(
      (option) => option.value.toLowerCase() === query.toLowerCase(),
    )
  ) {
    options.unshift({ isNew: true, label: query, value: query });
  }
  return options;
}

const loadActionGroupOptions = useDebounceFn(
  async (query: string, requestId: number) => {
    try {
      const result = await listActionGroups(query);
      if (requestId !== actionGroupOptionsRequestId) return;

      const groups = new Map<string, string>();
      for (const item of result.items) {
        const group = item.trim();
        if (group) groups.set(group.toLowerCase(), group);
      }
      const initialGroup = initialActionGroup.value;
      if (
        initialGroup &&
        (!query || initialGroup.toLowerCase().includes(query.toLowerCase()))
      ) {
        groups.set(initialGroup.toLowerCase(), initialGroup);
      }
      const options: ActionGroupOption[] = [...groups.values()]
        .sort((left, right) => left.localeCompare(right))
        .map((group) => ({ label: group, value: group }));
      if (query && !groups.has(query.toLowerCase())) {
        options.unshift({ isNew: true, label: query, value: query });
      }
      actionGroupOptions.value = options;
    } catch {
      if (requestId === actionGroupOptionsRequestId) {
        actionGroupOptions.value = fallbackActionGroupOptions(query);
      }
    } finally {
      if (requestId === actionGroupOptionsRequestId) {
        actionGroupOptionsLoading.value = false;
      }
    }
  },
  250,
);

function searchActionGroupOptions(value: string) {
  const requestId = ++actionGroupOptionsRequestId;
  const query = value.trim();
  actionGroupOptionsQuery.value = query;
  actionGroupOptions.value = fallbackActionGroupOptions(query);
  actionGroupOptionsLoading.value = true;
  void loadActionGroupOptions(query, requestId);
}

function handleActionGroupDropdownVisibleChange(open: boolean) {
  if (open) searchActionGroupOptions('');
}

let userOptionsRequestId = 0;

function selectedUserIds() {
  const value = formModel.user_ids;
  return new Set(
    Array.isArray(value)
      ? value.filter((item): item is number => typeof item === 'number')
      : [],
  );
}

function retainSelectedUserOptions() {
  const selected = selectedUserIds();
  userOptions.value = userOptions.value.filter((option) =>
    selected.has(option.value),
  );
}

const loadUserOptions = useDebounceFn(
  async (query: string, requestId: number) => {
    try {
      const results = query
        ? await Promise.all([
            listUsers({ p: 1, s: 20, username: query }),
            listUsers({ code: query, p: 1, s: 20 }),
          ])
        : [await listUsers({ p: 1, s: 20 })];
      if (requestId !== userOptionsRequestId) return;

      const selected = selectedUserIds();
      const options = new Map(
        userOptions.value
          .filter((option) => selected.has(option.value))
          .map((option) => [option.value, option]),
      );
      for (const result of results) {
        for (const item of result.items) {
          options.set(item.id, {
            label: `${item.username} · ${item.code}`,
            value: item.id,
          });
        }
      }
      userOptions.value = [...options.values()];
    } catch {
      if (requestId === userOptionsRequestId) retainSelectedUserOptions();
    } finally {
      if (requestId === userOptionsRequestId) {
        userOptionsLoading.value = false;
      }
    }
  },
  250,
);

function searchUserOptions(value: string) {
  const requestId = ++userOptionsRequestId;
  const query = value.trim();
  userOptionsQuery.value = query;
  userOptionsLoading.value = true;
  void loadUserOptions(query, requestId);
}

function handleUserDropdownVisibleChange(open: boolean) {
  if (open) searchUserOptions('');
}

let roleOptionsRequestId = 0;

function retainSelectedRoleOption() {
  const selectedRoleId = Number(formModel.role_id);
  roleOptions.value = roleOptions.value.filter(
    (option) => option.value === selectedRoleId,
  );
}

const loadRoleOptions = useDebounceFn(
  async (query: string, requestId: number) => {
    try {
      const results = query
        ? await Promise.all([
            listRoles({ name: query, p: 1, s: 20 }),
            listRoles({ p: 1, s: 20, word: query }),
          ])
        : [await listRoles({ p: 1, s: 20 })];
      if (requestId !== roleOptionsRequestId) return;

      const selectedRoleId = Number(formModel.role_id);
      const options = new Map(
        roleOptions.value
          .filter((option) => option.value === selectedRoleId)
          .map((option) => [option.value, option]),
      );
      for (const result of results) {
        for (const item of result.items) {
          options.set(item.id, {
            label: `${item.name} · ${item.word}`,
            value: item.id,
          });
        }
      }
      roleOptions.value = [...options.values()];
    } catch {
      if (requestId === roleOptionsRequestId) retainSelectedRoleOption();
    } finally {
      if (requestId === roleOptionsRequestId) {
        roleOptionsLoading.value = false;
      }
    }
  },
  250,
);

function searchRoleOptions(value: string) {
  const requestId = ++roleOptionsRequestId;
  const query = value.trim();
  roleOptionsQuery.value = query;
  roleOptionsLoading.value = true;
  void loadRoleOptions(query, requestId);
}

function handleRoleDropdownVisibleChange(open: boolean) {
  if (open) searchRoleOptions('');
}

let actionOptionsRequestId = 0;

function selectedActionCodes() {
  const value = formModel.action_codes;
  return new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [],
  );
}

function retainSelectedActionOptions() {
  const selected = selectedActionCodes();
  actionOptions.value = actionOptions.value.filter((option) =>
    selected.has(option.value),
  );
}

const loadActionOptions = useDebounceFn(
  async (query: string, requestId: number) => {
    try {
      const results = query
        ? await Promise.all([
            listActions({ name: query, p: 1, s: 20 }),
            listActions({ p: 1, s: 20, word: query }),
          ])
        : [await listActions({ p: 1, s: 20 })];
      if (requestId !== actionOptionsRequestId) return;

      const selected = selectedActionCodes();
      const options = new Map(
        actionOptions.value
          .filter((option) => selected.has(option.value))
          .map((option) => [option.value, option]),
      );
      for (const result of results) {
        for (const item of result.items) {
          options.set(item.code, {
            label: `${item.name} · ${item.word}`,
            value: item.code,
          });
        }
      }
      actionOptions.value = [...options.values()];
    } catch {
      if (requestId === actionOptionsRequestId) {
        retainSelectedActionOptions();
      }
    } finally {
      if (requestId === actionOptionsRequestId) {
        actionOptionsLoading.value = false;
      }
    }
  },
  250,
);

function searchActionOptions(value: string) {
  const requestId = ++actionOptionsRequestId;
  const query = value.trim();
  actionOptionsQuery.value = query;
  actionOptionsLoading.value = true;
  void loadActionOptions(query, requestId);
}

function handleActionDropdownVisibleChange(open: boolean) {
  if (open) searchActionOptions('');
}

async function openEditor(record?: Recordable<any>) {
  editingRecord.value = (record as SystemRecord | undefined) ?? null;
  idempotencyKey.value = record ? '' : newIdempotencyKey();
  resetObject(formModel);
  actionGroupOptionsRequestId += 1;
  actionGroupOptionsLoading.value = false;
  actionGroupOptionsQuery.value = '';
  initialActionGroup.value =
    record && props.resource === 'action' && typeof record.group === 'string'
      ? record.group
      : '';
  actionGroupOptions.value = fallbackActionGroupOptions('');
  userOptionsRequestId += 1;
  userOptionsLoading.value = false;
  userOptionsQuery.value = '';
  userOptions.value =
    record && props.resource === 'user-group' && Array.isArray(record.users)
      ? record.users.map(
          (item: { code: string; id: number; username: string }) => ({
            label: `${item.username} · ${item.code}`,
            value: item.id,
          }),
        )
      : [];
  roleOptionsRequestId += 1;
  roleOptionsLoading.value = false;
  roleOptionsQuery.value = '';
  roleOptions.value =
    record && props.resource === 'user' && record.role
      ? [
          {
            label: `${record.role.name} · ${record.role.word}`,
            value: record.role.id,
          },
        ]
      : [];
  actionOptionsRequestId += 1;
  actionOptionsLoading.value = false;
  actionOptionsQuery.value = '';
  actionOptions.value =
    record && 'actions' in record && Array.isArray(record.actions)
      ? record.actions.map((item: ActionRecord) => ({
          label: `${item.name} · ${item.word}`,
          value: item.code,
        }))
      : [];
  for (const field of editorFields.value) {
    if (field.defaultValue !== undefined) {
      formModel[field.key] = field.defaultValue;
    }
  }
  if (record) {
    Object.assign(formModel, record);
    if (props.resource === 'user-group' && 'users' in record) {
      formModel.user_ids = record.users.map((item: { id: number }) => item.id);
    }
    if (props.resource === 'user') {
      formModel.password = '';
      formModel.role_id = record.role_id ?? undefined;
    }
    if (props.resource === 'dictionary' && 'value' in record) {
      formModel.value = formatJSON(record.value);
    }
  }
  initialEditorValues.value = record
    ? snapshotPayload(
        formModel,
        editorFields.value.map((field) => field.key),
      )
    : {};
  modalOpen.value = true;
  await nextTick();
  formRef.value?.clearValidate();
}

function buildPayload() {
  const payload: FormModel = {};
  for (const field of editorFields.value) {
    const value = formModel[field.key];
    if (value !== undefined) payload[field.key] = value;
  }
  if (props.resource === 'user') {
    if (editingRecord.value && !payload.password) delete payload.password;
    if (editingRecord.value) {
      payload.role_id = Number(payload.role_id || 0);
      const initial = {
        ...initialEditorValues.value,
        role_id: Number(initialEditorValues.value.role_id || 0),
      };
      return buildChangedPayload(initial, payload);
    }
    if (payload.role_id !== undefined) {
      payload.role_id = Number(payload.role_id);
    }
  } else if (props.resource === 'dictionary') {
    if (typeof payload.value === 'string') {
      payload.value = JSON.parse(payload.value);
    }
    if (editingRecord.value) {
      const initial = { ...initialEditorValues.value };
      if (typeof initial.value === 'string') {
        initial.value = JSON.parse(initial.value);
      }
      return buildChangedPayload(initial, payload);
    }
  } else if (editingRecord.value) {
    return buildChangedPayload(initialEditorValues.value, payload);
  }
  return payload;
}

async function submitEditor() {
  if (submitting.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    // Field errors are rendered by the form; keep the editor open.
    return;
  }
  if (submitting.value) return;
  const payload = buildPayload();
  if (editingRecord.value && Object.keys(payload).length === 0) {
    message.info($t('system.messages.noChanges'));
    return;
  }
  submitting.value = true;
  try {
    if (editingRecord.value) {
      await config.value.api.update(editingRecord.value.id, payload);
      message.success($t('system.messages.updated'));
    } else {
      idempotencyKey.value ||= newIdempotencyKey();
      await config.value.api.create(idempotencyKey.value, payload);
      message.success($t('system.messages.created'));
    }
    modalOpen.value = false;
    await loadData();
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'status' in error.response &&
      typeof error.response.status === 'number'
        ? error.response.status
        : undefined;
    if (!editingRecord.value && status !== undefined && status !== 409) {
      idempotencyKey.value = newIdempotencyKey();
    }
    throw error;
  } finally {
    submitting.value = false;
  }
}

function openApproval(record: Recordable<any>) {
  approvalUser.value = record as UserRecord;
  approvalDecision.value = 'approve';
  rejectReason.value = '';
  approvalModalOpen.value = true;
}

async function submitApproval() {
  const user = approvalUser.value;
  if (!user) return;
  const reason = rejectReason.value.trim();
  if (approvalDecision.value === 'reject' && !reason) {
    message.warning($t('system.messages.rejectionRequired'));
    return;
  }
  const metadata = { ...(user.metadata || {}) };
  if (approvalDecision.value === 'approve') {
    delete metadata.reject_register_reason;
  } else {
    metadata.reject_register_reason = reason;
  }
  approvalSubmitting.value = true;
  try {
    await updateUser(user.id, {
      metadata,
      status: approvalDecision.value === 'approve' ? 1 : 0,
    });
    message.success(
      approvalDecision.value === 'approve'
        ? $t('system.messages.approved')
        : $t('system.messages.rejected'),
    );
    approvalModalOpen.value = false;
    await loadData();
  } finally {
    approvalSubmitting.value = false;
  }
}

function openLock(record: Recordable<any>) {
  lockUser.value = record as UserRecord;
  lockMode.value = 'until';
  lockUntil.value = dayjs().add(1, 'day').startOf('minute');
  lockModalOpen.value = true;
}

async function submitLock() {
  const user = lockUser.value;
  if (!user || lockSubmitting.value) return;
  if (
    lockMode.value === 'until' &&
    (!lockUntil.value || !lockUntil.value.isAfter(dayjs()))
  ) {
    message.warning($t('system.messages.futureLock'));
    return;
  }
  lockSubmitting.value = true;
  try {
    const metadata = {
      ...(user.metadata || {}),
      lock_expired_at:
        lockMode.value === 'permanent' ? 0 : lockUntil.value!.valueOf(),
    };
    await updateUser(user.id, {
      metadata,
      status: 2,
    });
    message.success($t('system.messages.locked'));
    lockModalOpen.value = false;
    await loadData();
  } finally {
    lockSubmitting.value = false;
  }
}

async function unlockUser(record: Recordable<any>) {
  const metadata = { ...(record.metadata || {}) };
  delete metadata.lock_expired_at;
  await updateUser(Number(record.id), { metadata, status: 1 });
  message.success($t('system.messages.unlocked'));
  await loadData();
}

async function unlockPasswordChange(record: Recordable<any>) {
  const metadata = { ...(record.metadata || {}) };
  delete metadata.password_change_failures;
  await updateUser(Number(record.id), { metadata });
  message.success($t('system.messages.passwordUnlocked'));
  await loadData();
}

async function removeRecords(ids: number[]) {
  await config.value.api.delete(ids);
  message.success($t('system.messages.deleted'));
  if (records.value.length === ids.length && pagination.current > 1) {
    pagination.current -= 1;
  }
  await loadData();
}

function removeSelected() {
  if (selectedRowKeys.value.length === 0) return;
  Modal.confirm({
    content: $t('system.confirm.deleteDescription', {
      count: selectedRowKeys.value.length,
    }),
    onOk: () => removeRecords([...selectedRowKeys.value]),
    title: $t('system.confirm.deleteSelected'),
  });
}

onMounted(loadInitialData);
</script>

<template>
  <Page auto-content-height>
    <div
      ref="tableContainerRef"
      class="flex h-full flex-col gap-4"
      :class="{ 'bg-background p-4': isFullscreen }"
    >
      <Card class="system-section-card shrink-0">
        <Form
          :model="filters"
          class="flex w-full items-start justify-between gap-4"
          layout="inline"
          @finish="search"
        >
          <div class="flex flex-1 flex-wrap items-start gap-x-2 gap-y-3">
            <FormItem
              v-for="field in visibleFilters"
              :key="field.key"
              class="shrink-0"
              :label="field.label"
              :name="field.key"
            >
              <Select
                v-if="
                  field.type === 'status' ||
                  field.type === 'status-multi-select'
                "
                v-model:value="filters[field.key]"
                allow-clear
                :mode="
                  field.type === 'status-multi-select' ? 'multiple' : undefined
                "
                :placeholder="
                  $t('system.common.select', { field: field.label })
                "
                style="width: 280px"
                :options="[
                  { label: $t('system.status.pending'), value: 0 },
                  { label: $t('system.status.active'), value: 1 },
                  { label: $t('system.status.locked'), value: 2 },
                ]"
                @blur="handleFilterBlur()"
                @change="markFiltersChanged"
                @focus="handleFilterFocus"
              />
              <Select
                v-else-if="field.type === 'enabled'"
                v-model:value="filters[field.key]"
                allow-clear
                :placeholder="
                  $t('system.common.select', { field: field.label })
                "
                style="width: 160px"
                :options="[
                  { label: $t('system.enabled.yes'), value: 'true' },
                  { label: $t('system.enabled.no'), value: 'false' },
                ]"
                @blur="handleFilterBlur()"
                @change="markFiltersChanged"
                @focus="handleFilterFocus"
              />
              <Select
                v-else-if="field.type === 'category'"
                v-model:value="filters[field.key]"
                allow-clear
                :placeholder="
                  $t('system.common.select', { field: field.label })
                "
                style="width: 160px"
                :options="[
                  { label: $t('system.category.permission'), value: 0 },
                  { label: $t('system.category.jwt'), value: 1 },
                ]"
                @blur="handleFilterBlur()"
                @change="markFiltersChanged"
                @focus="handleFilterFocus"
              />
              <Select
                v-else-if="field.type === 'input-multi-select'"
                :value="filters[field.key]"
                allow-clear
                class="system-multi-filter"
                :default-active-first-option="false"
                :filter-option="false"
                mode="tags"
                :not-found-content="null"
                :options="filterSuggestionOptions(field.key)"
                :placeholder="$t('system.common.enter', { field: field.label })"
                :show-action="['focus']"
                :token-separators="[',']"
                @blur="handleFilterBlur(field.key)"
                @focus="handleFilterFocus"
                @search="searchBackendFilterSuggestions(field.key, $event)"
                @update:value="updateMultiFilterValue(field.key, $event)"
              >
                <template
                  v-if="field.splitLines"
                  #tagRender="{ closable, label, onClose }"
                >
                  <Tag
                    class="system-multiline-filter-tag"
                    :closable="closable"
                    @close="onClose"
                  >
                    <span class="system-multiline-filter-tag-content">
                      <span
                        v-for="item in resourceRules(String(label))"
                        :key="item"
                      >
                        {{ item }}
                      </span>
                    </span>
                  </Tag>
                </template>
                <template #option="{ label, source, value }">
                  <div
                    v-if="source === 'history'"
                    class="flex w-full min-w-0 items-center justify-between gap-2"
                  >
                    <div
                      v-if="field.splitLines"
                      class="flex min-w-0 flex-1 flex-wrap gap-1"
                    >
                      <Tag
                        v-for="item in resourceRules(String(value))"
                        :key="item"
                        class="m-0 max-w-full truncate"
                      >
                        {{ item }}
                      </Tag>
                    </div>
                    <Tag v-else class="m-0 min-w-0 truncate">{{ value }}</Tag>
                    <button
                      :aria-label="
                        $t('system.suggestions.removeHistory', { value })
                      "
                      class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      tabindex="-1"
                      type="button"
                      @click.prevent.stop="
                        removeFilterHistory(field.key, String(value))
                      "
                      @mousedown.prevent.stop
                    >
                      <IconifyIcon class="size-3.5" icon="lucide:x" />
                    </button>
                  </div>
                  <template v-else-if="source === 'backend'">
                    <Space v-if="field.splitLines" :size="[4, 4]" wrap>
                      <Tag
                        v-for="item in resourceRules(String(value))"
                        :key="item"
                        class="m-0"
                      >
                        <span
                          v-for="(segment, index) in filterSuggestionSegments(
                            item,
                            field.key,
                          )"
                          :key="index"
                          :class="{
                            'font-bold text-red-500': segment.matched,
                          }"
                        >
                          {{ segment.text }}
                        </span>
                      </Tag>
                    </Space>
                    <span v-else>
                      <span
                        v-for="(segment, index) in filterSuggestionSegments(
                          String(label),
                          field.key,
                        )"
                        :key="index"
                        :class="{ 'font-bold text-red-500': segment.matched }"
                      >
                        {{ segment.text }}
                      </span>
                    </span>
                  </template>
                  <span v-else>{{ label }}</span>
                </template>
              </Select>
              <AutoComplete
                v-else
                :value="filters[field.key]"
                allow-clear
                autocomplete="off"
                class="shrink-0"
                :default-active-first-option="false"
                :dropdown-match-select-width="true"
                :filter-option="false"
                :options="filterSuggestionOptions(field.key)"
                :placeholder="$t('system.common.enter', { field: field.label })"
                :show-action="['focus']"
                style="width: 208px"
                @blur="handleFilterBlur()"
                @focus="handleFilterFocus"
                @search="searchBackendFilterSuggestions(field.key, $event)"
                @update:value="updateTextFilterValue(field.key, $event)"
              >
                <template #option="{ label, source, value }">
                  <div
                    v-if="source === 'history'"
                    class="flex w-full min-w-0 items-center justify-between gap-2"
                  >
                    <Tag class="m-0 min-w-0 truncate">{{ value }}</Tag>
                    <button
                      :aria-label="
                        $t('system.suggestions.removeHistory', { value })
                      "
                      class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      tabindex="-1"
                      type="button"
                      @click.prevent.stop="
                        removeFilterHistory(field.key, String(value))
                      "
                      @mousedown.prevent.stop
                    >
                      <IconifyIcon class="size-3.5" icon="lucide:x" />
                    </button>
                  </div>
                  <span v-else-if="source === 'backend'">
                    <span
                      v-for="(segment, index) in filterSuggestionSegments(
                        String(label),
                        field.key,
                      )"
                      :key="index"
                      :class="{ 'font-bold text-red-500': segment.matched }"
                    >
                      {{ segment.text }}
                    </span>
                  </span>
                  <span v-else>{{ label }}</span>
                </template>
              </AutoComplete>
            </FormItem>
          </div>
          <Space class="shrink-0">
            <Button v-if="canRead" html-type="button" @click="resetSearch">
              {{ $t('system.common.reset') }}
            </Button>
            <Button v-if="canRead" html-type="submit" type="primary">
              {{ $t('system.common.search') }}
            </Button>
            <Button
              v-if="canRead && config.filters.length > 3"
              type="link"
              @click="searchExpanded = !searchExpanded"
            >
              {{
                searchExpanded
                  ? $t('system.common.less')
                  : $t('system.common.more')
              }}
              <IconifyIcon
                :icon="
                  searchExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'
                "
              />
            </Button>
          </Space>
        </Form>
      </Card>

      <div class="min-h-0 flex-1">
        <Card class="system-section-card h-full">
          <div class="mb-4 flex items-center justify-between">
            <Space>
              <Button v-if="canCreate" type="primary" @click="openEditor()">
                <IconifyIcon icon="lucide:plus" />
                {{ $t('system.common.create') }}
              </Button>
              <Button
                v-if="canDelete && selectedRowKeys.length > 0"
                danger
                @click="removeSelected"
              >
                {{ $t('system.common.deleteSelected') }}
              </Button>
            </Space>

            <Space class="ml-auto" size="small">
              <Tooltip :title="$t('system.common.refresh')">
                <Button
                  v-if="canRead"
                  :aria-label="$t('system.common.refresh')"
                  :loading="loading"
                  size="small"
                  @click="loadData"
                >
                  <IconifyIcon icon="lucide:refresh-cw" />
                </Button>
              </Tooltip>

              <Popover
                overlay-class-name="system-compact-popover"
                placement="bottomRight"
                trigger="click"
              >
                <template #content>
                  <div class="flex w-24 flex-col">
                    <Button
                      v-for="item in densityOptions"
                      :key="item.value"
                      block
                      size="small"
                      :type="tableSize === item.value ? 'primary' : 'text'"
                      @click="setTableSize(item.value)"
                    >
                      {{ item.label }}
                    </Button>
                  </div>
                </template>
                <Button :aria-label="$t('system.table.density')" size="small">
                  <IconifyIcon icon="lucide:rows-3" />
                </Button>
              </Popover>

              <Tooltip
                :title="
                  isFullscreen
                    ? $t('system.table.exitFullscreen')
                    : $t('system.table.fullscreen')
                "
              >
                <Button
                  :aria-label="$t('system.table.fullscreen')"
                  size="small"
                  @click="toggleFullscreen()"
                >
                  <IconifyIcon
                    :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'"
                  />
                </Button>
              </Tooltip>

              <Popover
                placement="bottomRight"
                :title="$t('system.table.visibleColumns')"
                trigger="click"
              >
                <template #content>
                  <div class="flex w-48 flex-col gap-2">
                    <Checkbox
                      :checked="allColumnsSelected"
                      :indeterminate="columnsIndeterminate"
                      @change="toggleAllColumns"
                    >
                      {{ $t('system.common.selectAll') }}
                    </Checkbox>
                    <div class="border-border border-t"></div>
                    <Checkbox
                      v-for="column in columnOptions"
                      :key="column.value"
                      :checked="visibleColumnKeys.includes(column.value)"
                      @change="toggleColumn(column.value)"
                    >
                      {{ column.label }}
                    </Checkbox>
                  </div>
                </template>
                <Button :aria-label="$t('system.table.columns')" size="small">
                  <IconifyIcon icon="lucide:columns-3" />
                </Button>
              </Popover>

              <Popover
                overlay-class-name="system-compact-popover"
                placement="bottomRight"
                :title="$t('system.table.style')"
                trigger="click"
              >
                <template #content>
                  <div
                    class="grid w-40 grid-cols-[1fr_auto] items-center gap-2"
                  >
                    <span>{{ $t('system.table.bordered') }}</span>
                    <Switch
                      v-model:checked="tableSettings.bordered"
                      size="small"
                    />
                    <span>{{ $t('system.table.striped') }}</span>
                    <Switch
                      v-model:checked="tableSettings.striped"
                      size="small"
                    />
                    <Tooltip :title="$t('system.table.stickyHint')">
                      <span class="cursor-help">{{
                        $t('system.table.sticky')
                      }}</span>
                    </Tooltip>
                    <Switch
                      v-model:checked="tableSettings.sticky"
                      size="small"
                    />
                  </div>
                </template>
                <Button :aria-label="$t('system.table.style')" size="small">
                  <IconifyIcon icon="lucide:settings-2" />
                </Button>
              </Popover>
            </Space>
          </div>

          <Table
            :bordered="tableSettings.bordered"
            :columns="tableColumns"
            :data-source="records"
            :loading="loading"
            :pagination="{
              current: pagination.current,
              pageSize: pagination.pageSize,
              showSizeChanger: true,
              showTotal: (total: number) =>
                $t('system.table.total', { count: total }),
              total: pagination.total,
            }"
            row-key="id"
            :row-class-name="tableRowClassName"
            :row-selection="showSelectionColumn ? rowSelection : undefined"
            :scroll="{ x: tableScrollWidth }"
            :size="tableSize"
            :sticky="tableSettings.sticky"
            @change="handleTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'operation'">
                <Space>
                  <Button
                    v-if="
                      canUpdate &&
                      props.resource === 'user' &&
                      record.status === 0
                    "
                    size="small"
                    type="link"
                    @click="openApproval(record)"
                  >
                    {{ $t('system.user.approve') }}
                  </Button>
                  <Button
                    v-if="canUpdate"
                    size="small"
                    type="link"
                    @click="openEditor(record)"
                  >
                    {{ $t('system.common.edit') }}
                  </Button>
                  <Button
                    v-if="
                      canUpdate &&
                      props.resource === 'user' &&
                      record.status === 1
                    "
                    size="small"
                    type="link"
                    @click="openLock(record)"
                  >
                    {{ $t('system.user.lock') }}
                  </Button>
                  <Popconfirm
                    v-if="
                      canUpdate &&
                      props.resource === 'user' &&
                      record.status === 2
                    "
                    :title="
                      $t('system.confirm.unlock', { name: record.username })
                    "
                    @confirm="unlockUser(record)"
                  >
                    <Button size="small" type="link">{{
                      $t('system.user.unlock')
                    }}</Button>
                  </Popconfirm>
                  <Popconfirm
                    v-if="
                      canUpdate &&
                      props.resource === 'user' &&
                      userPasswordChangeFailures(record) > 0
                    "
                    :title="
                      $t('system.confirm.unlockPassword', {
                        name: record.username,
                      })
                    "
                    @confirm="unlockPasswordChange(record)"
                  >
                    <Button size="small" type="link">
                      {{ $t('system.user.unlockPassword') }}
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    v-if="canDelete"
                    :title="
                      $t('system.confirm.delete', {
                        name: getRecordLabel(record),
                      })
                    "
                    @confirm="removeRecords([getRecordID(record)])"
                  >
                    <Button danger size="small" type="link">{{
                      $t('system.common.delete')
                    }}</Button>
                  </Popconfirm>
                </Space>
              </template>
              <template v-else-if="columnDisplay(column) === 'date'">
                {{ formatDate(columnValue(record, column)) }}
              </template>
              <template v-else-if="columnDisplay(column) === 'resource-rules'">
                <Space
                  v-if="resourceRules(columnValue(record, column)).length"
                  direction="vertical"
                  :size="4"
                >
                  <Tag
                    v-for="(rule, index) in resourceRules(
                      columnValue(record, column),
                    )"
                    :key="`${rule}-${index}`"
                    class="system-resource-rule-tag m-0"
                    :color="resourceRuleColor(rule, record.category)"
                    :style="{
                      maxWidth: `${adaptiveColumnMaxWidth - 32}px`,
                    }"
                  >
                    {{ rule }}
                  </Tag>
                </Space>
                <span v-else>-</span>
              </template>
              <template v-else-if="columnDisplay(column) === 'actions'">
                <Space v-if="record.action_codes?.length" wrap>
                  <RouterLink
                    v-for="code in record.action_codes"
                    :key="code"
                    :to="{
                      name: 'SystemAction',
                      query: { code: record.action_codes.join(',') },
                    }"
                  >
                    <Tag class="cursor-pointer" color="blue">
                      {{ code }}
                    </Tag>
                  </RouterLink>
                </Space>
                <span v-else>-</span>
              </template>
              <template v-else-if="columnDisplay(column) === 'users'">
                <Space v-if="record.users?.length" wrap>
                  <RouterLink
                    v-for="item in record.users"
                    :key="item.id"
                    :to="{
                      name: 'SystemUser',
                      query: { username: item.username },
                    }"
                  >
                    <Tag class="cursor-pointer">{{ item.username }}</Tag>
                  </RouterLink>
                </Space>
                <span v-else>-</span>
              </template>
              <template v-else-if="columnDisplay(column) === 'role'">
                <RouterLink
                  v-if="record.role"
                  class="text-primary hover:underline"
                  :to="{
                    name: 'SystemRole',
                    query: { word: record.role.word },
                  }"
                >
                  {{ record.role.name }}
                </RouterLink>
                <span v-else>-</span>
              </template>
              <template v-else-if="columnDisplay(column) === 'status'">
                <Tag :color="statusColor(record.status)">
                  {{ statusLabel(record.status) }}
                </Tag>
              </template>
              <template v-else-if="columnDisplay(column) === 'json'">
                <div class="flex max-w-72 flex-col gap-2">
                  <div
                    v-if="props.resource === 'user' && record.status === 2"
                    class="flex items-center gap-1"
                  >
                    <span class="text-muted-foreground">{{
                      $t('system.user.lockLabel')
                    }}</span>
                    <Tag
                      v-if="userLockExpiration(record) === 0"
                      class="m-0"
                      color="red"
                    >
                      {{ $t('system.user.permanent') }}
                    </Tag>
                    <Tag
                      v-else-if="userLockExpiration(record) !== undefined"
                      class="m-0"
                      color="orange"
                    >
                      Until
                      {{ formatLockExpiration(userLockExpiration(record)) }}
                    </Tag>
                    <Tag v-else class="m-0">{{
                      $t('system.common.unknown')
                    }}</Tag>
                  </div>
                  <pre class="m-0 max-h-40 overflow-auto whitespace-pre-wrap">{{
                    formatJSON(columnValue(record, column))
                  }}</pre>
                </div>
              </template>
              <template v-else-if="columnDisplay(column) === 'boolean'">
                <Tag :color="columnValue(record, column) ? 'green' : 'default'">
                  {{
                    columnValue(record, column)
                      ? $t('system.enabled.yes')
                      : $t('system.enabled.no')
                  }}
                </Tag>
              </template>
              <template v-else-if="columnDisplay(column) === 'category'">
                <Tag :color="record.category === 0 ? 'blue' : 'green'">
                  {{
                    record.category === 0
                      ? $t('system.category.permission')
                      : $t('system.category.jwt')
                  }}
                </Tag>
              </template>
            </template>
          </Table>
        </Card>
      </div>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="submitting"
      :title="
        $t(
          editingRecord
            ? 'system.common.editTitle'
            : 'system.common.createTitle',
          { entity: config.entity },
        )
      "
      width="680px"
      @ok="submitEditor"
    >
      <Form
        ref="formRef"
        :label-col="{ span: 6 }"
        :model="formModel"
        :rules="formRules"
        :wrapper-col="{ span: 17 }"
      >
        <FormItem
          v-for="field in editorFields"
          :key="field.key"
          :extra="
            field.type === 'action-group'
              ? $t('system.hints.actionGroup')
              : field.type === 'action-select'
                ? $t('system.hints.action')
                : field.type === 'role-select'
                  ? $t('system.hints.role')
                  : field.type === 'user-select'
                    ? $t('system.hints.user')
                    : undefined
          "
          :label="
            editingRecord && field.editLabel ? field.editLabel : field.label
          "
          :name="field.key"
        >
          <AutoComplete
            v-if="field.type === 'action-group'"
            v-model:value="formModel[field.key]"
            allow-clear
            autocomplete="off"
            :filter-option="false"
            :not-found-content="
              actionGroupOptionsLoading
                ? $t('system.suggestions.searching')
                : null
            "
            :options="actionGroupOptions"
            :placeholder="$t('system.suggestions.actionGroup')"
            :show-action="['focus']"
            @dropdown-visible-change="handleActionGroupDropdownVisibleChange"
            @search="searchActionGroupOptions"
          >
            <template #option="{ isNew, label }">
              <span v-if="isNew" class="text-muted-foreground">{{
                $t('system.hints.createGroup', { name: label })
              }}</span>
              <template v-else>
                <span
                  v-for="(segment, index) in matchingSegments(
                    String(label),
                    actionGroupOptionsQuery,
                  )"
                  :key="index"
                  :class="{ 'font-bold text-red-500': segment.matched }"
                >
                  {{ segment.text }}
                </span>
              </template>
            </template>
          </AutoComplete>
          <Textarea
            v-else-if="field.type === 'textarea' || field.type === 'json'"
            v-model:value="formModel[field.key]"
            :auto-size="
              field.type === 'json'
                ? { minRows: 8, maxRows: 18 }
                : { minRows: 2, maxRows: 6 }
            "
            :placeholder="
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
          <InputPassword
            v-else-if="field.type === 'password'"
            v-model:value="formModel[field.key]"
            :placeholder="
              (editingRecord && field.editPlaceholder) ||
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
          <Select
            v-else-if="field.type === 'category'"
            v-model:value="formModel[field.key]"
            :options="[
              { label: $t('system.category.permission'), value: 0 },
              { label: $t('system.category.jwt'), value: 1 },
            ]"
          />
          <Switch
            v-else-if="field.type === 'enabled'"
            v-model:checked="formModel[field.key]"
          />
          <Select
            v-else-if="field.type === 'status'"
            v-model:value="formModel[field.key]"
            :options="[
              { label: $t('system.status.pending'), value: 0 },
              { label: $t('system.status.active'), value: 1 },
              { label: $t('system.status.locked'), value: 2 },
            ]"
          />
          <Select
            v-else-if="field.type === 'action-select'"
            v-model:value="formModel[field.key]"
            allow-clear
            :filter-option="false"
            :loading="actionOptionsLoading"
            mode="multiple"
            :options="actionOptions"
            :placeholder="$t('system.suggestions.action')"
            show-search
            @dropdown-visible-change="handleActionDropdownVisibleChange"
            @search="searchActionOptions"
          >
            <template #option="{ label }">
              <span
                v-for="(segment, index) in matchingSegments(
                  String(label),
                  actionOptionsQuery,
                )"
                :key="index"
                :class="{ 'font-bold text-red-500': segment.matched }"
              >
                {{ segment.text }}
              </span>
            </template>
          </Select>
          <Select
            v-else-if="field.type === 'role-select'"
            v-model:value="formModel[field.key]"
            allow-clear
            :filter-option="false"
            :loading="roleOptionsLoading"
            :options="roleOptions"
            :placeholder="$t('system.suggestions.role')"
            show-search
            @dropdown-visible-change="handleRoleDropdownVisibleChange"
            @search="searchRoleOptions"
          >
            <template #option="{ label }">
              <span
                v-for="(segment, index) in matchingSegments(
                  String(label),
                  roleOptionsQuery,
                )"
                :key="index"
                :class="{ 'font-bold text-red-500': segment.matched }"
              >
                {{ segment.text }}
              </span>
            </template>
          </Select>
          <Select
            v-else-if="field.type === 'user-select'"
            v-model:value="formModel[field.key]"
            allow-clear
            :filter-option="false"
            :loading="userOptionsLoading"
            mode="multiple"
            :options="userOptions"
            :placeholder="$t('system.suggestions.user')"
            show-search
            @dropdown-visible-change="handleUserDropdownVisibleChange"
            @search="searchUserOptions"
          >
            <template #option="{ label }">
              <span
                v-for="(segment, index) in matchingSegments(
                  String(label),
                  userOptionsQuery,
                )"
                :key="index"
                :class="{ 'font-bold text-red-500': segment.matched }"
              >
                {{ segment.text }}
              </span>
            </template>
          </Select>
          <Input
            v-else
            v-model:value="formModel[field.key]"
            :placeholder="
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
        </FormItem>
      </Form>
    </Modal>

    <Modal
      v-model:open="lockModalOpen"
      :confirm-loading="lockSubmitting"
      :title="$t('system.user.lockTitle', { name: lockUser?.username || '' })"
      @ok="submitLock"
    >
      <Form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <FormItem :label="$t('system.user.lockType')" required>
          <Select
            v-model:value="lockMode"
            :options="[
              { label: $t('system.user.lockUntil'), value: 'until' },
              { label: $t('system.user.permanent'), value: 'permanent' },
            ]"
          />
        </FormItem>
        <FormItem
          v-if="lockMode === 'until'"
          :label="$t('system.user.lockedUntil')"
          required
        >
          <DatePicker
            v-model:value="lockUntil"
            class="w-full"
            :disabled-date="disablePastDate"
            format="YYYY-MM-DD HH:mm:ss"
            show-time
          />
        </FormItem>
      </Form>
    </Modal>

    <Modal
      v-model:open="approvalModalOpen"
      :confirm-loading="approvalSubmitting"
      :title="$t('system.user.review')"
      @ok="submitApproval"
    >
      <Form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <FormItem :label="$t('system.user.entity')">
          {{ approvalUser?.username }}
        </FormItem>
        <FormItem :label="$t('system.user.decision')">
          <Select
            v-model:value="approvalDecision"
            :options="[
              { label: $t('system.user.approve'), value: 'approve' },
              { label: $t('system.user.reject'), value: 'reject' },
            ]"
          />
        </FormItem>
        <FormItem
          v-if="approvalDecision === 'reject'"
          :label="$t('system.user.reason')"
          required
        >
          <Textarea
            v-model:value="rejectReason"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            :placeholder="$t('system.user.rejectionPlaceholder')"
          />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<style scoped>
:deep(.system-section-card.ant-card) {
  border-color: hsl(var(--border));
  border-radius: 8px;
}

:global(.system-compact-popover .ant-popover-inner) {
  min-width: 0;
  padding: 8px;
}

:global(.system-compact-popover .ant-popover-title) {
  min-width: 0;
  margin-bottom: 6px;
}

:deep(.system-table-row-striped > td) {
  background-color: rgb(127 127 127 / 6%) !important;
}

:deep(.ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}

:deep(.system-table-row-striped > .ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}

:deep(.system-resource-rule-tag) {
  overflow-wrap: anywhere;
  white-space: normal;
}

.system-multi-filter {
  width: 280px;
}

:deep(.system-multi-filter .ant-select-selection-overflow) {
  row-gap: 4px;
  padding-block: 2px;
}

:deep(.system-multiline-filter-tag) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: auto;
  padding-block: 2px;
  text-align: left;
  white-space: normal;
}

.system-multiline-filter-tag-content {
  display: flex;
  flex-direction: column;
}
</style>
