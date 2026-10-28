<script setup lang="ts">
  import ResultToolbar from './ResultToolbar.vue'
  import ActiveFilters from './ActiveFilters.vue'
  import ManagementOverview from './ManagementOverview.vue'
  import ResourceCards from './ResourceCards.vue'
  import RecordDetail from './RecordDetail.vue'
  import AssociationEditor from './AssociationEditor.vue'
  import GroupMembers from './GroupMembers.vue'
  import ActionGroupNav from './action-group-nav.vue'
  import ActionGroupDialog from './action-group-dialog.vue'
  import { applyGroupOrder, deletePermissionGroup } from './action-groups'
  import { managementListFields } from './management-projection'
  import {
    hasManagementControl,
    canManageResourceRecord,
    canRemoveManagementRecord
  } from './management-access'
  import { catalogGroupWords, catalogGroupOrder } from '@/locales/catalog'
  import { refreshI18nCatalog } from '@/locales'
  import { getAdminSummary } from '@/utils/admin/service'
  import ActionEditor from './action-editor.vue'
  import PermissionAssignment from './permission-assignment.vue'
  import PermissionResultCell from './permission-result-cell.vue'
  import { usePermissions } from '@/composables/use-permissions'
  import { authorizedEditorPayload } from './assignment-policy'
  import { catalogLabel } from '@/locales'
  import RuleListEditor from './RuleListEditor.vue'
  import { getAdminRecord, associationOptions } from '@/utils/admin/service'
  import { adminDate, changedFields, type AdminQuery, type AdminRecord } from '@/utils/admin/model'
  import { useDefaultPageSize, useAdminTimezone } from '@/utils/admin/preferences'
  import type { FormInstance } from 'element-plus'
  import { ElMessageBox } from 'element-plus'
  import type { ResourceKind, SystemRecord, UserRecord } from '@/api/system-service'

  import {
    deleteResources,
    listResource,
    createResource,
    updateResource
  } from '@/api/system-service'
  import { $t } from '@/locales'
  import { isValidUsername, isValidUserPassword } from '@/utils/auth-validation'

  type FieldType =
    | 'input'
    | 'textarea'
    | 'password'
    | 'json'
    | 'switch'
    | 'category'
    | 'role'
    | 'actions'
    | 'users'
  interface Field {
    key: string
    label: string
    type: FieldType
    required?: boolean
    createOnly?: boolean
  }
  interface Column {
    key: string
    label: string
    width?: number
    minWidth?: number
    format?:
      | 'date'
      | 'status'
      | 'category'
      | 'json'
      | 'tags'
      | 'actions'
      | 'role'
      | 'users'
      | 'rules'
      | 'boolean'
  }
  interface Filter {
    key: string
    label: string
    type?: 'status' | 'category' | 'enabled'
    suggestion?: { resource: ResourceKind; fieldKey: string }
  }
  interface FilterSuggestion {
    groupStart?: boolean
    value: string
    source: 'backend' | 'history'
  }
  interface SuggestionSegment {
    matched: boolean
    text: string
  }
  interface Config {
    title: string
    fields: Field[]
    columns: Column[]
    filters: Filter[]
  }

  const props = defineProps<{ resource: ResourceKind }>()
  const permissions = usePermissions()
  const editorProblem = ref('')
  const canAssign = computed(() =>
    permissions.canManagePermission(props.resource, dialog.record ? 'update' : 'create')
  )
  const editorFields = computed(() =>
    config.value.fields.filter(
      (field) =>
        (canAssign.value || !['actions', 'role', 'users'].includes(field.type)) &&
        (!dialog.record ||
          props.resource !== 'user' ||
          canAssign.value ||
          !['username', 'password'].includes(field.key))
    )
  )
  const editorGroups = ref<string[]>([])
  const groupDialogOpen = ref(false)
  const permissionGroupCounts = ref<Array<{ name: string; count: number }>>([])
  const groupsLoading = ref(false)
  const permissionGroups = computed(() => {
    const used = new Set(permissionGroupCounts.value.map((group) => group.name))
    return applyGroupOrder(
      [
        ...permissionGroupCounts.value,
        ...catalogGroupWords()
          .filter((name) => !used.has(name))
          .map((name) => ({ name, count: 0 }))
      ],
      catalogGroupOrder()
    )
  })
  const access = {
    hasButton: permissions.hasButton,
    canManagePermission: permissions.canManagePermission,
    get hasAllPermissions() {
      return permissions.hasAllPermissions.value
    },
    get canPublishCatalog() {
      return permissions.canManageDeveloper.value
    }
  }
  const canControl = (control: string) => hasManagementControl(props.resource, control, access)
  const canDetail = computed(() => canControl('view-detail'))
  const canRemoveRecord = (record: AdminRecord, control: 'delete' | 'delete-selected' = 'delete') =>
    canRemoveManagementRecord(props.resource, record, control, access)
  const canSelectRecord = (record: AdminRecord) => canRemoveRecord(record, 'delete-selected')

  async function refreshPermissionGroups() {
    if (props.resource !== 'action' || !allowed('read')) return
    groupsLoading.value = true
    try {
      await refreshI18nCatalog()
      permissionGroupCounts.value = (await getAdminSummary('action')).groups.map((group) => ({
        name: group.name,
        count: group.count
      }))
    } finally {
      groupsLoading.value = false
    }
  }
  function createPermissionGroup() {
    if (canControl('create-group') && permissions.canManagePermission('action', 'update'))
      groupDialogOpen.value = true
  }
  function selectPermissionGroup(word?: string) {
    if (!canControl('query')) return
    if (word === undefined) delete filters.groups_exact
    else filters.groups_exact = word
    search()
  }
  async function removePermissionGroup(word: string) {
    if (
      !permissions.canManagePermission('action', 'update') ||
      !canControl('delete-group') ||
      permissionGroups.value.find((group) => group.name === word)?.count !== 0
    )
      return
    try {
      await ElMessageBox.confirm(
        $t('action-editor.deleteGroupConfirm', { name: catalogLabel('groups', word) }),
        $t('action-editor.deleteGroup'),
        {
          confirmButtonText: $t('system.common.delete'),
          cancelButtonText: $t('system.common.cancel'),
          type: 'warning'
        }
      )
    } catch {
      return
    }
    if (!canControl('delete-group') || !permissions.canManagePermission('action', 'update')) return
    await deletePermissionGroup(word)
    if (filters.groups_exact === word) delete filters.groups_exact
    await refreshPermissionGroups()
    await load()
  }
  function manageable(record?: any) {
    return !record || canManageResourceRecord(props.resource, record, access)
  }

  const timezone = useAdminTimezone()
  const view = ref<'cards' | 'matrix' | 'table'>(
    props.resource === 'user' ? 'table' : props.resource === 'action' ? 'matrix' : 'cards'
  )
  const summaryRevision = ref(0)
  const detailRecord = ref<AdminRecord>()
  const memberAdded = ref<number[]>([]),
    memberRemoved = ref<number[]>([])
  let initialForm: Record<string, unknown> = {}
  const loadError = ref(false)
  let listRun = 0
  const loading = ref(false)
  const saving = ref(false)
  const rows = ref<SystemRecord[]>([])
  const selected = ref<SystemRecord[]>([])
  const defaultPageSize = useDefaultPageSize()
  const page = reactive({ current: 1, size: defaultPageSize.value, total: 0 })
  watch(defaultPageSize, (value) => {
    page.size = value
    page.current = 1
    void load()
  })
  const filters = reactive<Record<string, unknown>>({})
  const dialog = reactive({ open: false, record: null as SystemRecord | null })
  const form = reactive<Record<string, any>>({})
  const formRef = ref<FormInstance>()
  const relation = reactive({ actions: [] as any[], roles: [] as any[], users: [] as any[] })
  const visibleColumns = ref<string[]>([])
  const tableSize = ref<'small' | 'default' | 'large'>('default')
  const tableBordered = ref(true)
  const tableStriped = ref(true)
  const fullscreen = ref(false)
  const searchExpanded = ref(false)
  const tableWrap = ref<HTMLElement>()
  const filterHistoryStorageKey = 'art-system-filter-history'
  const filterHistory = reactive<Record<string, string[]>>(loadFilterHistory())
  const filterSuggestionQueries = reactive<Record<string, string>>({})
  const suggestionTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const suggestionRequestIds = new Map<string, number>()
  let autoSearchTimer: ReturnType<typeof setTimeout> | undefined
  let filtersDirty = false

  const commonDates: Column[] = [
    { key: 'created_at', label: 'system.fields.createdAt', width: 175, format: 'date' },
    { key: 'updated_at', label: 'system.fields.updatedAt', width: 175, format: 'date' }
  ]
  const configs: Record<ResourceKind, Config> = {
    action: {
      title: 'system.action.title',
      fields: [],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'name', label: 'system.fields.name', width: 150 },
        { key: 'group', label: 'system.fields.group', width: 140 },
        { key: 'word', label: 'system.fields.word', width: 150 },
        { key: 'code', label: 'system.fields.code', width: 150 },
        { key: 'resource', label: 'system.fields.resourceRules', width: 260, format: 'rules' },
        { key: 'menu', label: 'system.fields.menuPaths', width: 200, format: 'tags' },
        { key: 'button', label: 'system.fields.buttonPermission', width: 200, format: 'tags' },
        ...commonDates
      ],
      filters: [
        { key: 'name', label: 'system.fields.name' },
        { key: 'group', label: 'system.fields.group' },
        { key: 'word', label: 'system.fields.word' },
        { key: 'code', label: 'system.fields.code' },
        { key: 'resource', label: 'system.fields.resource' },
        { key: 'menu', label: 'system.fields.menuPath' },
        { key: 'button', label: 'system.fields.buttonPermission' }
      ]
    },
    role: {
      title: 'system.role.title',
      fields: [
        { key: 'name', label: 'system.fields.name', type: 'input', required: true },
        { key: 'word', label: 'system.fields.word', type: 'input', required: true },
        { key: 'action_codes', label: 'system.fields.permissions', type: 'actions' }
      ],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'name', label: 'system.fields.name', width: 180 },
        { key: 'word', label: 'system.fields.word', width: 180 },
        {
          key: 'action_codes',
          label: 'system.fields.permissions',
          minWidth: 320,
          format: 'actions'
        } as Column,
        ...commonDates
      ],
      filters: [
        { key: 'name', label: 'system.fields.name' },
        { key: 'word', label: 'system.fields.word' },
        {
          key: 'action_code',
          label: 'system.fields.actionCode',
          suggestion: { resource: 'action', fieldKey: 'code' }
        }
      ]
    },
    user: {
      title: 'system.user.title',
      fields: [
        { key: 'username', label: 'system.fields.username', type: 'input', required: true },
        { key: 'password', label: 'system.fields.password', type: 'password' },
        { key: 'role_id', label: 'system.fields.role', type: 'role' },
        { key: 'action_codes', label: 'system.fields.permissions', type: 'actions' }
      ],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'username', label: 'system.fields.username', width: 180 },
        { key: 'code', label: 'system.fields.userCode', width: 140 },
        { key: 'role', label: 'system.fields.role', width: 140, format: 'role' },
        { key: 'status', label: 'system.fields.status', width: 110, format: 'status' },
        { key: 'login_count', label: 'system.fields.loginCount', width: 110 },
        { key: 'last_logged_in_at', label: 'system.fields.lastLogin', width: 180, format: 'date' },
        { key: 'action_codes', label: 'system.fields.permissions', width: 320, format: 'actions' },
        ...commonDates,
        { key: 'metadata', label: 'system.fields.metadata', width: 300, format: 'json' }
      ],
      filters: [
        { key: 'username', label: 'system.fields.username' },
        { key: 'code', label: 'system.fields.userCode' },
        { key: 'status', label: 'system.fields.status', type: 'status' }
      ]
    },
    'user-group': {
      title: 'system.userGroup.title',
      fields: [
        { key: 'name', label: 'system.fields.name', type: 'input', required: true },
        { key: 'word', label: 'system.fields.word', type: 'input', required: true },
        { key: 'user_ids', label: 'system.fields.members', type: 'users' },
        { key: 'action_codes', label: 'system.fields.permissions', type: 'actions' }
      ],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'name', label: 'system.fields.name', width: 180 },
        { key: 'word', label: 'system.fields.word', width: 180 },
        { key: 'users', label: 'system.fields.members', width: 300, format: 'users' },
        { key: 'action_codes', label: 'system.fields.permissions', width: 320, format: 'actions' },
        ...commonDates
      ],
      filters: [
        { key: 'name', label: 'system.fields.name' },
        { key: 'word', label: 'system.fields.word' },
        {
          key: 'action_code',
          label: 'system.fields.actionCode',
          suggestion: { resource: 'action', fieldKey: 'code' }
        }
      ]
    },
    dictionary: {
      title: 'system.dictionary.title',
      fields: [
        { key: 'key', label: 'system.fields.dictionaryKey', type: 'input', required: true },
        { key: 'name', label: 'system.fields.name', type: 'input', required: true },
        { key: 'value', label: 'system.fields.dictionaryValue', type: 'json', required: true },
        { key: 'description', label: 'system.fields.description', type: 'textarea' },
        { key: 'enabled', label: 'system.fields.enabled', type: 'switch' }
      ],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'key', label: 'system.fields.dictionaryKey', width: 260 },
        { key: 'name', label: 'system.fields.name', width: 200 },
        { key: 'value', label: 'system.fields.dictionaryValue', width: 320, format: 'json' },
        { key: 'description', label: 'system.fields.description', width: 240 },
        { key: 'enabled', label: 'system.fields.enabled', width: 100, format: 'boolean' },
        ...commonDates
      ],
      filters: [
        { key: 'key', label: 'system.fields.dictionaryKey' },
        { key: 'name', label: 'system.fields.name' },
        { key: 'enabled', label: 'system.fields.enabled', type: 'enabled' }
      ]
    },
    whitelist: {
      title: 'system.whitelist.title',
      fields: [
        { key: 'category', label: 'system.fields.category', type: 'category', required: true },
        { key: 'resource', label: 'system.fields.resourceRules', type: 'textarea', required: true }
      ],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'category', label: 'system.fields.category', width: 130, format: 'category' },
        {
          key: 'resource',
          label: 'system.fields.resourceRules',
          minWidth: 360,
          format: 'rules'
        } as Column,
        ...commonDates
      ],
      filters: [
        { key: 'category', label: 'system.fields.category', type: 'category' },
        { key: 'resource', label: 'system.fields.resource' }
      ]
    }
  }

  const config = computed(() => configs[props.resource])
  const visibleFilters = computed(() =>
    searchExpanded.value ? config.value.filters : config.value.filters.slice(0, 3)
  )
  const adaptiveFormats = new Set<Column['format']>(['actions', 'json', 'rules', 'tags', 'users'])
  const columns = computed(() =>
    config.value.columns
      .filter((item) => visibleColumns.value.includes(item.key))
      .map((item) => ({
        ...item,
        label:
          props.resource === 'action' && view.value === 'matrix'
            ? ((
                {
                  menu: 'permission-display.relatedMenus',
                  resource: 'action-editor.operation',
                  button: 'action-editor.features'
                } as Record<string, string>
              )[item.key] ?? item.label)
            : item.label,
        width: adaptiveColumnWidth(item),
        minWidth: undefined
      }))
  )
  function allowed(operation: 'create' | 'read' | 'update' | 'delete') {
    if (operation === 'read') return permissions.hasPage(`/system/${props.resource}`)
    return canControl(operation === 'update' ? 'edit' : operation)
  }

  const listFields = computed(() =>
    managementListFields({
      resource: props.resource,
      view: view.value,
      columns: config.value.columns,
      visible: visibleColumns.value,
      canAssignPermissions: permissions.canAssignPermissions.value,
      canDelete: allowed('delete'),
      canDeleteSelected: canControl('delete-selected')
    })
  )
  watch(listFields, () => void load())

  async function load() {
    if (!allowed('read')) return
    const run = ++listRun
    loading.value = true
    loadError.value = false
    try {
      const params: Record<string, unknown> = { p: page.current, s: page.size }
      Object.entries(filters).forEach(([key, value]) => {
        if ((value !== '' || key.endsWith('_exact')) && value !== undefined && value !== null)
          params[key] = Array.isArray(value) ? value.join(',') : value
      })
      const result = await listResource(props.resource, {
        ...params,
        f: listFields.value
      })
      if (run !== listRun) return
      rows.value = result.items.map((record) =>
        props.resource === 'user-group'
          ? { ...record, users: (record as any).member_preview ?? (record as any).users ?? [] }
          : props.resource === 'user'
            ? { ...record, role: (record as any).role_summary ?? (record as any).role }
            : record
      )
      page.total = result.t
      selected.value = []
      if (props.resource === 'action') void refreshPermissionGroups()
    } catch {
      if (run === listRun) {
        loadError.value = true
        rows.value = []
        page.total = 0
      }
    } finally {
      if (run === listRun) loading.value = false
    }
  }
  function applyInsight(updates: AdminQuery) {
    if (!canControl('query')) return
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) delete filters[key]
      else filters[key] = value
    }
    search()
  }
  function openDetail(record: AdminRecord) {
    if (!canDetail.value || loading.value) return
    detailRecord.value = record
  }
  async function openGroupDetail(id: number) {
    if (!canDetail.value) return
    const record = await getAdminRecord('user-group', id)
    openDetail(record)
  }
  function refreshFromToolbar() {
    if (!canControl('refresh') || !allowed('read')) return
    summaryRevision.value++
    void load()
  }
  function selectRows(records: SystemRecord[]) {
    selected.value = canControl('delete-selected')
      ? records.filter((record) => canSelectRecord(record as unknown as AdminRecord))
      : []
  }
  function toggleSelection(id: number) {
    const row = rows.value.find((item) => item.id === id)
    if (!row || !canSelectRecord(row as unknown as AdminRecord)) return
    selectRows(
      selected.value.some((item) => item.id === id)
        ? selected.value.filter((item) => item.id !== id)
        : [...selected.value, row]
    )
  }
  watch(canDetail, (value) => {
    if (!value) detailRecord.value = undefined
  })
  watch(
    () =>
      rows.value
        .filter((record) => canSelectRecord(record as unknown as AdminRecord))
        .map((record) => record.id)
        .join(','),
    () => selectRows(selected.value)
  )

  async function beforeCloseEditor(done: () => void) {
    if (saving.value) return
    const dirty =
      JSON.stringify(form) !== JSON.stringify(initialForm) ||
      memberAdded.value.length ||
      memberRemoved.value.length
    if (dirty) {
      try {
        await ElMessageBox.confirm(
          $t('pc.system-editor.unsaved'),
          $t('pc.system-editor.discardTitle'),
          {
            confirmButtonText: $t('pc.system-editor.discard'),
            cancelButtonText: $t('pc.system-editor.continue'),
            type: 'warning'
          }
        )
      } catch {
        return
      }
    }
    done()
  }

  function loadFilterHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(filterHistoryStorageKey) || '{}')
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
      return Object.fromEntries(
        Object.entries(value).map(([key, items]) => [
          key,
          Array.isArray(items)
            ? items.filter((item): item is string => typeof item === 'string').slice(0, 10)
            : []
        ])
      )
    } catch {
      return {}
    }
  }

  function filterHistoryKey(fieldKey: string) {
    return `${props.resource}:${fieldKey}`
  }

  function saveFilterHistory() {
    for (const field of config.value.filters) {
      if (field.type) continue
      const value = filters[field.key]
      const values = (Array.isArray(value) ? value : [value])
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
      if (!values.length) continue
      const key = filterHistoryKey(field.key)
      filterHistory[key] = [
        ...values,
        ...(filterHistory[key] || []).filter((item) => !values.includes(item))
      ].slice(0, 10)
    }
    localStorage.setItem(filterHistoryStorageKey, JSON.stringify(filterHistory))
  }

  function removeFilterHistory(fieldKey: string, value: string) {
    const key = filterHistoryKey(fieldKey)
    const remaining = (filterHistory[key] || []).filter((item) => item !== value)
    if (remaining.length) filterHistory[key] = remaining
    else delete filterHistory[key]
    localStorage.setItem(filterHistoryStorageKey, JSON.stringify(filterHistory))
  }

  function suggestionSegments(value: string, fieldKey: string): SuggestionSegment[] {
    const query = filterSuggestionQueries[filterHistoryKey(fieldKey)] || ''
    if (!query) return [{ matched: false, text: value }]
    const result: SuggestionSegment[] = []
    const normalizedValue = value.toLowerCase()
    const normalizedQuery = query.toLowerCase()
    let cursor = 0
    let index = normalizedValue.indexOf(normalizedQuery)
    if (index < 0) return [{ matched: false, text: value }]
    while (index >= 0) {
      if (index > cursor) result.push({ matched: false, text: value.slice(cursor, index) })
      const end = index + query.length
      result.push({ matched: true, text: value.slice(index, end) })
      cursor = end
      index = normalizedValue.indexOf(normalizedQuery, cursor)
    }
    if (cursor < value.length) result.push({ matched: false, text: value.slice(cursor) })
    return result
  }

  function search() {
    if (!canControl('query') || !allowed('read')) return
    clearTimeout(autoSearchTimer)
    filtersDirty = false
    saveFilterHistory()
    page.current = 1
    load()
  }
  function resetFilters() {
    clearTimeout(autoSearchTimer)
    filtersDirty = false
    Object.keys(filters).forEach((key) => delete filters[key])
    page.current = 1
    void load()
  }

  function reset() {
    if (canControl('reset-query')) resetFilters()
  }

  function markFilterChanged(autoSchedule = false) {
    filtersDirty = true
    if (autoSchedule) scheduleFilterSearch()
  }

  function handleFilterFocus() {
    clearTimeout(autoSearchTimer)
  }

  function scheduleFilterSearch() {
    if (!canControl('query')) return
    clearTimeout(autoSearchTimer)
    autoSearchTimer = setTimeout(() => {
      if (filtersDirty) search()
    }, 500)
  }

  function fetchFilterSuggestions(
    field: Filter,
    query: string,
    callback: (items: FilterSuggestion[]) => void
  ) {
    if (!canControl('query') || !allowed('read')) {
      callback([])
      return
    }
    const key = filterHistoryKey(field.key)
    const normalizedQuery = query.trim().toLowerCase()
    filterSuggestionQueries[key] = query.trim()
    const history = (filterHistory[key] || []).filter(
      (item) => !normalizedQuery || item.toLowerCase().includes(normalizedQuery)
    )
    clearTimeout(suggestionTimers.get(key))
    const requestId = (suggestionRequestIds.get(key) || 0) + 1
    suggestionRequestIds.set(key, requestId)
    suggestionTimers.set(
      key,
      setTimeout(async () => {
        if (!canControl('query') || !allowed('read')) {
          callback([])
          return
        }
        const suggestion = field.suggestion || { resource: props.resource, fieldKey: field.key }
        try {
          const params: Record<string, unknown> = { p: 1, s: 10, f: suggestion.fieldKey }
          if (query.trim()) params[suggestion.fieldKey] = query.trim()
          const result = await listResource(suggestion.resource, params)
          if (suggestionRequestIds.get(key) !== requestId || !canControl('query')) return
          const backend = result.items
            .map((record) => (record as unknown as Record<string, unknown>)[suggestion.fieldKey])
            .filter((value): value is number | string =>
              ['number', 'string'].includes(typeof value)
            )
            .map(String)
          const uniqueBackend = [...new Set(backend)]
          const uniqueHistory = [...new Set(history)].filter(
            (value) => !uniqueBackend.includes(value)
          )
          callback([
            ...uniqueBackend.map((value, index) => ({
              groupStart: index === 0,
              source: 'backend' as const,
              value
            })),
            ...uniqueHistory.map((value, index) => ({
              groupStart: index === 0,
              source: 'history' as const,
              value
            }))
          ])
        } catch {
          if (suggestionRequestIds.get(key) === requestId)
            callback(
              history.map((value, index) => ({
                groupStart: index === 0,
                value,
                source: 'history'
              }))
            )
        }
      }, 250)
    )
  }

  async function searchRoles(query = '') {
    if (!permissions.hasPage('/system/role')) return
    const result = await associationOptions('role', { q: query, p: 1, s: 20 })
    relation.roles = result.items
  }
  async function openEditor(record?: SystemRecord) {
    if (!allowed(record ? 'update' : 'create')) return
    detailRecord.value = undefined
    memberAdded.value = []
    memberRemoved.value = []
    dialog.record = record || null
    Object.keys(form).forEach((key) => delete form[key])
    if (record) {
      const full = await getAdminRecord(props.resource, record.id)
      if (!manageable(full)) return
      dialog.record = full as unknown as SystemRecord
      record = full as unknown as SystemRecord
      Object.assign(form, structuredClone(toRaw(full)))
    }
    editorProblem.value = ''
    if (props.resource === 'action') {
      form.names = (record as any)?.names ?? {}
      form.word = (record as any)?.word ?? ''
      form.group = (record as any)?.group ?? ''
      form.config = (record as any)?.config ?? { bindings: [], ui: [], endpoints: [] }
      try {
        editorGroups.value = await (await import('@/api/system-service')).actionGroups()
      } catch {
        editorGroups.value = []
      }
    }
    if (props.resource === 'dictionary')
      form.value = JSON.stringify(record ? (record as any).value : [], null, 2)
    if (props.resource === 'dictionary' && !record) form.enabled = true
    if (props.resource === 'whitelist' && !record) form.category = 0
    if (props.resource === 'user') form.password = ''
    if (props.resource === 'user-group' && record) form.user_ids = []
    for (const field of config.value.fields) {
      if (['actions', 'users'].includes(field.type) && !Array.isArray(form[field.key]))
        form[field.key] = []
    }
    relation.roles = (record as any)?.role ? [(record as any).role] : []
    initialForm = structuredClone(toRaw(form))
    if (!allowed(record ? 'update' : 'create') || !manageable(record)) return
    dialog.open = true
    await nextTick()
    formRef.value?.clearValidate()
  }

  async function save() {
    if (saving.value || !allowed(dialog.record ? 'update' : 'create') || !manageable(dialog.record))
      return
    if (editorProblem.value) return
    if (!(await formRef.value?.validate().catch(() => false))) return
    if (!allowed(dialog.record ? 'update' : 'create') || !manageable(dialog.record)) return
    const payload: Record<string, unknown> = {}
    for (const field of editorFields.value) {
      if (form[field.key] !== undefined) payload[field.key] = form[field.key]
    }
    if (canAssign.value && form.action_bindings !== undefined) {
      payload.action_bindings = form.action_bindings
      delete payload.action_codes
    }
    if (props.resource === 'action')
      Object.assign(payload, {
        names: form.names,
        word: form.word.trim(),
        group: form.group,
        config: form.config
      })
    if (props.resource === 'dictionary') {
      try {
        payload.value = JSON.parse(String(payload.value))
      } catch {
        return ElMessage.error($t('system.messages.invalidJson'))
      }
    }
    if (props.resource === 'user' && dialog.record && !payload.password) delete payload.password
    if (props.resource === 'user' && !dialog.record && !String(payload.password ?? '').trim())
      return ElMessage.warning($t('auth.passwordRequired'))
    // JSON string values retain their contents, including significant whitespace.
    const jsonFields = new Set(
      config.value.fields.filter((field) => field.type === 'json').map((field) => field.key)
    )
    for (const [key, value] of Object.entries(payload))
      if (typeof value === 'string' && !jsonFields.has(key)) payload[key] = value.trim()
    if (dialog.record) {
      const original: Record<string, unknown> = {}
      for (const field of config.value.fields) {
        if (initialForm[field.key] !== undefined)
          original[field.key] =
            field.type === 'json'
              ? JSON.parse(String(initialForm[field.key]))
              : initialForm[field.key]
      }
      if (props.resource === 'action')
        for (const key of ['names', 'word', 'group', 'config']) original[key] = initialForm[key]
      const delta = changedFields(payload, original)
      Object.keys(payload).forEach((key) => delete payload[key])
      Object.assign(payload, delta)
      if (props.resource === 'user-group') {
        delete payload.user_ids
        if (memberAdded.value.length) payload.add_user_ids = memberAdded.value
        if (memberRemoved.value.length) payload.remove_user_ids = memberRemoved.value
      }
      if (!Object.keys(payload).length) {
        ElMessage.info($t('system.messages.noChanges'))
        return
      }
    }
    const authorized = authorizedEditorPayload(
      props.resource,
      payload,
      canAssign.value,
      canAssign.value,
      !!dialog.record
    )
    Object.keys(payload).forEach((key) => delete payload[key])
    Object.assign(payload, authorized)
    saving.value = true
    try {
      if (dialog.record) await updateResource(props.resource, (dialog.record as any).id, payload)
      else await createResource(props.resource, payload)
      ElMessage.success(
        dialog.record ? $t('system.messages.updated') : $t('system.messages.created')
      )
      dialog.open = false
      summaryRevision.value++
      await load()
    } finally {
      saving.value = false
    }
  }

  function fieldRules(field: Field) {
    const rules: any[] = []
    if (field.required) {
      rules.push({
        required: true,
        type:
          field.type === 'category'
            ? 'number'
            : field.type === 'switch'
              ? 'boolean'
              : ['actions', 'users'].includes(field.type)
                ? 'array'
                : 'string',
        ...(field.type === 'category' ||
        field.type === 'switch' ||
        ['actions', 'users'].includes(field.type)
          ? {}
          : { whitespace: true }),
        message: $t('system.messages.required'),
        trigger: 'blur'
      })
    }
    if (props.resource === 'user' && field.key === 'username') {
      rules.push({
        trigger: 'blur',
        validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) =>
          isValidUsername(value) ? callback() : callback(new Error($t('auth.usernameLength')))
      })
    }
    if (props.resource === 'user' && field.key === 'password') {
      rules.push({
        trigger: 'blur',
        validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) =>
          dialog.record && !value
            ? callback()
            : isValidUserPassword(value)
              ? callback()
              : callback(new Error($t('auth.passwordLength')))
      })
    }
    if (props.resource === 'dictionary' && field.key === 'key')
      rules.push({
        trigger: 'blur',
        validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) =>
          typeof value === 'string' && /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)
            ? callback()
            : callback(new Error($t('pc.system.validation.dictionaryKey')))
      })
    if (field.type === 'json')
      rules.push({
        trigger: 'blur',
        validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
          try {
            JSON.parse(String(value))
            callback()
          } catch {
            callback(new Error($t('pc.system.validation.json')))
          }
        }
      })
    return rules
  }

  function removableIds(ids: number[], control: 'delete' | 'delete-selected') {
    return (
      ids.length > 0 &&
      canControl(control) &&
      ids.every((id) => {
        const record = rows.value.find((item) => item.id === id)
        return record && canRemoveRecord(record as unknown as AdminRecord, control)
      })
    )
  }
  async function remove(ids: number[], control: 'delete' | 'delete-selected') {
    if (!removableIds(ids, control)) return
    await deleteResources(props.resource, ids)
    ElMessage.success($t('system.messages.deleted'))
    if (rows.value.length === ids.length && page.current > 1) page.current--
    await load()
  }
  async function confirmRemove(ids: number[], control: 'delete' | 'delete-selected' = 'delete') {
    if (loading.value || !removableIds(ids, control)) return
    try {
      await ElMessageBox.confirm(
        $t('system.confirm.deleteDescription').replace('{count}', String(ids.length)),
        $t('system.common.confirm'),
        {
          type: 'warning',
          confirmButtonText: $t('system.common.confirm'),
          cancelButtonText: $t('system.common.cancel')
        }
      )
    } catch {
      return
    }
    await remove(ids, control)
  }

  async function approve(user: UserRecord, approved: boolean) {
    if (props.resource !== 'user' || !canControl('approve')) return
    const metadata = { ...(user.metadata || {}) }
    if (approved) delete metadata.reject_register_reason
    else {
      const result = await ElMessageBox.prompt(
        $t('system.messages.rejectionRequired'),
        $t('system.user.reject'),
        { inputValidator: (value: string) => Boolean(value?.trim()) }
      )
      if (!canControl('approve')) return
      metadata.reject_register_reason = result.value.trim()
    }
    await updateResource('user', user.id, { metadata, status: approved ? 1 : 0 })
    ElMessage.success(approved ? $t('system.messages.approved') : $t('system.messages.rejected'))
    await load()
  }

  async function lock(user: UserRecord) {
    if (props.resource !== 'user' || !canControl('lock')) return
    const result = await ElMessageBox.prompt($t('system.user.lockTip'), $t('system.user.lock'), {
      inputPlaceholder: '24',
      inputValue: '24',
      inputPattern: /^\d+$/,
      inputErrorMessage: $t('system.messages.futureLock')
    })
    if (!canControl('lock')) return
    const hours = Number(result.value)
    const metadata = {
      ...(user.metadata || {}),
      lock_expired_at: hours === 0 ? 0 : Date.now() + hours * 3600000
    }
    await updateResource('user', user.id, { metadata, status: 2 })
    ElMessage.success($t('system.messages.locked'))
    await load()
  }

  async function unlock(user: UserRecord) {
    if (props.resource !== 'user' || !canControl('unlock')) return
    const metadata = { ...(user.metadata || {}) }
    delete metadata.lock_expired_at
    await updateResource('user', user.id, { metadata, status: 1 })
    ElMessage.success($t('system.messages.unlocked'))
    await load()
  }

  async function unlockPassword(user: UserRecord) {
    if (props.resource !== 'user' || !canControl('unlock-password')) return
    const metadata = { ...(user.metadata || {}) }
    delete metadata.password_change_failures
    await updateResource('user', user.id, { metadata })
    ElMessage.success($t('system.messages.passwordUnlocked'))
    await load()
  }

  function formatDate(value: unknown) {
    return adminDate(value, timezone.value)
  }
  function listValues(value: unknown) {
    return (Array.isArray(value) ? value.map(String) : String(value ?? '').split(/\r?\n/))
      .map((value) => value.trim())
      .filter(Boolean)
  }
  function formatJson(value: unknown, pretty = true) {
    const encoded = JSON.stringify(value, null, pretty ? 2 : 0)
    return encoded === undefined ? 'null' : encoded
  }
  function jsonPreview(value: unknown) {
    const encoded = formatJson(value, false)
    return encoded.length > 88 ? `${encoded.slice(0, 88)}…` : encoded
  }
  function estimatedTextWidth(value: string, maxWidth: number) {
    let width = 0
    for (const character of value) width += (character.codePointAt(0) || 0) > 255 ? 14 : 8
    return Math.min(maxWidth, Math.max(48, width + 22))
  }
  function adaptiveColumnWidth(column: Column) {
    const maxWidth = column.format === 'json' ? 360 : adaptiveFormats.has(column.format) ? 560 : 280
    let width = Math.min(column.width || column.minWidth || 120, maxWidth)
    const titleWidth = estimatedTextWidth($t(column.label), maxWidth - 32) + 32
    width = Math.max(width, titleWidth)
    for (const row of rows.value as Array<Record<string, any>>) {
      let values: string[] = []
      if (column.format === 'users') values = (row.users || []).map((user: any) => user.username)
      else if (column.format === 'json') values = formatJson(row[column.key]).split('\n')
      else values = listValues(row[column.key])

      const valueWidth =
        column.format === 'tags' || column.format === 'users'
          ? values.reduce((total, value) => total + estimatedTextWidth(value, 220) + 6, 0)
          : values.reduce(
              (widest, value) => Math.max(widest, estimatedTextWidth(value, maxWidth - 32)),
              0
            )
      width = Math.max(width, valueWidth + 32)
    }
    return Math.min(maxWidth, width)
  }
  function statusLabel(value: number) {
    return $t(
      ['system.status.pending', 'system.status.active', 'system.status.locked'][value] ||
        'system.status.pending'
    )
  }
  function statusType(value: number) {
    return (['warning', 'success', 'danger'][value] || 'info') as any
  }
  function resourceRuleType(rule: string, category?: number) {
    if (typeof category === 'number') return category === 0 ? 'primary' : 'success'
    const method = rule.split('|', 1)[0]?.trim().toUpperCase()
    return ({ DELETE: 'danger', GET: 'success', PATCH: 'warning', POST: 'primary' }[method || ''] ||
      'info') as any
  }
  function cell(row: any, column: Column) {
    return row[column.key]
  }
  async function toggleFullscreen() {
    if (!document.fullscreenElement) await tableWrap.value?.requestFullscreen()
    else await document.exitFullscreen()
  }
  function syncFullscreenState() {
    fullscreen.value = document.fullscreenElement === tableWrap.value
  }

  watch(
    () => props.resource,
    () => {
      visibleColumns.value =
        props.resource === 'user'
          ? ['username', 'role', 'status', 'login_count', 'last_logged_in_at', 'metadata']
          : config.value.columns.map((item) => item.key)
      resetFilters()
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    listRun++
    clearTimeout(autoSearchTimer)
    suggestionTimers.forEach((timer) => clearTimeout(timer))
    document.removeEventListener('fullscreenchange', syncFullscreenState)
  })

  onMounted(() => document.addEventListener('fullscreenchange', syncFullscreenState))
