<script setup lang="ts">
  import type { FormInstance } from 'element-plus'
  import { ElMessageBox } from 'element-plus'
  import type { ResourceKind, SystemRecord, UserRecord } from '@/api/system-service'

  import {
    deleteResources,
    listResource,
    createResource,
    updateResource
  } from '@/api/system-service'
  import { useUserStore } from '@/store/modules/user'
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
  const userStore = useUserStore()
  const loading = ref(false)
  const saving = ref(false)
  const rows = ref<SystemRecord[]>([])
  const selected = ref<SystemRecord[]>([])
  const page = reactive({ current: 1, size: 10, total: 0 })
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
      fields: [
        { key: 'name', label: 'system.fields.name', type: 'input', required: true },
        { key: 'group', label: 'system.fields.group', type: 'input', required: true },
        { key: 'word', label: 'system.fields.word', type: 'input', required: true },
        { key: 'resource', label: 'system.fields.resourceRules', type: 'textarea' },
        { key: 'menu', label: 'system.fields.menuPaths', type: 'textarea' },
        { key: 'button', label: 'system.fields.buttonPermission', type: 'textarea' }
      ],
      columns: [
        { key: 'id', label: 'system.fields.id', width: 80 },
        { key: 'name', label: 'system.fields.name', width: 150 },
        { key: 'group', label: 'system.fields.group', width: 140 },
        { key: 'word', label: 'system.fields.word', width: 150 },
        { key: 'code', label: 'system.fields.code', width: 150 },
        { key: 'resource', label: 'system.fields.resourceRules', width: 260, format: 'rules' },
        { key: 'menu', label: 'system.fields.menuPaths', width: 200 },
        { key: 'button', label: 'system.fields.buttonPermission', width: 200 },
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
        { key: 'metadata', label: 'system.fields.metadata', width: 300, format: 'json' },
        { key: 'action_codes', label: 'system.fields.permissions', width: 320, format: 'actions' },
        ...commonDates
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
      .map((item) => ({ ...item, width: adaptiveColumnWidth(item), minWidth: undefined }))
  )
  const prefix = computed(
    () => `system.${props.resource === 'user-group' ? 'user.group' : props.resource}`
  )
  function allowed(operation: 'create' | 'read' | 'update' | 'delete') {
    const codes = userStore.info.buttons || []
    return codes.includes('*') || codes.includes(`${prefix.value}.${operation}`)
  }

  async function load() {
    if (!allowed('read')) return
    loading.value = true
    try {
      const params: Record<string, unknown> = { p: page.current, s: page.size }
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null)
          params[key] = Array.isArray(value) ? value.join(',') : value
      })
      const result = await listResource(props.resource, params)
      rows.value = result.items
      page.total = result.t
      selected.value = []
    } finally {
      loading.value = false
    }
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
    clearTimeout(autoSearchTimer)
    filtersDirty = false
    saveFilterHistory()
    page.current = 1
    load()
  }
  function reset() {
    clearTimeout(autoSearchTimer)
    filtersDirty = false
    Object.keys(filters).forEach((key) => delete filters[key])
    search()
  }

  function markFilterChanged(autoSchedule = false) {
    filtersDirty = true
    if (autoSchedule) scheduleFilterSearch()
  }

  function handleFilterFocus() {
    clearTimeout(autoSearchTimer)
  }

  function scheduleFilterSearch() {
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
        const suggestion = field.suggestion || { resource: props.resource, fieldKey: field.key }
        try {
          const params: Record<string, unknown> = { p: 1, s: 10 }
          if (query.trim()) params[suggestion.fieldKey] = query.trim()
          const result = await listResource(suggestion.resource, params)
          if (suggestionRequestIds.get(key) !== requestId) return
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

  async function loadRelations() {
    const wanted = config.value.fields.map((field) => field.type)
    const tasks: Promise<void>[] = []
    if (wanted.includes('actions'))
      tasks.push(
        listResource('action', { p: 1, s: 1000 }).then((r) => {
          relation.actions = r.items
        })
      )
    if (wanted.includes('role'))
      tasks.push(
        listResource('role', { p: 1, s: 1000 }).then((r) => {
          relation.roles = r.items
        })
      )
    if (wanted.includes('users'))
      tasks.push(
        listResource('user', { p: 1, s: 1000 }).then((r) => {
          relation.users = r.items
        })
      )
    await Promise.all(tasks)
  }

  async function openEditor(record?: SystemRecord) {
    dialog.record = record || null
    Object.keys(form).forEach((key) => delete form[key])
    if (record) Object.assign(form, structuredClone(toRaw(record)))
    if (props.resource === 'dictionary')
      form.value = JSON.stringify(record ? (record as any).value : [], null, 2)
    if (props.resource === 'dictionary' && !record) form.enabled = true
    if (props.resource === 'whitelist' && !record) form.category = 0
    if (props.resource === 'user') form.password = ''
    if (props.resource === 'user-group' && record)
      form.user_ids = (record as any).users.map((item: any) => item.id)
    await loadRelations()
    dialog.open = true
    await nextTick()
    formRef.value?.clearValidate()
  }

  async function save() {
    if (!(await formRef.value?.validate())) return
    const payload: Record<string, unknown> = {}
    for (const field of config.value.fields) {
      if (form[field.key] !== undefined) payload[field.key] = form[field.key]
    }
    if (props.resource === 'dictionary') {
      try {
        payload.value = JSON.parse(String(payload.value))
      } catch {
        return ElMessage.error($t('system.messages.invalidJson'))
      }
    }
    if (props.resource === 'user' && dialog.record && !payload.password) delete payload.password
    if (props.resource === 'user' && !dialog.record && !payload.password)
      return ElMessage.warning($t('auth.passwordRequired'))
    saving.value = true
    try {
      if (dialog.record) await updateResource(props.resource, (dialog.record as any).id, payload)
      else await createResource(props.resource, payload)
      ElMessage.success(
        dialog.record ? $t('system.messages.updated') : $t('system.messages.created')
      )
      dialog.open = false
      await load()
    } finally {
      saving.value = false
    }
  }

  function fieldRules(field: Field) {
    const rules: any[] = []
    if (field.required) {
      rules.push({ required: true, message: $t('system.messages.required'), trigger: 'blur' })
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
    return rules
  }

  async function remove(ids: number[]) {
    await deleteResources(props.resource, ids)
    ElMessage.success($t('system.messages.deleted'))
    if (rows.value.length === ids.length && page.current > 1) page.current--
    await load()
  }

  async function confirmRemove(ids: number[]) {
    await ElMessageBox.confirm(
      $t('system.confirm.deleteDescription').replace('{count}', String(ids.length)),
      $t('system.common.confirm'),
      {
        type: 'warning',
        confirmButtonText: $t('system.common.confirm'),
        cancelButtonText: $t('system.common.cancel')
      }
    )
    await remove(ids)
  }

  async function approve(user: UserRecord, approved: boolean) {
    const metadata = { ...(user.metadata || {}) }
    if (approved) delete metadata.reject_register_reason
    else {
      const result = await ElMessageBox.prompt(
        $t('system.messages.rejectionRequired'),
        $t('system.user.reject'),
        { inputValidator: (value: string) => Boolean(value?.trim()) }
      )
      metadata.reject_register_reason = result.value.trim()
    }
    await updateResource('user', user.id, { metadata, status: approved ? 1 : 0 })
    ElMessage.success(approved ? $t('system.messages.approved') : $t('system.messages.rejected'))
    await load()
  }

  async function lock(user: UserRecord) {
    const result = await ElMessageBox.prompt($t('system.user.lockTip'), $t('system.user.lock'), {
      inputPlaceholder: '24',
      inputValue: '24',
      inputPattern: /^\d+$/,
      inputErrorMessage: $t('system.messages.futureLock')
    })
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
    const metadata = { ...(user.metadata || {}) }
    delete metadata.lock_expired_at
    await updateResource('user', user.id, { metadata, status: 1 })
    ElMessage.success($t('system.messages.unlocked'))
    await load()
  }

  async function unlockPassword(user: UserRecord) {
    const metadata = { ...(user.metadata || {}) }
    delete metadata.password_change_failures
    await updateResource('user', user.id, { metadata })
    ElMessage.success($t('system.messages.passwordUnlocked'))
    await load()
  }

  function formatDate(value: unknown) {
    if (!value) return '-'
    const date = new Date(Number(value))
    const part = (number: number) => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`
  }
  function listValues(value: unknown) {
    return String(value || '')
      .split(/[,\n]/)
      .map((item) => item.trim())
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
      visibleColumns.value = config.value.columns.map((item) => item.key)
      reset()
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    clearTimeout(autoSearchTimer)
    suggestionTimers.forEach((timer) => clearTimeout(timer))
    document.removeEventListener('fullscreenchange', syncFullscreenState)
  })

  onMounted(() => document.addEventListener('fullscreenchange', syncFullscreenState))
</script>

<template>
  <div
    ref="tableWrap"
    class="page-content system-management"
    :class="{ 'fullscreen-card': fullscreen }"
  >
    <ElCard shadow="never" class="mb-4">
      <template #header
        ><div class="flex-cb"
          ><strong>{{ $t(config.title) }}</strong></div
        ></template
      >
      <ElForm inline @submit.prevent="search">
        <ElFormItem v-for="field in visibleFilters" :key="field.key" :label="$t(field.label)">
          <ElSelect
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
          ><ElButton type="primary" @click="search">{{ $t('system.common.search') }}</ElButton
          ><ElButton @click="reset">{{ $t('system.common.reset') }}</ElButton
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
              v-if="allowed('delete') && selected.length"
              type="danger"
              plain
              @click="confirmRemove(selected.map((item: any) => item.id))"
              >{{ $t('system.common.deleteSelected') }}</ElButton
            ></div
          >
          <div class="flex gap-2">
            <ElButton :title="$t('system.common.refresh')" @click="load">
              <ArtSvgIcon icon="ri:refresh-line" />
            </ElButton>
            <ElSelect v-model="tableSize" style="width: 115px"
              ><ElOption value="small" :label="$t('system.table.compact')" /><ElOption
                value="default"
                :label="$t('system.table.default')" /><ElOption
                value="large"
                :label="$t('system.table.loose')"
            /></ElSelect>
            <ElButton :title="$t('system.table.fullscreen')" @click="toggleFullscreen"
              ><ArtSvgIcon :icon="fullscreen ? 'ri:fullscreen-exit-line' : 'ri:fullscreen-line'"
            /></ElButton>
            <ElPopover trigger="click" :width="220"
              ><template #reference
                ><ElButton><ArtSvgIcon icon="ri:layout-column-line" /></ElButton></template
              ><ElCheckboxGroup v-model="visibleColumns" class="column-picker"
                ><ElCheckbox
                  v-for="column in config.columns"
                  :key="column.key"
                  :value="column.key"
                  >{{ $t(column.label) }}</ElCheckbox
                ></ElCheckboxGroup
              ></ElPopover
            >
            <ElPopover trigger="click" :width="200">
              <template #reference>
                <ElButton :title="$t('system.table.style')">
                  <ArtSvgIcon icon="ri:table-2" />
                </ElButton>
              </template>
              <div class="table-style-options">
                <ElSwitch v-model="tableBordered" />
                <span>{{ $t('system.table.bordered') }}</span>
                <ElSwitch v-model="tableStriped" />
                <span>{{ $t('system.table.striped') }}</span>
              </div>
            </ElPopover>
          </div>
        </div>
        <ElTable
          v-loading="loading"
          :data="rows"
          :border="tableBordered"
          :stripe="tableStriped"
          :size="tableSize"
          style="width: 100%"
          :height="fullscreen ? 'calc(100vh - 170px)' : 'calc(100vh - 345px)'"
          @selection-change="selected = $event"
        >
          <ElTableColumn type="selection" width="48" fixed="left" />
          <ElTableColumn
            v-for="column in columns"
            :key="column.key"
            :prop="column.key"
            :label="$t(column.label)"
            :width="column.width"
            :min-width="column.minWidth"
            :show-overflow-tooltip="false"
          >
            <template #default="{ row }">
              <span v-if="column.format === 'date'">{{ formatDate(cell(row, column)) }}</span>
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
                  <ElTag size="small" type="primary">{{ item }}</ElTag>
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
                <ElButton
                  v-if="props.resource === 'user' && row.status === 0 && allowed('update')"
                  link
                  type="success"
                  @click="approve(row, true)"
                  >{{ $t('system.user.approve') }}</ElButton
                >
                <ElButton
                  v-if="props.resource === 'user' && row.status === 0 && allowed('update')"
                  link
                  type="warning"
                  @click="approve(row, false)"
                  >{{ $t('system.user.reject') }}</ElButton
                >
                <ElButton v-if="allowed('update')" link type="primary" @click="openEditor(row)">{{
                  $t('system.common.edit')
                }}</ElButton>
                <ElButton
                  v-if="props.resource === 'user' && row.status === 1 && allowed('update')"
                  link
                  type="warning"
                  @click="lock(row)"
                  >{{ $t('system.user.lock') }}</ElButton
                >
                <ElButton
                  v-if="props.resource === 'user' && row.status === 2 && allowed('update')"
                  link
                  @click="unlock(row)"
                  >{{ $t('system.user.unlock') }}</ElButton
                >
                <ElButton
                  v-if="
                    props.resource === 'user' &&
                    Number(row.metadata?.password_change_failures) > 0 &&
                    allowed('update')
                  "
                  link
                  @click="unlockPassword(row)"
                  >{{ $t('system.user.unlockPassword') }}</ElButton
                >
                <ElButton
                  v-if="allowed('delete')"
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

    <ElDialog
      v-model="dialog.open"
      :title="
        $t(dialog.record ? 'system.common.edit' : 'system.common.create') + ' · ' + $t(config.title)
      "
      width="680px"
      destroy-on-close
    >
      <ElForm ref="formRef" :model="form" label-position="top">
        <ElFormItem
          v-for="field in config.fields"
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
            class="w-full"
            ><ElOption
              v-for="role in relation.roles"
              :key="role.id"
              :value="role.id"
              :label="`${role.name} · ${role.word}`"
          /></ElSelect>
          <ElSelect
            v-else-if="field.type === 'actions'"
            v-model="form[field.key]"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            class="w-full"
            ><ElOption
              v-for="action in relation.actions"
              :key="action.code"
              :value="action.code"
              :label="`${action.name} · ${action.word} (${action.code})`"
          /></ElSelect>
          <ElSelect
            v-else-if="field.type === 'users'"
            v-model="form[field.key]"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            class="w-full"
            ><ElOption
              v-for="user in relation.users"
              :key="user.id"
              :value="user.id"
              :label="`${user.username} · ${user.code}`"
          /></ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer
        ><ElButton @click="dialog.open = false">{{ $t('system.common.cancel') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">{{
          $t('system.common.save')
        }}</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<style scoped>
  .toolbar {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
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
