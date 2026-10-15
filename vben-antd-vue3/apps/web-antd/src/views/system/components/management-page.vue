<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';

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
import type {
  SystemSummary,
  SystemSummaryDay,
  SystemSummaryGroup,
} from '#/api/system/insights';

import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useTimezoneStore } from '@vben/stores';

import {
  useDebounceFn,
  useFullscreen,
  useResizeObserver,
  useTimeoutFn,
} from '@vueuse/core';
import {
  Alert,
  AutoComplete,
  Avatar,
  Button,
  Checkbox,
  DatePicker,
  FormItem,
  Input,
  InputPassword,
  message,
  Modal,
  Pagination,
  Popconfirm,
  Result,
  Select,
  Space,
  Switch,
  Tag,
  Textarea,
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
import { getSummaryUserGroup, getSystemSummary } from '#/api/system/insights';
import LoadWarning from '#/components/load-warning.vue';
import { renderSkeletonOptions } from '#/components/skeleton-options';
import Table from '#/components/skeleton-table.vue';
import { useDefaultPageSize } from '#/composables/use-default-page-size';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import AssociationEditor from './association-editor.vue';
import ManagementCard from './management-card.vue';
import ManagementDrawer from './management-drawer.vue';
import ManagementForm from './management-form.vue';
import ManagementSearch from './management-search.vue';
import ManagementToolbar from './management-toolbar.vue';
import ManagementViewSwitch from './management-view-switch.vue';
import RuleListEditor from './rule-list-editor.vue';
import SystemOverview from './system-overview.vue';
import SystemRecordDetail from './system-record-detail.vue';
import GroupMembers from './group-members.vue';
import { memberCount, memberPreview } from './system-record-format';
import SystemResourceCards from './system-resource-cards.vue';
import { buildChangedPayload, buildUserGroupChanges, snapshotPayload } from './update-payload';
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
          dataIndex: 'login_count',
          key: 'login_count',
          title: $t('system-insights.loginCount'),
          width: 100,
        },
        {
          dataIndex: 'last_logged_in_at',
          display: 'date',
          key: 'last_logged_in_at',
          title: $t('system-insights.lastLogin'),
          width: 180,
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
        {
          dataIndex: 'metadata',
          display: 'json',
          key: 'metadata',
          title: $t('system.fields.metadata'),
          width: 440,
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
const records = ref<SystemRecord[]>([]);
const selectedRowKeys = ref<number[]>([]);
const filters = reactive<FormModel>({});

const loadError = ref(false);
const timezone = useTimezoneStore();
const viewMode = ref<'cards' | 'matrix' | 'table'>(
  props.resource === 'user'
    ? 'table'
    : props.resource === 'action'
      ? 'matrix'
      : 'cards',
);
const viewOptions = computed(() => [
  props.resource === 'action'
    ? { value: 'matrix', label: $t('system-insights.matrix'), icon: 'lucide:table-properties' }
    : { value: 'cards', label: $t('system-insights.cards'), icon: 'lucide:layout-grid' },
  { value: 'table', label: $t('system-insights.table'), icon: 'lucide:list' },
]);
const summary = ref<SystemSummary>();
const summaryLoading = ref(false);
const summaryError = ref(false);
const summaryDays = ref(14);
const selectedRecord = ref<null | SystemRecord>(null);
const selectedDay = ref('');
const selectedDayKind = ref<'created' | 'login'>('created');
let listRequest = 0;
let lastLoadedQuery = '';
let pendingListQuery = '';
let summaryRequest = 0;
let active = true;
const detailsOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref(false);
let detailRequest = 0;
let detailGroupID: number | undefined;
watch(detailsOpen, (open) => {
  if (!open) {
    ++detailRequest;
    selectedRecord.value = null;
    detailLoading.value = false;
    detailError.value = false;
  }
});
const selectedStatus = computed(() =>
  Array.isArray(filters.status)
    ? filters.status.length === 1
      ? Number(filters.status[0])
      : undefined
    : typeof filters.status === 'number'
      ? filters.status
      : undefined,
);
const selectedExactGroups = computed<string[]>(() =>
  Array.isArray(filters.groups_exact) ? filters.groups_exact : [],
);
const selectedRoleGroups = computed<string[]>(() =>
  Array.isArray(filters.groups_all) ? filters.groups_all : [],
);
const selectedRolePermissionLabel = computed(() =>
  ['role', 'user-group'].includes(props.resource) && typeof filters.has_permissions === 'boolean'
    ? $t(
        filters.has_permissions
          ? 'system-insights.withPermissions'
          : 'system-insights.withoutPermissions',
      )
    : '',
);
const selectedPermissionGroups = computed(() =>
  props.resource === 'role'
    ? selectedRoleGroups.value
    : selectedExactGroups.value,
);

async function loadOverview() {
  const request = ++summaryRequest;
  if (!canRead.value || !active) {
    summary.value = undefined;
    summaryLoading.value = false;
    return;
  }
  summaryLoading.value = true;
  summaryError.value = false;
  try {
    const result = await getSystemSummary(
      props.resource,
      props.resource === 'user'
        ? { days: summaryDays.value, time_zone: timezone.timezone }
        : {},
    );
    if (request === summaryRequest && active) {
      summary.value = result;
      if (selectedDay.value) {
        const day = result.trend.find(
          (item) => item.date === selectedDay.value,
        );
        const prefix =
          selectedDayKind.value === 'login' ? 'last_logged_in' : 'created';
        if (
          day &&
          (filters[`${prefix}_from`] !== day.from ||
            filters[`${prefix}_to`] !== day.to)
        ) {
          setDayRange(day, selectedDayKind.value);
          void loadData();
        }
      }
    }
  } catch {
    if (request === summaryRequest && active) {
      summary.value = undefined;
      summaryError.value = true;
    }
  } finally {
    if (request === summaryRequest) summaryLoading.value = false;
  }
}
async function refreshAll() {
  await Promise.all([loadData(), loadOverview()]);
}
async function quickFilter(input: {
  key: string;
  value: boolean | number | string | undefined;
}) {
  if (input.key === 'status') {
    filters.status =
      input.value !== undefined && selectedStatus.value !== input.value
        ? [input.value]
        : undefined;
  } else {
    filters[input.key] = input.value;
  }
  await search();
}
function setDayRange(day: SystemSummaryDay, kind: 'created' | 'login') {
  filters.created_from = kind === 'created' ? day.from : undefined;
  filters.created_to = kind === 'created' ? day.to : undefined;
  filters.last_logged_in_from = kind === 'login' ? day.from : undefined;
  filters.last_logged_in_to = kind === 'login' ? day.to : undefined;
}
async function selectDay(
  day: SystemSummaryDay,
  kind: 'created' | 'login' = 'created',
) {
  if (selectedDay.value === day.date && selectedDayKind.value === kind) {
    await clearDay();
    return;
  }
  selectedDay.value = day.date;
  selectedDayKind.value = kind;
  setDayRange(day, kind);
  await search();
}
async function clearDay() {
  selectedDay.value = '';
  selectedDayKind.value = 'created';
  filters.created_from = undefined;
  filters.created_to = undefined;
  filters.last_logged_in_from = undefined;
  filters.last_logged_in_to = undefined;
  await search();
}
async function selectPermissionGroup(name?: string) {
  filters.group = undefined;
  filters.group_exact = undefined;
  filters.groups_exact = name === undefined
    ? []
    : selectedExactGroups.value.includes(name)
      ? selectedExactGroups.value.filter((group) => group !== name)
      : [...selectedExactGroups.value, name];
  await search();
}
async function toggleRolePermissionGroup(name: string) {
  filters.groups_all = selectedRoleGroups.value.includes(name)
    ? selectedRoleGroups.value.filter((group) => group !== name)
    : [...selectedRoleGroups.value, name];
  await search();
}
async function clearPermissionGroup(name: string) {
  if (props.resource === 'role') {
    filters.groups_all = selectedRoleGroups.value.filter((group) => group !== name);
    await search();
  } else {
    await selectPermissionGroup(name);
  }
}
function clearPermissionGroupLabel(name: string) {
  return props.resource === 'role'
    ? $t('system-insights.clearRoleGroup', {
        name: name || $t('system-insights.ungrouped'),
      })
    : $t('system-insights.clearGroup');
}
async function selectUserGroup(group: SystemSummaryGroup) {
  detailGroupID = group.id;
  await loadGroupDetail();
}
async function loadGroupDetail() {
  if (!detailGroupID || !canRead.value || !active) return;
  const request = ++detailRequest;
  selectedRecord.value = records.value.find((record) => record.id === detailGroupID) ?? selectedRecord.value;
  detailLoading.value = true;
  detailError.value = false;
  detailsOpen.value = true;
  try {
    const record = await getSummaryUserGroup(detailGroupID);
    if (request === detailRequest && active && canRead.value)
      selectedRecord.value = record;
  } catch {
    if (request === detailRequest && active) detailError.value = true;
  } finally {
    if (request === detailRequest) detailLoading.value = false;
  }
}
function selectAllCards(checked: boolean) {
  selectedRowKeys.value = checked
    ? records.value.map((record) => record.id)
    : [];
}
function openDetail(record: Recordable<any>) {
  ++detailRequest;
  detailLoading.value = false;
  detailError.value = false;
  detailGroupID = undefined;
  selectedRecord.value =
    records.value.find((item) => item.id === record.id) ?? null;
  detailsOpen.value = selectedRecord.value !== null;
}
function editDetail(record: SystemRecord) {
  void openEditor(record);
}
function confirmRemove(record: SystemRecord) {
  Modal.confirm({
    title: $t('system.confirm.delete', { name: getRecordLabel(record) }),
    onOk: () => removeRecords([record.id]),
  });
}
watch([summaryDays, () => timezone.timezone], () => {
  if (props.resource === 'user') {
    summary.value = undefined;
    summaryError.value = false;
    void clearDay();
    void loadOverview();
  }
});
watch(
  () => filters.group,
  (value) => {
    if (value && (!Array.isArray(value) || value.length)) {
      filters.group_exact = undefined;
      filters.groups_exact = undefined;
    }
  },
);
watch(canRead, (value) => {
  if (value && active) void refreshAll();
  else {
    ++listRequest;
    ++summaryRequest;
    records.value = [];
    summary.value = undefined;
    detailsOpen.value = false;
    selectedRecord.value = null;
    loading.value = false;
    summaryLoading.value = false;
  }
});

const submitting = ref(false);
const filterHistory = reactive<FilterHistory>(loadFilterHistory());
const backendFilterSuggestions = reactive<Record<string, string[]>>({});
const filterSuggestionQueries = reactive<Record<string, string>>({});
const filterSuggestionsLoading = reactive<Record<string, boolean>>({});
const backendSuggestionRequestIds = new Map<string, number>();
const modalOpen = ref(false);
const editingRecord = ref<null | SystemRecord>(null);
const idempotencyKey = ref('');
const formModel = reactive<FormModel>({});
const initialEditorValues = ref<FormModel>({});
const formRef = ref<InstanceType<typeof ManagementForm>>();
const approvalModalOpen = ref(false);
const approvalSubmitting = ref(false);
const approvalUser = ref<null | UserRecord>(null);
const approvalDecision = ref<'approve' | 'reject'>('approve');
const rejectReason = ref('');
const approvalWarningVisible = ref(false);
const lockModalOpen = ref(false);
const lockSubmitting = ref(false);
const lockUser = ref<null | UserRecord>(null);
const lockMode = ref<LockMode>('until');
const lockUntil = ref<Dayjs>();
const lockWarningVisible = ref(false);
const actionGroupOptions = ref<ActionGroupOption[]>([]);
const actionGroupOptionsLoading = ref(false);
const actionGroupOptionsQuery = ref('');
const initialActionGroup = ref('');
const roleOptions = ref<SearchableSelectOption<number>[]>([]);
const roleOptionsLoading = ref(false);
const roleOptionsQuery = ref('');
const defaultPageSize = useDefaultPageSize();
const pagination = reactive({ current: 1, pageSize: defaultPageSize.value, total: 0 });
const searchExpanded = ref(false);
const filtersDirty = ref(false);
const tableContainerRef = ref<HTMLElement>();
const tableSize = ref<TableSize>('middle');
const tableSettings = reactive({
  bordered: true,
  sticky: true,
  striped: true,
});
const selectionColumnKey = '__selection__';
const selectionColumnWidth = 48;
const adaptiveColumnMinWidth = 72;
const adaptiveColumnMaxWidth = 560;
const metadataColumnMaxWidth = 320;
const visibleColumnKeys = ref<string[]>([
  selectionColumnKey,
  ...(props.resource === 'user'
    ? [
        'username',
        'role',
        'status',
        'login_count',
        'last_logged_in_at',
        'metadata',
      ]
    : config.value.columns.map((column) => column.key)),
]);
const { isFullscreen, toggle: toggleFullscreen } =
  useFullscreen(tableContainerRef);
const { start: scheduleFilterSearch, stop: cancelFilterSearch } = useTimeoutFn(
  async () => {
    if (!filtersDirty.value || !canRead.value) return;
    filtersDirty.value = false;
    const key = listQueryKey(buildListParams(1));
    if (key === lastLoadedQuery || key === pendingListQuery) return;
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

const editorSnapshot = ref('');
const editorError = ref('');
let editorRequest = 0;
const editorDirty = computed(() => modalOpen.value && editorSnapshot.value !== JSON.stringify(
  snapshotPayload(formModel, editorFields.value.map((field) => field.key)),
));
const drawerTitle = computed(() => $t(
  modalOpen.value
    ? (editingRecord.value ? 'system.common.editTitle' : 'system.common.createTitle')
    : 'system-editor.detailTitle',
  { entity: config.value.entity },
));
function closeEditorPanel(returnToDetail = false) {
  if (submitting.value) return;
  const close = () => {
    ++editorRequest;
    if (returnToDetail && editingRecord.value) {
      selectedRecord.value = editingRecord.value;
      detailsOpen.value = true;
    } else detailsOpen.value = false;
    modalOpen.value = false;
    editorError.value = '';
    formModel.password = '';
  };
  if (editorDirty.value) {
    Modal.confirm({
      title: $t('system-editor.discardTitle'),
      okText: $t('system-editor.discard'),
      cancelText: $t('system-editor.continue'),
      onOk: close,
    });
  } else close();
}


const columnOptions = computed(() => [
  { label: $t('system.common.selection'), value: selectionColumnKey },
  ...config.value.columns
    .filter(
      (column) =>
        viewMode.value !== 'matrix' ||
        ['button', 'menu', 'name', 'resource'].includes(column.key),
    )
    .map((column) => ({ label: column.title, value: column.key })),
]);
const showSelectionColumn = computed(() =>
  visibleColumnKeys.value.includes(selectionColumnKey),
);
const allColumnsSelected = computed(() =>
  columnOptions.value.every((column) =>
    visibleColumnKeys.value.includes(column.value),
  ),
);
const columnsIndeterminate = computed(
  () =>
    columnOptions.value.some((column) =>
      visibleColumnKeys.value.includes(column.value),
    ) && !allColumnsSelected.value,
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
    return memberPreview(record).map((user) => user.username);
  }
  if (column.display === 'resource-rules') {
    return 'resource' in record ? resourceRules(record.resource) : [];
  }
  if (column.display === 'json') {
    return formatJSON(columnValue(record, column)).split('\n');
  }
  const value = columnValue(record, column);
  if (column.display === 'date') return [formatDate(value)];
  if (column.display === 'role') {
    return [
      value && typeof value === 'object' && 'name' in value
        ? String(value.name)
        : '-',
    ];
  }
  if (column.display === 'status') return [statusLabel(value) || '-'];
  if (column.display === 'boolean') {
    return [$t(value ? 'system.enabled.yes' : 'system.enabled.no')];
  }
  if (column.display === 'category') {
    return [
      $t(value === 0 ? 'system.category.permission' : 'system.category.jwt'),
    ];
  }
  return [
    value === null || value === undefined || value === '' ? '-' : String(value),
  ];
}

function estimatedTagWidth(value: string, maximumWidth: number) {
  let textWidth = 0;
  for (const character of value) {
    textWidth += (character.codePointAt(0) ?? 0) > 255 ? 14 : 8;
  }
  return Math.min(maximumWidth, Math.max(48, textWidth + 18));
}

function adaptiveColumnWidth(column: DisplayColumn) {
  const maximumColumnWidth =
    column.width ??
    (column.display === 'json'
      ? metadataColumnMaxWidth
      : adaptiveColumnMaxWidth);
  let widestRow = Math.min(
    maximumColumnWidth,
    Math.max(
      adaptiveColumnMinWidth,
      estimatedTagWidth(column.title, maximumColumnWidth) + 14,
    ),
  );
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

const operationActions = ref<HTMLElement[]>([]);
const operationContentWidth = ref(0);
const managementTableRef = ref<InstanceType<typeof Table>>();
const tableViewportWidth = ref(0);
useResizeObserver(
  () => {
    const root = managementTableRef.value?.$el as HTMLElement | undefined;
    return root?.querySelector<HTMLElement>('.ant-table-container');
  },
  ([entry]) => {
    tableViewportWidth.value = Math.floor(entry?.contentRect.width ?? 0);
  },
);
// Reserve the page's complete action set even when a particular row has fewer actions.
const operationColumnWidth = computed(() => {
  const labels = [
    ...(canRead.value ? [$t('system-insights.details')] : []),
    ...(canUpdate.value ? [$t('system.common.edit')] : []),
    ...(canUpdate.value && props.resource === 'user'
      ? [[ $t('system.user.approve'), $t('system.user.lock'), $t('system.user.unlock') ]
          .sort((a, b) => b.length - a.length)[0]!]
      : []),
    ...(canDelete.value ? [$t('system.common.delete')] : []),
  ];
  const textWidth = labels.reduce((total, label) => total + estimatedTagWidth(label, 1000) - 18 + 16, 0);
  return Math.max(textWidth + Math.max(0, labels.length - 1) * 8 + 32, operationContentWidth.value);
});

function measureOperationActions() {
  operationContentWidth.value = Math.max(
    0,
    ...operationActions.value.map((element) => {
      if (!element.isConnected) return 0;
      const cell = element.closest('td');
      if (!cell) return 0;
      const style = window.getComputedStyle(cell);
      return Math.ceil(
        element.getBoundingClientRect().width +
          (Number.parseFloat(style.paddingLeft) || 0) +
          (Number.parseFloat(style.paddingRight) || 0),
      );
    }),
  );
}

watch(
  [
    records,
    viewMode,
    tableSize,
    canRead,
    canUpdate,
    canDelete,
    tableContainerRef,
    visibleColumnKeys,
    () => tableSettings.sticky,
  ],
  () => {
    operationActions.value = [
      ...(tableContainerRef.value?.querySelectorAll<HTMLElement>(
        '.system-operation-actions',
      ) ?? []),
    ];
    measureOperationActions();
  },
  { flush: 'post' },
);
useResizeObserver(operationActions, measureOperationActions);

const contentTableColumns = computed<TableColumnsType<SystemRecord>>(() => {
  const matrix = props.resource === 'action' && viewMode.value === 'matrix';
  const columns: TableColumnsType<SystemRecord> = config.value.columns
    .filter((column) =>
      matrix
        ? ['button', 'menu', 'name', 'resource'].includes(column.key) &&
          visibleColumnKeys.value.includes(column.key)
        : visibleColumnKeys.value.includes(column.key),
    )
    .map((column) => ({
      ...column,
      width: matrix
        ? ({ name: 160, resource: 240, menu: 110, button: 110 }[column.key] ??
          120)
        : adaptiveColumnWidth(column),
    }));
  if (canRead.value || canUpdate.value || canDelete.value)
    columns.push({
      fixed: 'right',
      key: 'operation',
      title: $t('system.common.actions'),
      width: operationColumnWidth.value,
    });
  return columns;
});

const tableColumns = computed(() => {
  const columns = contentTableColumns.value;
  const dataWidth = columns.reduce(
    (total, column) =>
      total + (column.key === 'operation' ? 0 : Number(column.width)),
    0,
  );
  if (!dataWidth) return columns;
  const fixedWidth =
    (showSelectionColumn.value ? selectionColumnWidth : 0) +
    (columns.some((column) => column.key === 'operation')
      ? operationColumnWidth.value
      : 0);
  // Distribute spare width across data columns, keeping action buttons compact.
  let remainingWidth = Math.max(dataWidth, tableViewportWidth.value - fixedWidth);
  let remainingContentWidth = dataWidth;
  return columns.map((column) => {
    if (column.key === 'operation') return column;
    const contentWidth = Number(column.width);
    const width = Math.round(
      (contentWidth / remainingContentWidth) * remainingWidth,
    );
    remainingWidth -= width;
    remainingContentWidth -= contentWidth;
    return { ...column, width };
  });
});

const tableScrollWidth = computed(() => {
  let width = showSelectionColumn.value ? selectionColumnWidth : 0;
  for (const column of contentTableColumns.value) {
    if ('width' in column && typeof column.width === 'number') {
      width += column.width;
    }
  }
  return width;
});

const rowSelection = computed(() => ({
  columnWidth: selectionColumnWidth,
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
  return typeof value === 'number'
    ? dayjs(value).tz(timezone.timezone).format('YYYY-MM-DD HH:mm:ss')
    : '-';
}

function formatLockExpiration(value: unknown) {
  return typeof value === 'number' && value > 0 ? formatDate(value) : '-';
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

function buildListParams(pageNumber = pagination.current): PageParams {
  const params: PageParams = {
    p: pageNumber,
    s: pagination.pageSize,
  };
  for (const [key, value] of Object.entries(filters).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (key === 'groups_exact') {
      if (selectedExactGroups.value.length)
        params.groups_exact = JSON.stringify(selectedExactGroups.value);
    } else if (key === 'groups_all') {
      if (selectedRoleGroups.value.length)
        params.groups_all = JSON.stringify(selectedRoleGroups.value);
    } else if (Array.isArray(value)) {
      const joined = value
        .filter((item) => ['boolean', 'number', 'string'].includes(typeof item))
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(',');
      if (joined) params[key] = joined;
    } else if ((value !== '' || key === 'group_exact') && value !== undefined)
      params[key] = value as boolean | number | string;
  }
  return params;
}
function listQueryKey(params: PageParams) {
  return JSON.stringify([props.resource, params]);
}

async function loadData() {
  const request = ++listRequest;
  selectedRowKeys.value = [];
  if (!canRead.value || !active) {
    records.value = [];
    pagination.total = 0;
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = false;
  try {
    const params = buildListParams();
    const key = listQueryKey(params);
    pendingListQuery = key;
    const result = await config.value.api.list(params);
    if (request !== listRequest || !active) return;
    lastLoadedQuery = key;
    records.value = result.items;
    pagination.total = result.t;
    selectedRowKeys.value = [];
    if (selectedRecord.value && detailGroupID === undefined) {
      const updated = result.items.find(
        (record) => record.id === selectedRecord.value?.id,
      );
      if (updated) selectedRecord.value = updated;
      else detailsOpen.value = false;
    }
  } catch {
    if (request === listRequest && active) {
      lastLoadedQuery = '';
      records.value = [];
      pagination.total = 0;
      selectedRowKeys.value = [];
      detailsOpen.value = false;
      selectedRecord.value = null;
      loadError.value = true;
    }
  } finally {
    if (request === listRequest) {
      loading.value = false;
      pendingListQuery = '';
    }
  }
}

function handleTableChange(value: TablePaginationConfig) {
  pagination.current = value.current ?? 1;
  pagination.pageSize = value.pageSize ?? pagination.pageSize;
  loadData();
}

function tableRowClassName(_record: SystemRecord, index: number) {
  return tableSettings.striped && index % 2 === 1
    ? 'system-table-row-striped'
    : '';
}

function toggleAllColumns() {
  const keys = new Set(visibleColumnKeys.value);
  const selected = allColumnsSelected.value;
  for (const option of columnOptions.value) {
    if (selected) keys.delete(option.value);
    else keys.add(option.value);
  }
  visibleColumnKeys.value = [...keys];
  if (!showSelectionColumn.value) selectedRowKeys.value = [];
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
        f: suggestionFieldKey,
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
    } finally {
      if (backendSuggestionRequestIds.get(requestKey) === requestId) filterSuggestionsLoading[requestKey] = false;
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
  filterSuggestionsLoading[key] = !!query;
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
  filterSuggestionsLoading[key] = false;
}

function clearBackendFilterSuggestions() {
  for (const key of new Set([...Object.keys(backendFilterSuggestions), ...Object.keys(filterSuggestionsLoading)])) {
    backendSuggestionRequestIds.set(
      key,
      (backendSuggestionRequestIds.get(key) || 0) + 1,
    );
    backendFilterSuggestions[key] = [];
    filterSuggestionQueries[key] = '';
  filterSuggestionsLoading[key] = false;
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
  selectedDay.value = '';
  selectedDayKind.value = 'created';
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
  selectedDay.value = '';
  selectedDayKind.value = 'created';
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
  await refreshAll();
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
      const result = await listRoles({ f: 'id,name,word', p: 1, q: query || undefined, s: 20 });
      if (requestId !== roleOptionsRequestId) return;

      const selectedRoleId = Number(formModel.role_id);
      const options = new Map(
        roleOptions.value
          .filter((option) => option.value === selectedRoleId)
          .map((option) => [option.value, option]),
      );
      for (const item of result.items) {
        options.set(item.id, {
          label: `${item.name} · ${item.word}`,
          value: item.id,
        });
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

async function openEditor(record?: Recordable<any>) {
  ++editorRequest;
  editorError.value = '';
  selectedRecord.value = (record as SystemRecord | undefined) ?? null;
  detailsOpen.value = Boolean(record);
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
  for (const field of editorFields.value) {
    if (field.defaultValue !== undefined) {
      formModel[field.key] = field.defaultValue;
    }
  }
  if (record) {
    Object.assign(formModel, record);
    if (props.resource === 'user-group') {
      formModel.user_ids = { added: [], removed: [] };
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
  editorSnapshot.value = JSON.stringify(snapshotPayload(formModel, editorFields.value.map((field) => field.key)));
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
  } else if (props.resource === 'user-group' && editingRecord.value) {
    return buildUserGroupChanges(initialEditorValues.value, payload);
  } else if (editingRecord.value) {
    return buildChangedPayload(initialEditorValues.value, payload);
  }
  return payload;
}

async function submitEditor() {
  if (submitting.value || !modalOpen.value) return;
  const currentEditor = editorRequest;
  try {
    await formRef.value?.validate();
  } catch {
    // Field errors are rendered by the form; keep the editor open.
    return;
  }
  if (submitting.value || !modalOpen.value || !active || currentEditor !== editorRequest) return;
  const payload = buildPayload();
  if (editingRecord.value && Object.keys(payload).length === 0) {
    message.info($t('system.messages.noChanges'));
    closeEditorPanel(true);
    return;
  }
  submitting.value = true;
  editorError.value = '';
  try {
    let saved: SystemRecord;
    if (editingRecord.value) {
      saved = await config.value.api.update(editingRecord.value.id, payload);
      message.success($t('system.messages.updated'));
    } else {
      idempotencyKey.value ||= newIdempotencyKey();
      saved = await config.value.api.create(idempotencyKey.value, payload);
      message.success($t('system.messages.created'));
    }
    if (!active || currentEditor !== editorRequest) return;
    // A saved record may no longer match the list filters. Keep its details open.
    selectedRecord.value = null;
    await refreshAll();
    if (!active || currentEditor !== editorRequest) return;
    detailGroupID = undefined;
    selectedRecord.value = records.value.find((record) => record.id === saved.id) ?? saved;
    modalOpen.value = false;
    detailsOpen.value = canRead.value;
    formModel.password = '';
  } catch (error) {
    if (!active || currentEditor !== editorRequest) return;
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
    editorError.value = error instanceof Error ? error.message : $t('system-editor.saveError');
  } finally {
    submitting.value = false;
  }
}

function openApproval(record: Recordable<any>) {
  approvalUser.value = record as UserRecord;
  approvalDecision.value = 'approve';
  rejectReason.value = '';
  approvalWarningVisible.value = false;
  approvalModalOpen.value = true;
}

function clearApprovalWarning() {
  approvalWarningVisible.value = false;
}

async function submitApproval() {
  const user = approvalUser.value;
  if (!user) return;
  const reason = rejectReason.value.trim();
  if (approvalDecision.value === 'reject' && !reason) {
    approvalWarningVisible.value = true;
    return;
  }
  approvalWarningVisible.value = false;
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
    await refreshAll();
  } finally {
    approvalSubmitting.value = false;
  }
}

function openLock(record: Recordable<any>) {
  lockUser.value = record as UserRecord;
  lockMode.value = 'until';
  lockUntil.value = dayjs().add(1, 'day').startOf('minute');
  lockWarningVisible.value = false;
  lockModalOpen.value = true;
}

function clearLockWarning() {
  lockWarningVisible.value = false;
}

async function submitLock() {
  const user = lockUser.value;
  if (!user || lockSubmitting.value) return;
  if (
    lockMode.value === 'until' &&
    (!lockUntil.value || !lockUntil.value.isAfter(dayjs()))
  ) {
    lockWarningVisible.value = true;
    return;
  }
  lockWarningVisible.value = false;
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
    await refreshAll();
  } finally {
    lockSubmitting.value = false;
  }
}

async function unlockUser(record: Recordable<any>) {
  const metadata = { ...(record.metadata || {}) };
  delete metadata.lock_expired_at;
  await updateUser(Number(record.id), { metadata, status: 1 });
  message.success($t('system.messages.unlocked'));
  await refreshAll();
}

async function unlockPasswordChange(record: Recordable<any>) {
  const metadata = { ...(record.metadata || {}) };
  delete metadata.password_change_failures;
  await updateUser(Number(record.id), { metadata });
  message.success($t('system.messages.passwordUnlocked'));
  await refreshAll();
}

async function removeRecords(ids: number[]) {
  await config.value.api.delete(ids);
  message.success($t('system.messages.deleted'));
  if (records.value.length === ids.length && pagination.current > 1) {
    pagination.current -= 1;
  }
  await refreshAll();
}

function removeSelected() {
  const ids = [...selectedRowKeys.value];
  if (ids.length === 0 || loading.value || !canDelete.value) return;
  Modal.confirm({
    content: $t('system.confirm.deleteDescription', { count: ids.length }),
    onOk: () => removeRecords(ids),
    title: $t('system.confirm.deleteSelected'),
  });
}

watch(defaultPageSize, (value) => {
  pagination.pageSize = value;
  pagination.current = 1;
  void loadData();
});
onMounted(loadInitialData);
onDeactivated(() => {
  active = false;
  ++editorRequest;
  modalOpen.value = false;
  ++listRequest;
  ++summaryRequest;
  cancelFilterSearch();
  detailsOpen.value = false;
  selectedRecord.value = null;
});
onActivated(() => {
  if (!active) {
    active = true;
    void refreshAll();
  }
});
onBeforeUnmount(() => {
  active = false;
  ++editorRequest;
  ++listRequest;
  ++summaryRequest;
  cancelFilterSearch();
});
</script>

<template>
  <Page>
    <div
      ref="tableContainerRef"
      class="system-management-page flex flex-col gap-4"
      :class="{ 'bg-background p-4': isFullscreen }"
    >
      <header class="system-page-heading">
        <div>
          <h1>{{ config.title }}</h1>
        </div>
      </header>
      <SystemOverview
        v-if="canRead && props.resource !== 'dictionary' && props.resource !== 'whitelist'"
        :resource="props.resource"
        :summary="summary"
        :loading="summaryLoading"
        :error="summaryError"
        :days="summaryDays"
        :selected-status="selectedStatus"
        :selected-enabled="filters.enabled"
        :selected-category="filters.category"
        :selected-groups="selectedRoleGroups"
        :selected-has-permissions="filters.has_permissions"
        :selected-has-members="filters.has_members"
        :selected-day="selectedDayKind === 'created' ? selectedDay : undefined"
        :selected-login-day="
          selectedDayKind === 'login' ? selectedDay : undefined
        "
        @retry="loadOverview"
        @days="summaryDays = $event"
        @filter="quickFilter"
        @day="selectDay"
        @login-day="(day) => selectDay(day, 'login')"
        @group="selectUserGroup"
        @permission-group="toggleRolePermissionGroup"
      />
      <Result
        v-if="!canRead"
        status="403"
        :title="$t('system-insights.noAccess')"
        :sub-title="$t('system-insights.noAccessHint')"
      >
        <template #extra>
          <Button v-if="canCreate" type="primary" @click="openEditor()">
            <IconifyIcon icon="lucide:plus" />{{ $t('system.common.create') }}
          </Button>
        </template>
      </Result>
      <ManagementCard v-if="canRead" class="system-section-card shrink-0">
        <div
          v-if="
            selectedDay ||
            selectedPermissionGroups.length ||
            selectedRolePermissionLabel || filters.has_members === false
          "
          class="system-active-scope"
          data-testid="management-active-filters"
        >
          <Tag
            color="blue"
            v-if="selectedRolePermissionLabel"
            closable
            data-testid="management-role-permission-filter"
            :aria-label="$t('system-insights.clearPermissionFilter')"
            @close.prevent="
              quickFilter({ key: 'has_permissions', value: undefined })
            "
          >
            <template #closeIcon>
              <button
                type="button"
                class="system-scope-clear"
                :aria-label="$t('system-insights.clearPermissionFilter')"
              >
                <IconifyIcon icon="lucide:x" aria-hidden="true" />
              </button>
            </template>
            {{
              $t('system-insights.permissionFilter', {
                status: selectedRolePermissionLabel,
              })
            }}
          </Tag>
          <Tag
            color="blue"
            v-if="filters.has_members === false"
            closable
            data-testid="management-members-filter"
            @close.prevent="quickFilter({ key: 'has_members', value: undefined })"
          >
            {{ $t('system-insights.withoutMembers') }}
          </Tag>
          <Tag
            color="blue"
            v-if="selectedDay"
            class="system-day-filter"
            data-testid="management-day-filter"
          >
            {{
              $t(
                selectedDayKind === 'login'
                  ? 'system-insights.loginDayFilter'
                  : 'system-insights.dayFilter',
                { date: selectedDay },
              )
            }}
            <button
              type="button"
              class="system-scope-clear"
              :aria-label="$t('system-insights.clearDay')"
              @click="clearDay"
            >
              <IconifyIcon icon="lucide:x" aria-hidden="true" />
            </button>
          </Tag>
          <Tag
            color="blue"
            v-for="group in selectedPermissionGroups"
            :key="group"
            closable
            data-testid="management-group-filter"
            :aria-label="clearPermissionGroupLabel(group)"
            @close.prevent="clearPermissionGroup(group)"
          >
            <template #closeIcon>
              <button
                type="button"
                class="system-scope-clear"
                :aria-label="clearPermissionGroupLabel(group)"
              >
                <IconifyIcon icon="lucide:x" aria-hidden="true" />
              </button>
            </template>
            {{
              $t(
                props.resource === 'role'
                  ? 'system-insights.roleGroupFilter'
                  : 'system-insights.groupFilter',
                {
                  name: group || $t('system-insights.ungrouped'),
                },
              )
            }}
          </Tag>
        </div>
        <ManagementSearch data-testid="management-search" :model="filters" @finish="search">
          <FormItem
            v-for="field in visibleFilters"
            :key="field.key"
            class="w-full sm:w-auto sm:shrink-0"
            :label="field.label"
            :name="field.key"
          >
            <Select
              v-if="
                field.type === 'status' || field.type === 'status-multi-select'
              "
              v-model:value="filters[field.key]"
              allow-clear
              :mode="
                field.type === 'status-multi-select' ? 'multiple' : undefined
              "
              :placeholder="$t('system.common.select', { field: field.label })"
              class="system-filter-control"
              :data-testid="`system-filter-${field.key}`"
              style="--filter-width: 280px"
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
              :placeholder="$t('system.common.select', { field: field.label })"
              class="system-filter-control"
              :data-testid="`system-filter-${field.key}`"
              style="--filter-width: 160px"
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
              :placeholder="$t('system.common.select', { field: field.label })"
              class="system-filter-control"
              :data-testid="`system-filter-${field.key}`"
              style="--filter-width: 160px"
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
              class="system-multi-filter system-filter-control"
              :data-testid="`system-filter-${field.key}`"
              style="--filter-width: 280px"
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
            :dropdown-render="({ menuNode } = {}) => renderSkeletonOptions(menuNode, !!filterSuggestionsLoading[filterHistoryKey(field.key)])"
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
:not-found-content="!!filterSuggestionsLoading[filterHistoryKey(field.key)] ? ' ' : null"
              v-else
              :value="filters[field.key]"
              allow-clear
              autocomplete="off"
              class="system-filter-control"
              :data-testid="`system-filter-${field.key}`"
              :default-active-first-option="false"
              :dropdown-match-select-width="true"
              :filter-option="false"
              :options="filterSuggestionOptions(field.key)"
              :placeholder="$t('system.common.enter', { field: field.label })"
              :show-action="['focus']"
              @blur="handleFilterBlur()"
              @focus="handleFilterFocus"
              @search="searchBackendFilterSuggestions(field.key, $event)"
              @update:value="updateTextFilterValue(field.key, $event)"
            :dropdown-render="({ menuNode } = {}) => renderSkeletonOptions(menuNode, !!filterSuggestionsLoading[filterHistoryKey(field.key)])"
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
          <template #actions>
            <Button v-if="canRead" html-type="button" @click="resetSearch">
              {{ $t('system.common.reset') }}
            </Button>
            <Button v-if="canRead" html-type="submit" type="primary" :loading="loading" :aria-busy="loading">
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
          </template>
        </ManagementSearch>
      </ManagementCard>

      <div
        v-if="canRead"
        class="system-results-layout"
        :class="{ 'with-group-nav': props.resource === 'action' }"
      >
        <nav
          v-if="props.resource === 'action'"
          class="system-group-nav"
          v-skeleton="summaryLoading"
          :aria-label="$t('system-insights.businessGroups')"
          data-testid="management-permission-groups"
        >
          <h2>{{ $t('system-insights.businessGroups') }}</h2>
          <button
            type="button"
            :aria-pressed="selectedExactGroups.length === 0"
            @click="selectPermissionGroup()"
          >
            <span>{{ $t('system-insights.allGroups') }}</span><b v-if="summary">{{ summary.total }}</b>
          </button>
          <button
            v-for="group in summary?.groups ?? []"
            :key="group.name"
            type="button"
            :aria-pressed="selectedExactGroups.includes(group.name)"
            :aria-label="
              $t('system-insights.selectGroup', {
                name: group.name || $t('system-insights.ungrouped'),
              })
            "
            @click="selectPermissionGroup(group.name)"
          >
            <span>{{ group.name || $t('system-insights.ungrouped') }}</span><b>{{ group.count }}</b>
          </button>
        </nav>
        <ManagementCard
          class="system-section-card system-results-card"
        >
          <div v-if="props.resource !== 'user'" class="system-result-caption" data-testid="management-result-caption">
            <ManagementViewSwitch
              v-model="viewMode"
              class="system-view-switch"
              test-id="management-view"
              :options="viewOptions"
            />
          </div>
          <div class="mb-4 flex flex-wrap items-center gap-3">
            <Space wrap>
              <Button v-if="canCreate" type="primary" @click="openEditor()">
                <IconifyIcon icon="lucide:plus" />
                {{ $t('system.common.create') }}
              </Button>
              <Button
                v-if="canDelete && selectedRowKeys.length > 0"
                :disabled="loading"
                danger
                @click="removeSelected"
              >
                {{ $t('system.common.deleteSelected') }}
              </Button>
            </Space>

            <div
              v-if="viewMode === 'cards'"
              class="ml-auto flex items-center gap-2"
            >
              <Button
                v-if="canRead"
                size="small"
                class="management-tool-button"
                :aria-label="$t('system.common.refresh')"
                :title="$t('system.common.refresh')"
                :disabled="loading" v-skeleton="loading" :aria-busy="loading"
                @click="refreshAll"
              >
                <IconifyIcon icon="lucide:refresh-cw" />
              </Button>
              <Button
                size="small"
                class="management-tool-button"
                :aria-label="$t('system.table.fullscreen')"
                :title="
                  $t(
                    isFullscreen
                      ? 'system.table.exitFullscreen'
                      : 'system.table.fullscreen',
                  )
                "
                @click="toggleFullscreen()"
              >
                <IconifyIcon
                  :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'"
                />
              </Button>
            </div>
            <ManagementToolbar
              v-else
              v-model:size="tableSize"
              v-model:bordered="tableSettings.bordered"
              v-model:striped="tableSettings.striped"
              v-model:sticky="tableSettings.sticky"
              :can-read="canRead"
              :loading="loading"
              :is-fullscreen="isFullscreen"
              @refresh="refreshAll"
              @fullscreen="toggleFullscreen()"
            >
              <template #columns>
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
            </ManagementToolbar>
          </div>

          <LoadWarning
            v-if="loadError"
            data-testid="management-load-error"
          >
            <template #action>
              <Button size="small" @click="loadData">
                {{ $t('system-insights.retry') }}
              </Button>
            </template>
          </LoadWarning>
          <template v-if="viewMode === 'cards'">
            <div class="system-card-selection">
              <Checkbox
                :checked="records.length > 0 && selectedRowKeys.length === records.length"
                :indeterminate="
                  selectedRowKeys.length > 0 &&
                  selectedRowKeys.length < records.length
                "
                :disabled="loading"
                :aria-label="$t('system-insights.selectAllPage')"
                @change="selectAllCards($event.target.checked)"
              />
              <span v-if="selectedRowKeys.length">{{
                $t('system-insights.selected', {
                  count: selectedRowKeys.length,
                })
              }}</span>
            </div>
            <SystemResourceCards
              :resource="props.resource"
              :records="records"
              :selected-keys="selectedRowKeys"
              :selectable="true"
              :can-update="canUpdate"
              :can-delete="canDelete"
              :loading="loading"
              @detail="openDetail"
              @edit="openEditor"
              @remove="confirmRemove"
              @selection="selectedRowKeys = $event"
            />
            <Pagination
              class="system-card-pagination"
              :current="pagination.current"
              :page-size="pagination.pageSize"
              :total="pagination.total"
              show-size-changer
              :show-total="
                (total: number) => $t('system.table.total', { count: total })
              "
              @change="
                (current, pageSize) => handleTableChange({ current, pageSize })
              "
            />
          </template>
          <Table
            v-else
            ref="managementTableRef"
            data-testid="management-table"
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
            :style="
              !contentTableColumns.some((column) => column.key !== 'operation')
                ? { maxWidth: `${tableScrollWidth}px` }
                : undefined
            "
            @change="handleTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'operation'">
                <Space
                  class="system-operation-actions"
                >
                  <Button
                    v-if="canRead"
                    size="small"
                    type="link"
                    @click="openDetail(record)"
                  >
                    {{ $t('system-insights.details') }}
                  </Button>
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
                    <Button size="small" type="link">
                      {{ $t('system.user.unlock') }}
                    </Button>
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
                    <Button danger size="small" type="link">
                      {{ $t('system.common.delete') }}
                    </Button>
                  </Popconfirm>
                </Space>
              </template>
              <template
                v-else-if="
                  props.resource === 'user' && column.key === 'username'
                "
              >
                <div class="system-user-identity">
                  <Avatar :size="30">
                    {{ record.username?.slice(0, 1).toUpperCase() }}
                  </Avatar>
                  <div>
                    <Button
                      type="link"
                      size="small"
                      @click="openDetail(record)"
                    >
                      {{ record.username }}
</Button><span>{{ record.code }}</span>
                  </div>
                </div>
              </template>
              <template
                v-else-if="
                  props.resource === 'action' &&
                  viewMode === 'matrix' &&
                  column.key === 'name'
                "
              >
                <strong>{{ record.name }}</strong>
                <div class="system-matrix-word">
                  {{ record.word }}
                </div>
              </template>
              <template
                v-else-if="
                  props.resource === 'action' &&
                  viewMode === 'matrix' &&
                  (column.key === 'menu' || column.key === 'button')
                "
              >
                <Tag
                  v-if="String(record[column.key] || '').trim()"
                  color="green"
                >
                  {{ $t('system-insights.configured') }} ({{
                    resourceRules(record[column.key]).length
                  }})
</Tag><span v-else class="text-muted-foreground">{{
                  $t('system-insights.notConfigured')
                }}</span>
              </template>
              <template v-else-if="columnDisplay(column) === 'date'">
                {{
                  column.key === 'last_logged_in_at' &&
                  !columnValue(record, column)
                    ? $t('system-insights.neverLoggedIn')
                    : formatDate(columnValue(record, column))
                }}
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
                <Space v-if="memberPreview(record).length" wrap>
                  <RouterLink
                    v-for="item in memberPreview(record)"
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
                <Button v-if="memberCount(record)" type="link" size="small" @click="openDetail(record)">{{ $t('system-members.viewAll', { count: memberCount(record) }) }}</Button>
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
                <div
                  class="flex min-w-0 flex-col"
                  :class="
                    props.resource === 'user'
                      ? 'w-full gap-1'
                      : 'max-w-72 gap-2'
                  "
                >
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
                      {{ $t('system.user.untilPrefix') }}
                      {{ formatLockExpiration(userLockExpiration(record)) }}
                    </Tag>
                    <Tag v-else class="m-0">
                      {{ $t('system.common.unknown') }}
                    </Tag>
                  </div>
                  <pre
                    class="m-0 overflow-auto whitespace-pre-wrap"
                    :class="
                      props.resource === 'user'
                        ? 'max-h-[60px] leading-5'
                        : 'max-h-40'
                    "
                    tabindex="0"
                    :aria-label="String(column.title)"
                  >{{
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
        </ManagementCard>
      </div>
    </div>

    <ManagementDrawer
      :open="detailsOpen || modalOpen"
      :title="drawerTitle"
      :entity="config.entity"
      :record-id="modalOpen ? editingRecord?.id : selectedRecord?.id"
      :mode="modalOpen ? (editingRecord ? 'edit' : 'create') : 'detail'"
      :busy="submitting"
      :wide="props.resource === 'dictionary' || props.resource === 'action'"
      @close="closeEditorPanel()"
    >
      <SystemRecordDetail
        v-if="!modalOpen"
        :record="selectedRecord"
        :resource="props.resource"
        :loading="detailLoading"
        :error="detailError"
        @retry="loadGroupDetail"
      />
      <ManagementForm v-else ref="formRef" :model="formModel" :rules="formRules" :disabled="submitting" vertical data-testid="management-editor">
        <SystemRecordDetail :record="editingRecord" :resource="props.resource" editing>
        <template v-for="field in editorFields" :key="field.key" #[`field-${field.key}`]>
        <FormItem
          :class="{ 'editor-code': field.type === 'json' || ['resource', 'menu', 'button'].includes(field.key) }"
          :label="
            editingRecord && field.editLabel ? field.editLabel : field.label
          "
          :name="field.key"
          :html-for="`editor-${props.resource}-${field.key}`"
        >
          <AutoComplete
            v-if="field.type === 'action-group'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            allow-clear
            autocomplete="off"
            :filter-option="false"
            :not-found-content="actionGroupOptionsLoading ? ' ' : null"
            :options="actionGroupOptions"
            :placeholder="$t('system.suggestions.actionGroup')"
            :show-action="['focus']"
            @dropdown-visible-change="handleActionGroupDropdownVisibleChange"
            @search="searchActionGroupOptions"
          :dropdown-render="({ menuNode } = {}) => renderSkeletonOptions(menuNode, actionGroupOptionsLoading)"
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
          <RuleListEditor
            v-else-if="['resource', 'menu', 'button'].includes(field.key)"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            :label="field.label"
            :disabled="submitting"
            :placeholder="field.placeholder || $t('system.common.enter', { field: field.label })"
          />
          <Textarea
            v-else-if="field.type === 'textarea' || field.type === 'json'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            :auto-size="
              field.type === 'json'
                ? { minRows: 8, maxRows: 12 }
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
            :id="`editor-${props.resource}-${field.key}`"
            :placeholder="
              (editingRecord && field.editPlaceholder) ||
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
          <Select
            v-else-if="field.type === 'category'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            :options="[
              { label: $t('system.category.permission'), value: 0 },
              { label: $t('system.category.jwt'), value: 1 },
            ]"
          />
          <div v-else-if="field.type === 'enabled'" class="editor-switch">
            <Switch v-model:checked="formModel[field.key]" :aria-label="field.label" />
            <span>{{ $t(formModel[field.key] ? 'system.enabled.yes' : 'system.enabled.no') }}</span>
          </div>
          <Select
            v-else-if="field.type === 'status'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            :options="[
              { label: $t('system.status.pending'), value: 0 },
              { label: $t('system.status.active'), value: 1 },
              { label: $t('system.status.locked'), value: 2 },
            ]"
          />
          <AssociationEditor
            v-else-if="field.type === 'action-select'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            kind="action"
            :disabled="submitting"
            :records="editingRecord && 'actions' in editingRecord ? editingRecord.actions ?? [] : []"
          />
          <Select
            v-else-if="field.type === 'role-select'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            allow-clear
            :filter-option="false"
            :loading="false"
            :options="roleOptions"
            :placeholder="$t('system.suggestions.role')"
            show-search
            @dropdown-visible-change="handleRoleDropdownVisibleChange"
            @search="searchRoleOptions"
          :dropdown-render="({ menuNode } = {}) => renderSkeletonOptions(menuNode, roleOptionsLoading)"
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
          <GroupMembers
            v-else-if="field.type === 'user-select' && editingRecord"
            :key="editingRecord.id"
            v-model:value="formModel[field.key]"
            :group-id="editingRecord.id"
            :count="memberCount(editingRecord)"
            editable
            :disabled="submitting"
          />
          <AssociationEditor
            v-else-if="field.type === 'user-select'"
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            kind="user"
            :disabled="submitting"
            :records="editingRecord && 'users' in editingRecord ? editingRecord.users : []"
          />
          <Input
            v-else
            v-model:value="formModel[field.key]"
            :id="`editor-${props.resource}-${field.key}`"
            :placeholder="
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
        </FormItem>
        </template>
        </SystemRecordDetail>
        <Alert v-if="editorError" class="mt-5" type="error" show-icon :message="editorError" />
      </ManagementForm>
      <template #footer>
        <template v-if="modalOpen">
          <Button :disabled="submitting" @click="closeEditorPanel(Boolean(editingRecord))">
            {{ $t(editingRecord ? 'system-editor.cancelEdit' : 'system-editor.cancel') }}
          </Button>
          <span v-if="editorDirty" class="editor-dirty">{{ $t('system-editor.unsaved') }}</span>
          <Button type="primary" :loading="submitting" :aria-busy="submitting" data-testid="management-save" @click="submitEditor">
            <IconifyIcon :icon="editingRecord ? 'lucide:check' : 'lucide:plus'" />
            {{ editingRecord ? $t('system-editor.save') : $t('system.common.createTitle', { entity: config.entity }) }}
          </Button>
        </template>
        <template v-else>
          <Button @click="closeEditorPanel()">{{ $t('system-cards.backToList') }}</Button>
          <Button v-if="canUpdate && selectedRecord" type="primary" :disabled="detailLoading || detailError" @click="editDetail(selectedRecord)">
            <IconifyIcon icon="lucide:pencil" />{{ $t('system.common.edit') }}
          </Button>
        </template>
      </template>
    </ManagementDrawer>

    <Modal
      v-model:open="lockModalOpen"
      :confirm-loading="lockSubmitting"
      :title="$t('system.user.lockTitle', { name: lockUser?.username || '' })"
      @ok="submitLock"
    >
      <ManagementForm :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
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
          :help="
            lockWarningVisible ? $t('system.validation.futureLock') : undefined
          "
          :label="$t('system.user.lockedUntil')"
          required
          :validate-status="lockWarningVisible ? 'warning' : undefined"
        >
          <DatePicker
            v-model:value="lockUntil"
            class="w-full"
            :disabled-date="disablePastDate"
            format="YYYY-MM-DD HH:mm:ss"
            show-time
            @change="clearLockWarning"
          />
        </FormItem>
      </ManagementForm>
    </Modal>

    <Modal
      v-model:open="approvalModalOpen"
      :confirm-loading="approvalSubmitting"
      :title="$t('system.user.review')"
      @ok="submitApproval"
    >
      <ManagementForm :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
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
            @change="clearApprovalWarning"
          />
        </FormItem>
        <FormItem
          v-if="approvalDecision === 'reject'"
          :help="
            approvalWarningVisible
              ? $t('system.validation.rejectionRequired')
              : undefined
          "
          :label="$t('system.user.reason')"
          required
          :validate-status="approvalWarningVisible ? 'warning' : undefined"
        >
          <Textarea
            v-model:value="rejectReason"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            :placeholder="$t('system.user.rejectionPlaceholder')"
            @input="clearApprovalWarning"
          />
        </FormItem>
      </ManagementForm>
    </Modal>
  </Page>
</template>

<style scoped>
.system-management-page:fullscreen {
  overflow: auto;
}
.system-operation-actions {
  width: max-content;
  white-space: nowrap;
}
.system-management-page {
  min-width: 0;
  padding: 3px 0 8px;
}
.system-page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 2px;
}
.system-page-heading h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.35;
  font-weight: 650;
}
.system-results-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.system-results-layout.with-group-nav {
  grid-template-columns: 190px minmax(0, 1fr);
}
.system-results-card {
  min-width: 0;
}
.system-results-card :deep(.ant-card-body) {
  padding: 18px;
}
.system-result-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 15px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.system-view-switch {
  margin-left: auto;
}
.system-group-nav {
  max-height: calc(clamp(360px, 52vh, 620px) + 150px);
  overflow: auto;
  scrollbar-gutter: stable;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 12px;
  min-width: 0;
}
.system-group-nav h2 {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  margin: 7px 9px 12px;
}
.system-group-nav button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 11px 9px;
  border: 0;
  border-radius: calc(var(--radius) * 0.75);
  cursor: pointer;
  background: transparent;
  font-size: 12px;
  text-align: left;
  line-height: 1.6;
}
.system-group-nav button span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.system-group-nav button b {
  font-size: 11px;
  font-weight: 500;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) * 0.5);
  padding: 0 5px;
}
.system-group-nav button:hover,
.system-group-nav button[aria-pressed='true'] {
  background: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
}
.system-group-nav button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
.system-card-selection {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin: 4px 0 14px;
}
.system-card-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  flex-wrap: wrap;
  row-gap: 8px;
}
.system-day-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.system-scope-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: calc(var(--radius) * 0.375);
  background: none;
  color: inherit;
  cursor: pointer;
}
.system-scope-clear :deep(svg) {
  display: block;
  width: 12px;
  height: 12px;
}
.system-scope-clear:hover {
  background: hsl(var(--muted));
}
.system-scope-clear:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}
.system-active-scope {
  margin-bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.system-active-scope :deep(.ant-tag) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 6px;
  max-width: 100%;
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.system-active-scope :deep(.ant-tag-close-icon) {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-inline-start: 0;
  line-height: 1;
}
.system-user-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.system-user-identity :deep(.ant-avatar) {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  flex-shrink: 0;
}
.system-user-identity > div {
  min-width: 0;
}
.system-user-identity :deep(.ant-btn) {
  max-width: 100%;
  padding: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  height: auto;
  text-align: left;
  color: hsl(var(--foreground));
  font-weight: 500;
}
.system-user-identity > div > span {
  font-size: 11px;
}
.system-user-identity > div > span {
  display: block;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}
.system-matrix-word {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.8;
}
@media (max-width: 1000px) {
  .system-results-layout.with-group-nav {
    grid-template-columns: 160px minmax(0, 1fr);
  }
  .system-group-nav {
    padding: 8px;
  }
}
@media (max-width: 700px) {
  .system-results-layout.with-group-nav {
    grid-template-columns: 1fr;
  }
  .system-group-nav {
    display: flex;
    align-items: center;
    overflow: auto;
    gap: 6px;
  }
  .system-group-nav h2 {
    display: none;
  }
  .system-group-nav button {
    width: auto;
    white-space: nowrap;
  }
  .system-page-heading h1 {
    font-size: 22px;
  }
  .system-card-pagination {
    justify-content: flex-start;
  }
}

:deep(.system-table-row-striped > td) {
  background-color: rgb(127 127 127 / 6%) !important;
}

:deep(.ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}

:deep(.ant-table-cell) {
  overflow-wrap: anywhere;
  white-space: normal;
}

:deep(.system-table-row-striped > .ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}

:deep(.system-resource-rule-tag) {
  overflow-wrap: anywhere;
  white-space: normal;
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