</script>

<template>
  <div
    ref="tableWrap"
    :data-testid="`management-page-${resource}`"
    class="page-content system-management"
    :class="{ 'fullscreen-card': fullscreen }"
  >
    <ManagementOverview
      :resource="resource"
      :allowed="allowed('read')"
      :can-query="canControl('query')"
      :can-detail="canDetail"
      :revision="summaryRevision"
      :filters="filters as AdminQuery"
      class="mb-4"
      @filter="applyInsight"
      @group="openGroupDetail"
    />
    <ActiveFilters
      :filters="filters as AdminQuery"
      :editable="canControl('query')"
      @change="applyInsight"
    />
    <ElCard shadow="never" class="mb-4">
      <template #header
        ><div class="flex-cb"
          ><strong>{{ $t(config.title) }}</strong></div
        ></template
      >
      <ElForm inline @submit.prevent="search">
        <ElFormItem v-for="field in visibleFilters" :key="field.key" :label="$t(field.label)">
          <ElSelect
            :disabled="!canControl('query')"
            v-if="field.type === 'status'"
            v-model="filters[field.key] as any"
            clearable
            multiple
            collapse-tags
            style="width: 200px"
            @focus="handleFilterFocus"
            @blur="scheduleFilterSearch"
            @change="markFilterChanged(true)"
          >
            <ElOption
              v-for="value in [0, 1, 2]"
              :key="value"
              :value="value"
              :label="statusLabel(value)"
            />
          </ElSelect>
          <ElSelect
            :disabled="!canControl('query')"
            v-else-if="field.type === 'category'"
            v-model="filters[field.key] as any"
            clearable
            style="width: 180px"
            @focus="handleFilterFocus"
            @blur="scheduleFilterSearch"
            @change="markFilterChanged(true)"
          >
            <ElOption :value="0" :label="$t('system.category.permission')" /><ElOption
              :value="1"
              :label="$t('system.category.jwt')"
            />
          </ElSelect>
          <ElSelect
            :disabled="!canControl('query')"
            v-else-if="field.type === 'enabled'"
            v-model="filters[field.key] as any"
            clearable
            style="width: 180px"
            @focus="handleFilterFocus"
            @blur="scheduleFilterSearch"
            @change="markFilterChanged(true)"
          >
            <ElOption :value="true" :label="$t('system.common.yes')" /><ElOption
              :value="false"
              :label="$t('system.common.no')"
            />
          </ElSelect>
          <ElAutocomplete
            :disabled="!canControl('query')"
            v-else
            v-model="filters[field.key] as string"
            clearable
            popper-class="system-filter-autocomplete"
            :fetch-suggestions="
              (query: string, callback: any) => fetchFilterSuggestions(field, query, callback)
            "
            :trigger-on-focus="true"
            @input="markFilterChanged()"
            @focus="handleFilterFocus"
            @blur="scheduleFilterSearch"
            @select="markFilterChanged(true)"
            @keyup.enter="search"
          >
            <template #default="{ item }">
              <div v-if="item.groupStart" class="filter-suggestion-group">
                {{ $t(`system.suggestions.${item.source}`) }}
              </div>
              <div class="filter-suggestion-row">
                <span class="filter-suggestion-value">
                  <span
                    v-for="(segment, index) in suggestionSegments(item.value, field.key)"
                    :key="index"
                    :class="{ 'filter-suggestion-match': segment.matched }"
                    >{{ segment.text }}</span
                  >
                </span>
                <button
                  v-if="item.source === 'history'"
                  class="filter-history-remove"
                  type="button"
                  :aria-label="$t('system.suggestions.removeHistory')"
                  @mousedown.prevent.stop
                  @click.prevent.stop="removeFilterHistory(field.key, item.value)"
                >
                  <ArtSvgIcon icon="ri:close-line" />
                </button>
              </div>
            </template>
          </ElAutocomplete>
        </ElFormItem>
        <ElFormItem
          ><ElButton v-if="canControl('query')" type="primary" @click="search">{{
            $t('system.common.search')
          }}</ElButton
          ><ElButton v-if="canControl('reset-query')" @click="reset">{{
            $t('system.common.reset')
          }}</ElButton
          ><ElButton
            v-if="config.filters.length > 3"
            text
            type="primary"
            @click="searchExpanded = !searchExpanded"
            >{{ $t(searchExpanded ? 'system.common.less' : 'system.common.more') }}
            <ArtSvgIcon
              :icon="searchExpanded ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'"
            /> </ElButton
        ></ElFormItem>
      </ElForm>
    </ElCard>

    <ActionGroupNav
      v-if="resource === 'action'"
      :groups="permissionGroups"
      :selected="filters.groups_exact ? [String(filters.groups_exact)] : []"
      :total="permissionGroups.reduce((n, g) => n + g.count, 0)"
      :editable="permissions.canManagePermission('action', 'update')"
      :show-create="canControl('create-group')"
      :show-delete="canControl('delete-group')"
      :allow-reorder="canControl('reorder-groups')"
      :loading="groupsLoading"
      :query-enabled="canControl('query')"
      @select="selectPermissionGroup"
      @create="createPermissionGroup"
      @remove="removePermissionGroup"
    />
    <ActionGroupDialog
      v-model:open="groupDialogOpen"
      scope="admin"
      :existing-words="permissionGroups.map((group) => group.name)"
      @saved="refreshPermissionGroups"
    />
    <div class="table-container">
      <ElCard shadow="never">
        <div class="toolbar">
          <div
            ><ElButton v-if="allowed('create')" type="primary" @click="openEditor()"
              ><ArtSvgIcon icon="ri:add-line" class="mr-1" />{{
                $t('system.common.create')
              }}</ElButton
            >
            <ElButton
              v-if="canControl('delete-selected') && selected.length"
              type="danger"
              plain
              @click="
                confirmRemove(
                  selected.map((item: any) => item.id),
                  'delete-selected'
                )
              "
              >{{ $t('system.common.deleteSelected') }}</ElButton
            ></div
          >
          <ElRadioGroup v-model="view" size="small"
            ><ElRadioButton :value="resource === 'action' ? 'matrix' : 'cards'">{{
              $t(`pc.system-insights.${resource === 'action' ? 'matrix' : 'cards'}`)
            }}</ElRadioButton
            ><ElRadioButton value="table">{{
              $t('pc.system-insights.table')
            }}</ElRadioButton></ElRadioGroup
          >
          <ResultToolbar
            v-model:size="tableSize"
            v-model:visible="visibleColumns"
            v-model:bordered="tableBordered"
            v-model:striped="tableStriped"
            :fullscreen="fullscreen"
            :columns="config.columns.map((c) => ({ key: c.key, title: $t(c.label) }))"
            :can-refresh="canControl('refresh')"
            @refresh="refreshFromToolbar"
            @fullscreen="toggleFullscreen"
          />
        </div>
        <ElAlert
          v-if="loadError"
          :title="$t('pc.system-insights.loadError')"
          type="error"
          :closable="false"
          ><ElButton @click="load">{{ $t('pc.system-insights.retry') }}</ElButton></ElAlert
        >
        <ResourceCards
          v-if="view === 'cards'"
          :resource="resource"
          :records="rows as unknown as AdminRecord[]"
          :loading="loading"
          :selected="selected.map((row) => row.id)"
          :can-edit="allowed('update')"
          :can-delete="allowed('delete')"
          :can-detail="canDetail"
          :can-select="canControl('delete-selected')"
          :can-edit-record="manageable"
          :can-delete-record="canRemoveRecord"
          :can-select-record="canSelectRecord"
          @select="toggleSelection"
          @detail="openDetail"
          @edit="(record) => openEditor(record as unknown as SystemRecord)"
          @delete="confirmRemove([$event])"
        />
        <ElTable
          data-testid="management-table"
          v-else
          v-loading="loading"
          :data="rows"
          :border="tableBordered"
          :stripe="tableStriped"
          :size="tableSize"
          style="width: 100%"
          :height="fullscreen ? 'calc(100vh - 170px)' : 'calc(100vh - 345px)'"
          @selection-change="selectRows"
        >
          <ElTableColumn
            v-if="canControl('delete-selected')"
            type="selection"
            width="48"
            fixed="left"
            :selectable="canSelectRecord"
          />
          <ElTableColumn
            v-for="column in columns.filter(
              (column) =>
                view !== 'matrix' || ['name', 'resource', 'menu', 'button'].includes(column.key)
            )"
            :key="column.key"
            :prop="column.key"
            :label="$t(column.label)"
            :width="column.width"
            :min-width="column.minWidth"
            :show-overflow-tooltip="false"
          >
            <template #default="{ row }">
              <PermissionResultCell
                v-if="resource === 'action' && ['resource', 'menu', 'button'].includes(column.key)"
                :config="row.config"
                :field="column.key"
                :can-detail="canDetail"
                @detail="openDetail(row)"
              />
              <span v-else-if="view === 'matrix' && ['menu', 'button'].includes(column.key)"
                ><ElTag v-if="String(row[column.key] ?? '').trim()" type="success"
                  >{{ $t('pc.system-insights.configured') }} ({{
                    String(row[column.key]).split(/\r?\n/).filter(Boolean).length
                  }})</ElTag
                ><span v-else>{{ $t('pc.system-insights.notConfigured') }}</span></span
              >
              <span v-else-if="column.format === 'date'">{{
                column.key === 'last_logged_in_at' && !cell(row, column)
                  ? $t('pc.system-insights.neverLoggedIn')
                  : formatDate(cell(row, column))
              }}</span>
              <ElTag v-else-if="column.format === 'status'" :type="statusType(row.status)">{{
                statusLabel(row.status)
              }}</ElTag>
              <ElTag
                v-else-if="column.format === 'category'"
                :type="row.category === 0 ? 'primary' : 'success'"
                >{{
                  $t(row.category === 0 ? 'system.category.permission' : 'system.category.jwt')
                }}</ElTag
              >
              <ElTag
                v-else-if="column.format === 'boolean'"
                :type="cell(row, column) ? 'success' : 'info'"
                >{{ $t(cell(row, column) ? 'system.enabled.yes' : 'system.enabled.no') }}</ElTag
              >
              <RouterLink
                v-else-if="column.format === 'role' && row.role"
                class="text-theme"
                :to="{ name: 'SystemRole', query: { word: row.role.word } }"
                >{{ row.role.name }}</RouterLink
              >
              <span v-else-if="column.format === 'role'">-</span>
              <div v-else-if="column.format === 'users'" class="tag-list"
                ><span>{{
                  $t('pc.system-members.count', {
                    count: row.member_count ?? row.users?.length ?? 0
                  })
                }}</span
                ><RouterLink
                  v-for="user in row.users"
                  :key="user.id"
                  :to="{ name: 'SystemUser', query: { username: user.username } }"
                  ><ElTag size="small">{{ user.username }}</ElTag></RouterLink
                ></div
              >
              <details v-else-if="column.format === 'json'" class="json-cell">
                <summary>{{ jsonPreview(cell(row, column)) }}</summary>
                <pre>{{ formatJson(cell(row, column)) }}</pre>
              </details>
              <div v-else-if="column.format === 'actions'" class="tag-list">
                <RouterLink
                  v-for="item in listValues(cell(row, column))"
                  :key="item"
                  :to="{
                    name: 'SystemAction',
                    query: { code: listValues(cell(row, column)).join(',') }
                  }"
                >
                  <ElTag size="small" type="primary">{{ catalogLabel('actions', item) }}</ElTag>
                </RouterLink>
                <span v-if="!listValues(cell(row, column)).length">-</span>
              </div>
              <div
                v-else-if="column.format === 'tags' || column.format === 'rules'"
                class="tag-list"
                ><ElTag
                  v-for="item in listValues(cell(row, column))"
                  :key="item"
                  size="small"
                  effect="plain"
                  :type="column.format === 'rules' ? resourceRuleType(item, row.category) : 'info'"
                  >{{ item }}</ElTag
                ><span v-if="!listValues(cell(row, column)).length">-</span></div
              >
              <span v-else>{{ cell(row, column) ?? '-' }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn :label="$t('system.common.operations')" fixed="right" min-width="300">
            <template #default="{ row }"
              ><div class="row-actions">
                <ElButton v-if="canDetail" link type="primary" @click="openDetail(row)">{{
                  $t('pc.system-insights.details')
                }}</ElButton>
                <ElButton
                  v-if="props.resource === 'user' && row.status === 0 && canControl('approve')"
                  link
                  type="success"
                  @click="approve(row, true)"
                  >{{ $t('system.user.approve') }}</ElButton
                >
                <ElButton
                  v-if="props.resource === 'user' && row.status === 0 && canControl('approve')"
                  link
                  type="warning"
                  @click="approve(row, false)"
                  >{{ $t('system.user.reject') }}</ElButton
                >
                <ElButton
                  v-if="allowed('update') && manageable(row)"
                  link
                  type="primary"
                  @click="openEditor(row)"
                  >{{ $t('system.common.edit') }}</ElButton
                >
                <ElButton
                  v-if="props.resource === 'user' && row.status === 1 && canControl('lock')"
                  link
                  type="warning"
                  @click="lock(row)"
                  >{{ $t('system.user.lock') }}</ElButton
                >
                <ElButton
                  v-if="props.resource === 'user' && row.status === 2 && canControl('unlock')"
                  link
                  @click="unlock(row)"
                  >{{ $t('system.user.unlock') }}</ElButton
                >
                <ElButton
                  v-if="
                    props.resource === 'user' &&
                    Number(row.metadata?.password_change_failures) > 0 &&
                    canControl('unlock-password')
                  "
                  link
                  @click="unlockPassword(row)"
                  >{{ $t('system.user.unlockPassword') }}</ElButton
                >
                <ElButton
                  v-if="canRemoveRecord(row)"
                  link
                  type="danger"
                  @click="confirmRemove([row.id])"
                  >{{ $t('system.common.delete') }}</ElButton
                >
              </div></template
            >
          </ElTableColumn>
        </ElTable>
        <div class="pagination"
          ><ElPagination
            v-model:current-page="page.current"
            v-model:page-size="page.size"
            :total="page.total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            @change="load"
        /></div>
      </ElCard>
    </div>

    <RecordDetail
      :resource="resource"
      :record="detailRecord"
      :can-edit="allowed('update') && manageable(detailRecord)"
      @close="detailRecord = undefined"
      @edit="(record) => openEditor(record as unknown as SystemRecord)"
    />
    <ElDrawer
      v-model="dialog.open"
      data-testid="management-drawer"
      :before-close="beforeCloseEditor"
      :close-on-press-escape="!saving"
      :close-on-click-modal="!saving"
      :title="
        $t(dialog.record ? 'system.common.edit' : 'system.common.create') + ' · ' + $t(config.title)
      "
      size="min(720px,100vw)"
      destroy-on-close
    >
      <ElForm ref="formRef" :model="form" label-position="top">
        <ActionEditor
          v-if="resource === 'action'"
          v-model:word="form.word"
          v-model:names="form.names"
          v-model:group="form.group"
          v-model:config="form.config"
          :record-id="dialog.record?.id"
          :record-scope="(dialog.record as any)?.scope"
          :groups="editorGroups"
          :disabled="saving"
          @validity="editorProblem = $event"
          @edit-existing="
            (id) =>
              getAdminRecord('action', id).then((row) => openEditor(row as unknown as SystemRecord))
          "
        />
        <ElAlert v-if="editorProblem" type="error" :title="$t(editorProblem)" :closable="false" />
        <ElFormItem
          v-for="field in editorFields"
          :key="field.key"
          :label="$t(field.label)"
          :prop="field.key"
          :rules="fieldRules(field)"
        >
          <ElInput v-if="field.type === 'input'" v-model="form[field.key]" />
          <ElInput
            v-else-if="field.type === 'password'"
            v-model="form[field.key]"
            type="password"
            show-password
            :placeholder="dialog.record ? $t('system.user.keepPassword') : ''"
          />
          <RuleListEditor
            v-else-if="['resource', 'menu', 'button'].includes(field.key)"
            v-model="form[field.key]"
            :label="$t(field.label)"
          />
          <ElInput
            v-else-if="field.type === 'textarea' || field.type === 'json'"
            v-model="form[field.key]"
            type="textarea"
            :class="{ 'json-editor': field.type === 'json' }"
            :rows="field.type === 'json' ? 8 : 4"
          />
          <ElSwitch v-else-if="field.type === 'switch'" v-model="form[field.key]" />
          <ElRadioGroup v-else-if="field.type === 'category'" v-model="form[field.key]"
            ><ElRadio :value="0">{{ $t('system.category.permission') }}</ElRadio
            ><ElRadio :value="1">{{ $t('system.category.jwt') }}</ElRadio></ElRadioGroup
          >
          <ElSelect
            v-else-if="field.type === 'role'"
            v-model="form[field.key]"
            clearable
            filterable
            remote
            :remote-method="searchRoles"
            @visible-change="$event && searchRoles()"
            class="w-full"
            ><ElOption
              v-for="role in relation.roles"
              :key="role.id"
              :value="role.id"
              :label="`${role.name} · ${role.word}`"
          /></ElSelect>
          <PermissionAssignment
            v-else-if="field.type === 'actions'"
            :value="form.action_codes ?? []"
            v-model:bindings="form.action_bindings"
            :disabled="saving"
            @validity="editorProblem = $event"
          />
          <div
            v-else-if="field.type === 'users' && dialog.record"
            data-testid="group-member-editor"
            class="w-full"
            ><p>{{
              $t('pc.system-members.changes', {
                added: memberAdded.length,
                removed: memberRemoved.length
              })
            }}</p
            ><GroupMembers
              :id="dialog.record.id"
              :removed="memberRemoved"
              editable
              @remove="
                (member) =>
                  (memberRemoved = memberRemoved.includes(member.id)
                    ? memberRemoved.filter((id) => id !== member.id)
                    : [...memberRemoved, member.id])
              " /><AssociationEditor
              :model-value="memberAdded"
              resource="user"
              :exclude-group="dialog.record.id"
              @update:model-value="memberAdded = $event.map(Number)"
          /></div>
          <AssociationEditor
            v-else-if="field.type === 'users'"
            v-model="form[field.key]"
            resource="user"
          />
        </ElFormItem>
      </ElForm>
      <template #footer
        ><ElButton :disabled="saving" @click="beforeCloseEditor(() => (dialog.open = false))">{{
          $t('system.common.cancel')
        }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">{{
          $t('system.common.save')
        }}</ElButton></template
      >
    </ElDrawer>
  </div>
</template>

<style scoped>
  .active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .toolbar {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .toolbar :deep(.el-radio-button__inner) {
    display: inline-flex;
    align-items: center;
    min-height: var(--el-component-custom-height);
  }

  .table-container {
    width: 100%;
  }

  .tag-list,
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .json-cell {
    margin: 0;
    font: 12px/1.5 monospace;

    summary {
      overflow: hidden;
      color: var(--el-color-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    pre {
      max-height: 240px;
      padding: 10px;
      margin: 8px 0 0;
      overflow: auto;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      background: var(--el-fill-color-light);
      border-radius: 6px;
    }
  }

  .filter-suggestion-row {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 34px;
  }

  .filter-suggestion-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-suggestion-group {
    padding: 7px 12px 5px;
    margin: 0 -20px 2px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-lighter);
  }

  .filter-suggestion-match {
    font-weight: 700;
    color: var(--el-color-primary);
  }

  .filter-history-remove {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 5px;

    &:hover {
      color: var(--el-color-danger);
      background: var(--el-fill-color);
    }
  }

  :global(.system-filter-autocomplete .el-autocomplete-suggestion__wrap) {
    padding: 6px;
  }

  :global(.system-filter-autocomplete li) {
    padding: 0 14px;
    border-radius: 6px;
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 18px;
  }

  .column-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .table-style-options {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
  }

  :deep(.el-table .cell) {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  :deep(.json-editor textarea) {
    max-height: 240px;
    overflow: auto;
  }

  .fullscreen-card {
    box-sizing: border-box;
    height: 100vh;
    padding: 16px;
    background: var(--el-bg-color);

    overflow: auto;
  }
</style>
