'use client';
import { authorizedGroupMemberDelta, groupMemberAccess, hasManagementControl, hasManagementPage } from '../management-access';
import type { UserInfo } from '@/features/auth/api';
import { systemListFields } from '../list-fields';
import PermissionResultCell from '@/features/permissions/result-cell';
import { PermissionGroupNav } from '@/features/permissions/group-controls';
import ActionEditor from '@/features/permissions/action-editor';
import PermissionAssignment from '@/features/permissions/assignment';
import type { ActionResourceBinding, ActionConfig } from '@/features/permissions/types';
import {
  authorizedEditorPayload,
  canDeleteAssignedRecord,
  canManageDefinition,
  isAssignmentField,
  isExistingCredentialField
} from '@/features/permissions/assignment-policy';
import { cn } from '@/lib/utils';
import { useDefaultPageSize } from '@/features/admin/page-size';
import { StyledSelect, RelationPicker } from './record-selects';
import ResultToolbar from './result-toolbar';
import ActiveFilters from './active-filters';
import ManagementOverview from './management-overview';
import ResourceCards from './resource-cards';
import RecordDetail from './record-detail';
import AssociationEditor from './association-editor';
import GroupMemberEditor from './group-member-editor';
import RuleListEditor from './rule-list-editor';
import { AdminDrawer, useAdminText } from './admin-ui';
import { getAdminRecord } from '@/features/admin/service';
import {
  adminDate,
  changedFields,
  parseAdminDateTime,
  type AdminQuery,
  type AdminRecord
} from '@/features/admin/model';

import { isBadGatewayError } from '@/features/admin/request-error';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale, type Locale } from '@/features/i18n/locale-context';
import {
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconLock,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUserCheck,
  IconX
} from '@tabler/icons-react';
import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createRecord, deleteRecords, listActionGroups, listRecords, updateRecord } from '../api';
import { resourceConfigs } from '../config';
import type { FieldConfig, ResourceKind, SystemRecord } from '../types';
import { isValidPassword, isValidUsername } from '@/features/auth/validation';

type Density = 'compact' | 'default' | 'loose';
const dictionaryKeyPattern = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;


function initialValues(resource: ResourceKind, record?: SystemRecord) {
  const result: Record<string, unknown> = {};
  for (const field of resourceConfigs[resource].fields) {
    let value = record?.[field.key] ?? field.defaultValue ?? '';
    if (field.key === 'user_ids' && record && Array.isArray(record.users)) {
      value = record.users.map((user) => (user as { id: number }).id);
    }
    if (field.type === 'json') value = JSON.stringify(value, null, 2);
    if (field.type === 'action-select' && !Array.isArray(value)) value = [];
    if (field.type === 'user-select' && !Array.isArray(value)) value = [];
    result[field.key] = value;
  }
  if (resource === 'user' && record) result.password = '';
  if (resource === 'action') {
    result.config = record?.config;
    result.names = record?.names ?? {};
    result.scope = record?.scope ?? 'admin';
  }
  return result;
}

function formPayload(fields: FieldConfig[], values: Record<string, unknown>, editing: boolean) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (editing && field.key === 'password' && !raw) continue;
    if (field.type === 'json') {
      payload[field.key] = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    } else if (field.type === 'csv') {
      payload[field.key] = String(raw || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (field.type === 'number-csv') {
      payload[field.key] = String(raw || '')
        .split(',')
        .map(Number)
        .filter((item) => Number.isInteger(item) && item > 0);
    } else if (field.type === 'role-select') {
      payload[field.key] =
        raw === '' || raw === undefined ? (editing ? 0 : undefined) : Number(raw);
    } else if (field.type === 'number' || field.type === 'status' || field.type === 'category') {
      payload[field.key] = raw === '' || raw === undefined ? 0 : Number(raw);
    } else if (field.type === 'boolean') {
      payload[field.key] = raw === true || raw === 'true';
    } else if (field.type === 'action-select') {
      payload[field.key] = Array.isArray(raw) ? raw.map(String) : [];
    } else if (field.type === 'user-select') {
      payload[field.key] = Array.isArray(raw) ? raw.map(Number) : [];
    } else {
      payload[field.key] = typeof raw === 'string' ? raw.trim() : raw;
    }
  }
  return payload;
}

function changedPayload(current: Record<string, unknown>, initial: Record<string, unknown>) {
  return changedFields(current, initial);
}

function localize(value: string, locale: Locale) {
  const separator = value.indexOf(' / ');
  if (separator < 0) return value;
  return locale === 'zh-CN' ? value.slice(separator + 3) : value.slice(0, separator);
}

function semanticBadgeClass(color: 'blue' | 'green' | 'orange' | 'red' | 'yellow' | 'default') {
  return {
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    orange: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    default: 'border-border bg-muted text-muted-foreground'
  }[color];
}

function formatDateTimeInput(value: number, zone?: string) {
  return adminDate(value, zone).slice(0, 16).replace(' ', 'T');
}

function resourceRuleColor(rule: string, category?: unknown) {
  if (typeof category === 'number') return category === 0 ? 'blue' : 'green';
  const method = rule.split('|', 1)[0]?.trim().toUpperCase();
  return (
    ({ DELETE: 'red', GET: 'green', PATCH: 'orange', POST: 'blue' } as const)[
      method as 'DELETE' | 'GET' | 'PATCH' | 'POST'
    ] ?? 'default'
  );
}

function displayValue(
  key: string,
  value: unknown,
  record: SystemRecord,
  locale: Locale,
  _timezone: string
) {
  if (key === 'last_logged_in_at' && !value) return localize('Never signed in / 从未登录', locale);
  if (key.endsWith('_at') && typeof value === 'number') return adminDate(value, _timezone);
  if (key === 'status') {
    const label = localize(
      value === 1 ? 'Active / 正常' : value === 2 ? 'Locked / 已锁定' : 'Pending / 待审核',
      locale
    );
    const lockExpiredAt = Number(
      (record.metadata as Record<string, unknown> | undefined)?.lock_expired_at
    );
    const color = value === 1 ? 'green' : value === 2 ? 'red' : 'yellow';
    return (
      <div className='space-y-1'>
        <Badge variant='outline' className={semanticBadgeClass(color)}>
          {label}
        </Badge>
        {value === 2 && (
          <div className='text-xs text-muted-foreground'>
            {lockExpiredAt === 0
              ? localize('Permanent / 永久', locale)
              : Number.isFinite(lockExpiredAt)
                ? adminDate(lockExpiredAt, _timezone)
                : ''}
          </div>
        )}
      </div>
    );
  }
  if (key === 'category')
    return (
      <Badge
        variant='outline'
        className={semanticBadgeClass(Number(value) === 0 ? 'blue' : 'green')}
      >
        {Number(value) === 0 ? localize('Permission / 权限', locale) : 'JWT'}
      </Badge>
    );
  if (typeof value === 'boolean')
    return (
      <Badge variant='outline' className={semanticBadgeClass(value ? 'green' : 'default')}>
        {value ? localize('Enabled / 已启用', locale) : localize('Disabled / 已停用', locale)}
      </Badge>
    );
  if (key === 'role' && value && typeof value === 'object') {
    const role = value as { name?: string; word?: string };
    return (
      <Link
        className='text-primary hover:underline'
        href={`/system/role?word=${encodeURIComponent(role.word ?? '')}`}
      >
        {role.name ?? '—'}
      </Link>
    );
  }
  if (key === 'value') return <JsonPreview value={value} locale={locale} />;
  if (['menu', 'button'].includes(key) && typeof value === 'string')
    return (
      <div className='flex max-w-80 flex-wrap gap-1'>
        {value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => (
            <Badge
              key={line}
              variant='outline'
              className='max-w-full whitespace-normal break-words'
            >
              {line}
            </Badge>
          ))}
      </div>
    );
  if (key === 'resource' && typeof value === 'string') {
    return (
      <div className='flex max-w-80 flex-col items-start gap-1'>
        {value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item, index) => (
            <Badge
              key={`${item}-${index}`}
              variant='outline'
              className={cn(
                'max-w-full whitespace-normal',
                semanticBadgeClass(resourceRuleColor(item, record.category))
              )}
            >
              {item}
            </Badge>
          ))}
      </div>
    );
  }
  if (key === 'action_codes' && Array.isArray(value)) {
    return (
      <div className='flex max-w-80 flex-wrap gap-1'>
        {value.map((item) => (
          <Link key={String(item)} href={`/system/action?code=${encodeURIComponent(String(item))}`}>
            <Badge variant='outline' className={semanticBadgeClass('blue')}>
              {String(item)}
            </Badge>
          </Link>
        ))}
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className='flex max-w-80 flex-wrap gap-1'>
        {value.map((item, index) => {
          const label =
            typeof item === 'object' && item
              ? String(
                  (item as { username?: string; name?: string; code?: string }).username ??
                    (item as { name?: string }).name ??
                    (item as { code?: string }).code ??
                    JSON.stringify(item)
                )
              : String(item);
          return (
            <Badge key={`${label}-${index}`} variant='outline'>
              {label}
            </Badge>
          );
        })}
      </div>
    );
  }
  if (value && typeof value === 'object')
    return <code className='block max-w-80 truncate text-xs'>{JSON.stringify(value)}</code>;
  return value == null || value === '' ? '—' : String(value);
}

function JsonPreview({ value, locale }: { value: unknown; locale: Locale }) {
  const encoded = JSON.stringify(value, null, 2) ?? String(value ?? '');
  return (
    <details className='group max-w-80 rounded-md border bg-muted/20 open:bg-muted/30'>
      <summary className='cursor-pointer select-none px-3 py-2 text-xs font-medium text-primary marker:text-muted-foreground'>
        {locale === 'zh-CN' ? '查看 JSON' : 'View JSON'}
        <span className='ml-2 text-muted-foreground'>
          ({encoded.length} {locale === 'zh-CN' ? '字符' : 'chars'})
        </span>
      </summary>
      <pre className='max-h-64 overflow-auto border-t p-3 text-xs whitespace-pre-wrap'>
        {encoded}
      </pre>
    </details>
  );
}

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem('shadcn-system-filter-history') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, string[]>)
      : {};
  } catch {
    return {};
  }
}

export function ManagementPage({ resource }: { resource: ResourceKind }) {
  const config = resourceConfigs[resource];
  const auth = useAuth();
  const latestUser = React.useRef(auth.user);
  React.useEffect(() => { latestUser.current = auth.user; }, [auth.user]);
  const { locale, pick, timezone } = useLocale();
  const text = useAdminText();
  const [view, setView] = React.useState<'cards' | 'matrix' | 'table'>(
    resource === 'user' ? 'table' : resource === 'action' ? 'matrix' : 'cards'
  );
  const [summaryRevision, setSummaryRevision] = React.useState(0);
  const [detailRecord, setDetailRecord] = React.useState<AdminRecord>();
  const [memberAdded, setMemberAdded] = React.useState<number[]>([]);
  const [memberRemoved, setMemberRemoved] = React.useState<number[]>([]);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  function closeEditor() {
    if (saving) return;
    if (
      JSON.stringify(values) !== JSON.stringify(initialEditorValues) ||
      memberAdded.length ||
      memberRemoved.length
    )
      setDiscardOpen(true);
    else setOpen(false);
  }
  const [records, setRecords] = React.useState<SystemRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const defaultSize = useDefaultPageSize();
  const [size, setSize] = React.useState(defaultSize);
  React.useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setSize(defaultSize);
    setPage(1);
  }, [defaultSize]);
  const [filterDraft, setFilterDraft] = React.useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = React.useState<Record<string, string>>({});
  const filterDraftRef = React.useRef<Record<string, string>>({});
  function applyInsight(updates: AdminQuery) {
    if (!canNow('query')) return;
    cancelFilterSearch();
    filtersDirtyRef.current = false;
    const next = { ...filterDraftRef.current };
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) delete next[key];
      else next[key] = String(value);
    }
    filterDraftRef.current = next;
    setFilterDraft(next);
    setActiveFilters(next);
    setPage(1);
  }

  const filtersDirtyRef = React.useRef(false);
  const filterSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterHistory, setFilterHistory] = React.useState<Record<string, string[]>>({});
  const [searchExpanded, setSearchExpanded] = React.useState(false);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SystemRecord>();
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [initialEditorValues, setInitialEditorValues] = React.useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [bindings, setBindings] = React.useState<ActionResourceBinding[] | undefined>();
  const [permissionProblem, setPermissionProblem] = React.useState('');
  const hasAllPermissions = auth.user?.permission.permission_scope === '*';
  const editorOperation = editing ? 'update' : 'create';
  const canAssign =
    hasAllPermissions ||
    !!auth.user?.permission.permission_scopes?.includes(`${resource}:${editorOperation}`);
  const editorFields = config.fields.filter(
    (field) =>
      (canAssign || !isAssignmentField(resource, field.key)) &&
      (!editing || hasAllPermissions || !isExistingCredentialField(resource, field.key))
  );
  const canManageRecord = (record: SystemRecord, user: UserInfo | null = auth.user) => {
    if (resource !== 'action') return true;
    if (!record.config || typeof record.config !== 'object' || Array.isArray(record.config)) return false;
    const definition = record.config as Partial<ActionConfig>;
    return canManageDefinition(String(record.word ?? ''), definition.builtin,
      user?.permission.permission_scope === '*',
      !!user?.permission.entries.some((entry) => entry.menu_path === '/system/developer' &&
        entry.btns.includes('admin:btn:system:developer:publish')),
      definition.permission_scope);
  };
  const canDeleteRecord = (record: SystemRecord, control: 'delete' | 'delete-selected' = 'delete', user: UserInfo | null = auth.user) =>
    hasManagementControl(user, resource, control) && canManageRecord(record, user) &&
    canDeleteAssignedRecord(resource, record, user?.permission.permission_scope === '*' ||
      !!user?.permission.permission_scopes?.includes(`${resource}:delete`));
  const [reviewUser, setReviewUser] = React.useState<SystemRecord>();
  const [reviewDecision, setReviewDecision] = React.useState<'approve' | 'reject'>('approve');
  const [reviewReason, setReviewReason] = React.useState('');
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [lockUser, setLockUser] = React.useState<SystemRecord>();
  const [minimumLockTime] = React.useState(() => formatDateTimeInput(Date.now(), timezone));
  const [lockMode, setLockMode] = React.useState<'until' | 'permanent'>('until');
  const [lockUntil, setLockUntil] = React.useState('');
  const [lockSaving, setLockSaving] = React.useState(false);
  const [density, setDensity] = React.useState<Density>('default');
  const [visibleColumns, setVisibleColumns] = React.useState(
    () => new Set(resource === 'user' ? ['username', 'role', 'status', 'login_count', 'last_logged_in_at', 'metadata'] : config.columns.map((column) => column.key))
  );
  const [showSelection, setShowSelection] = React.useState(true);
  const [bordered, setBordered] = React.useState(true);
  const [striped, setStriped] = React.useState(false);
  const [sticky, setSticky] = React.useState(true);
  const [fullscreen, setFullscreen] = React.useState(false);
  const tableContainer = React.useRef<HTMLDivElement>(null);
  const canOpenPage = hasManagementPage(auth.user, resource);
  const can = React.useCallback((operation: string) => operation === 'read'
    ? hasManagementPage(auth.user, resource)
    : hasManagementControl(auth.user, resource, operation === 'update' ? 'edit' : operation),
  [auth.user, resource]);
  function canNow(operation: string) {
    return operation === 'read' ? hasManagementPage(latestUser.current, resource)
      : hasManagementControl(latestUser.current, resource, operation === 'update' ? 'edit' : operation);
  }
  function openDetail(record: AdminRecord) {
    if (!loading && canNow('view-detail')) setDetailRecord(record);
  }
  function refreshRecords() {
    if (!canNow('refresh')) return;
    setSummaryRevision((value) => value + 1);
    void load();
  }
  const visibleFilterFields = searchExpanded ? config.filters : config.filters.slice(0, 3);
  const shownColumns = config.columns.filter(
    (column) =>
      visibleColumns.has(column.key) &&
      (view !== 'matrix' || ['name', 'resource', 'menu', 'button'].includes(column.key))
  );
  const listFields = systemListFields(resource, view, [...visibleColumns],
    can('delete') || can('delete-selected'),
    !!hasAllPermissions || !!auth.user?.permission.permission_scopes?.includes(`${resource}:delete`));
  const listGeneration = React.useRef(0);
  const cellPadding = density === 'compact' ? 'p-1.5' : density === 'loose' ? 'p-4' : 'p-3';

  React.useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- browser-only persisted filter history
    setFilterHistory(loadHistory());
    const applyRouteFilters = () => {
      const query = new URLSearchParams(window.location.search);
      const next = Object.fromEntries(
        [
          ...config.filters,
          ...[
            'created_from',
            'created_to',
            'last_logged_in_from',
            'last_logged_in_to',
            'has_permissions',
            'has_members',
            'group_exact',
            'groups_all',
            'groups_exact'
          ].map((key) => ({ key }))
        ]
          .map((field) => [field.key, query.get(field.key) ?? ''])
          .filter(([, value]) => value !== '')
      );
      if (Object.keys(next).length > 0) {
        filterDraftRef.current = next;
        setFilterDraft(next);
        setActiveFilters(next);
        setPage(1);
      }
    };
    applyRouteFilters();
    window.addEventListener('popstate', applyRouteFilters);
    return () => window.removeEventListener('popstate', applyRouteFilters);
  }, [config.filters]);

  const load = React.useCallback(async () => {
    const run = ++listGeneration.current;
    if (!canOpenPage || !can('read')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const result = await listRecords(resource, {
        p: page,
        s: size,
        f: listFields,
        ...activeFilters
      });
      if (run !== listGeneration.current) return;
      setRecords(result.items.map((record) => resource === 'user-group'
        ? { ...record, users: record.member_preview ?? [] }
        : resource === 'user' ? { ...record, role: record.role_summary ?? record.role } : record));
      setTotal(result.t);
      setSelected([]);
    } catch (error) {
      if (run !== listGeneration.current) return;
      setLoadError(true);
      setRecords([]);
      setTotal(0);
      if (!isBadGatewayError(error))
        toast.error(error instanceof Error ? error.message : pick('Failed to load', '加载失败'));
    } finally {
      if (run === listGeneration.current) setLoading(false);
    }
  }, [activeFilters, can, canOpenPage, page, pick, resource, size, listFields]);

  React.useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize remote records with query state
    void load();
  }, [load]);

  function cancelFilterSearch() {
    if (filterSearchTimer.current) clearTimeout(filterSearchTimer.current);
    filterSearchTimer.current = null;
  }

  function updateFilterDraft(key: string, value: string) {
    const next = { ...filterDraftRef.current, [key]: value };
    filterDraftRef.current = next;
    filtersDirtyRef.current = true;
    setFilterDraft(next);
  }

  function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canNow('query')) return;
    cancelFilterSearch();
    filtersDirtyRef.current = false;
    const normalized = Object.fromEntries(
      Object.entries(filterDraftRef.current).filter(([, value]) => value !== '')
    );
    const nextHistory = { ...filterHistory };
    for (const [key, value] of Object.entries(normalized)) {
      const historyKey = `${resource}:${key}`;
      nextHistory[historyKey] = [
        value,
        ...(nextHistory[historyKey] ?? []).filter((item) => item !== value)
      ].slice(0, 10);
    }
    setFilterHistory(nextHistory);
    localStorage.setItem('shadcn-system-filter-history', JSON.stringify(nextHistory));
    setPage(1);
    setActiveFilters(normalized);
  }

  function scheduleFilterSearch() {
    cancelFilterSearch();
    if (!canNow('query')) return;
    filterSearchTimer.current = setTimeout(() => {
      filterSearchTimer.current = null;
      if (filtersDirtyRef.current && canNow('query')) runSearch();
    }, 500);
  }

  React.useEffect(
    () => () => {
      if (filterSearchTimer.current) clearTimeout(filterSearchTimer.current);
    },
    []
  );

  function resetSearch() {
    if (!canNow('reset-query')) return;
    cancelFilterSearch();
    filtersDirtyRef.current = false;
    filterDraftRef.current = {};
    setFilterDraft({});
    setActiveFilters({});
    setPage(1);
  }

  const editorGeneration = React.useRef(0);
  async function openEditor(record?: SystemRecord) {
    const run = ++editorGeneration.current;
    if (!canNow(record ? 'update' : 'create')) return;
    if (record) {
      try {
        const full = await getAdminRecord(resource, record.id, 'edit');
        if (run !== editorGeneration.current || !canNow('update') || !canManageRecord(full as SystemRecord, latestUser.current)) return;
        record = full as SystemRecord;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : pick('Unable to load record', '无法加载记录')
        );
        return;
      }
    }
    if (record && !canManageRecord(record, latestUser.current)) return;
    setBindings(undefined);
    setPermissionProblem('');
    setDetailRecord(undefined);
    setMemberAdded([]);
    setMemberRemoved([]);
    const next = initialValues(resource, record);
    setEditing(record);
    setValues(next);
    setInitialEditorValues(next);
    setFieldErrors({});
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !canNow(editing ? 'update' : 'create') ||
      (editing && !canManageRecord(editing, latestUser.current))
    )
      return;
    const errors: Record<string, string> = {};
    for (const field of resource === 'action' ? [] : editorFields) {
      const required = Boolean(field.required || (!editing && field.key === 'password'));
      const value = values[field.key];
      if (
        required &&
        (value == null ||
          String(value).trim() === '' ||
          (Array.isArray(value) && value.length === 0))
      ) {
        errors[field.key] = pick(
          `${localize(field.label, locale)} is required`,
          `请输入${localize(field.label, locale)}`
        );
      }
      if (field.type === 'json' && typeof value === 'string' && value.trim()) {
        try {
          JSON.parse(value);
        } catch {
          errors[field.key] = pick('Enter valid JSON', '请输入有效的 JSON');
        }
      }
    }
    if (
      resource === 'user' &&
      (!editing || hasAllPermissions) &&
      !isValidUsername(String(values.username ?? ''))
    ) {
      errors.username = pick('Username is required', '请输入用户名');
    }
    const password = values.password;
    if (
      resource === 'user' &&
      typeof password === 'string' &&
      password &&
      !isValidPassword(password)
    ) {
      errors.password = pick('Password is required', '请输入密码');
    }
    if (resource === 'dictionary' && !dictionaryKeyPattern.test(String(values.key ?? ''))) {
      errors.key = pick(
        'Use uppercase letters, digits, and underscore-separated segments',
        '请使用大写字母、数字，并以下划线分隔各段'
      );
    }
    if (resource === 'action' && (!values.group || permissionProblem))
      errors.word = permissionProblem || pick('Select a group', '请选择分组');
    if (canAssign && permissionProblem)
      errors.action_codes = pick('Permission catalog is not ready', '权限目录尚未就绪');
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      requestAnimationFrame(() => document.getElementById(Object.keys(errors)[0])?.focus());
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const fullPayload =
        resource === 'action'
          ? { word: values.word, group: values.group, names: values.names, config: values.config }
          : formPayload(editorFields, values, Boolean(editing));
      const initialPayload = editing
        ? resource === 'action'
          ? {
              word: initialEditorValues.word,
              group: initialEditorValues.group,
              names: initialEditorValues.names,
              config: initialEditorValues.config
            }
          : formPayload(editorFields, initialEditorValues, true)
        : {};
      let payload = editing ? changedPayload(fullPayload, initialPayload) : fullPayload;
      if (bindings !== undefined && canAssign) {
        delete payload.action_codes;
        payload.action_bindings = bindings;
      }
      if (resource === 'user-group' && editing) {
        delete payload.user_ids;
        Object.assign(payload, authorizedGroupMemberDelta(latestUser.current, memberAdded, memberRemoved));
      }
      payload = authorizedEditorPayload(
        resource,
        payload,
        !!canAssign,
        !!hasAllPermissions,
        !!editing
      );
      if (editing && Object.keys(payload).length === 0) {
        toast.info(pick('No changes to save', '没有需要保存的修改'));
        return;
      }
      if (editing) await updateRecord(resource, editing.id, payload);
      else await createRecord(resource, payload);
      toast.success(
        editing
          ? pick('Updated successfully', '修改成功')
          : pick('Created successfully', '创建成功')
      );
      setOpen(false);
      setSummaryRevision((value) => value + 1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Save failed', '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(ids: number[], control: 'delete' | 'delete-selected' = 'delete') {
    if (
      loading || !ids.length || !canNow(control) ||
      ids.some((id) => !records.some((record) => record.id === id && canDeleteRecord(record, control, latestUser.current)))
    )
      return;
    if (
      !confirm(
        pick(`Delete ${ids.length} selected record(s)?`, `确认删除选中的 ${ids.length} 条记录？`)
      )
    )
      return;
    if (!canNow(control) || ids.some((id) => !records.some((record) => record.id === id && canDeleteRecord(record, control, latestUser.current)))) return;
    try {
      await deleteRecords(resource, ids);
      toast.success(pick('Deleted successfully', '删除成功'));
      setSummaryRevision((value) => value + 1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Delete failed', '删除失败'));
    }
  }

  async function updateUserAction(record: SystemRecord, action: 'unlock' | 'unlock-password') {
    if (resource !== 'user' || !canNow(action)) return;
    const metadata = { ...(record.metadata as Record<string, unknown>) };
    const payload: Record<string, unknown> = { metadata };
    if (action === 'unlock') {
      delete metadata.lock_expired_at;
      payload.status = 1;
    }
    if (action === 'unlock-password') delete metadata.password_change_failures;
    try {
      await updateRecord('user', record.id, payload);
      toast.success(pick('Updated successfully', '修改成功'));
      setSummaryRevision((value) => value + 1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Update failed', '修改失败'));
    }
  }

  function openReview(record: SystemRecord) {
    if (resource !== 'user' || !canNow('approve')) return;
    setReviewUser(record);
    setReviewDecision('approve');
    setReviewReason('');
  }

  async function submitReview() {
    if (resource !== 'user' || !reviewUser || reviewSaving || !canNow('approve')) return;
    if (reviewDecision === 'reject' && !reviewReason.trim()) {
      toast.error(pick('Please enter a rejection reason', '请输入驳回原因'));
      return;
    }
    const metadata = { ...(reviewUser.metadata as Record<string, unknown>) };
    if (reviewDecision === 'approve') delete metadata.reject_register_reason;
    else metadata.reject_register_reason = reviewReason.trim();
    setReviewSaving(true);
    try {
      await updateRecord('user', reviewUser.id, {
        metadata,
        status: reviewDecision === 'approve' ? 1 : 0
      });
      toast.success(
        reviewDecision === 'approve'
          ? pick('Registration approved', '注册审核已通过')
          : pick('Registration rejected', '注册申请已驳回')
      );
      setReviewUser(undefined);
      setSummaryRevision((value) => value + 1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Review failed', '审核失败'));
    } finally {
      setReviewSaving(false);
    }
  }

  function openLock(record: SystemRecord, now: number) {
    if (resource !== 'user' || !canNow('lock')) return;
    const next = new Date(now + 86_400_000);
    const local = formatDateTimeInput(next.getTime(), timezone);
    setLockUser(record);
    setLockMode('until');
    setLockUntil(local);
  }

  async function submitLock(now: number) {
    if (resource !== 'user' || !lockUser || lockSaving || !canNow('lock')) return;
    const expiration = lockMode === 'permanent' ? 0 : parseAdminDateTime(lockUntil, timezone);
    if (lockMode === 'until' && (!Number.isFinite(expiration) || expiration <= now)) {
      toast.error(pick('Please select a future lock expiration time', '请选择未来的锁定截止时间'));
      return;
    }
    const metadata = {
      ...(lockUser.metadata as Record<string, unknown>),
      lock_expired_at: expiration
    };
    setLockSaving(true);
    try {
      await updateRecord('user', lockUser.id, { metadata, status: 2 });
      toast.success(pick('User locked successfully', '用户锁定成功'));
      setLockUser(undefined);
      setSummaryRevision((value) => value + 1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Lock failed', '锁定失败'));
    } finally {
      setLockSaving(false);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await tableContainer.current?.requestFullscreen();
    } catch {
      toast.error(pick('Fullscreen is not available', '无法进入全屏'));
    }
  }

  React.useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <PageContainer
      access={canOpenPage}
      accessFallback={
        <div className='flex flex-col items-center gap-4 text-center'>
          <div className='text-7xl font-bold text-muted-foreground/30'>404</div>
          <h1 className='text-2xl font-semibold'>{pick('Oops! Page Not Found', '页面不存在')}</h1>
          <p className='text-muted-foreground'>
            {pick('You do not have access to this page.', '你没有访问此页面的权限。')}
          </p>
          <Button
            nativeButton={false}
            render={
              <Link href='/dashboard/overview' aria-label={pick('Back To Home', '返回首页')} />
            }
          >
            {pick('Back To Home', '返回首页')}
          </Button>
        </div>
      }
      pageTitle={localize(config.title, locale)}
    >
      <div
        ref={tableContainer}
        className={cn(
          'min-w-0 max-w-full space-y-4 bg-background',
          fullscreen ? 'h-screen overflow-auto p-5' : ''
        )}
      >
        <ManagementOverview
          resource={resource}
          allowed={canOpenPage && can('read')}
          refreshKey={summaryRevision}
          filters={activeFilters}
          canRefresh={can('refresh')}
          onFilter={can('query') ? applyInsight : undefined}
          onGroup={can('view-detail') ? (id) => openDetail({ id }) : undefined}
        />
        <ActiveFilters filters={activeFilters} onChange={can('query') ? applyInsight : undefined} />
        <form
          className='gap-4 rounded-lg border bg-card p-3 2xl:flex 2xl:items-start 2xl:justify-between'
          onSubmit={runSearch}
          onFocusCapture={cancelFilterSearch}
          onBlurCapture={scheduleFilterSearch}
        >
          <div className='grid min-w-0 flex-1 grid-cols-1 items-start gap-2 md:grid-cols-2 lg:grid-cols-3'>
            {visibleFilterFields.map((field) => (
              <div className='min-h-[60px] min-w-0 space-y-1' key={field.key}>
                <Label htmlFor={`filter-${field.key}`} className='text-xs'>
                  {localize(field.label, locale)}
                </Label>
                {field.type === 'multi-status' ? (
                  <MultiStatusFilter
                    value={filterDraft[field.key] ?? ''}
                    onChange={(value) => updateFilterDraft(field.key, value)}
                  />
                ) : field.type === 'status' ||
                  field.type === 'category' ||
                  field.type === 'boolean' ? (
                  <StyledSelect
                    id={`filter-${field.key}`}
                    value={filterDraft[field.key] ?? ''}
                    onChange={(value) => updateFilterDraft(field.key, value)}
                    options={[
                      { value: '', label: pick('All', '全部') },
                      ...(field.type === 'status'
                        ? [
                            { value: '0', label: pick('Pending', '待审核') },
                            { value: '1', label: pick('Active', '正常') },
                            { value: '2', label: pick('Locked', '已锁定') }
                          ]
                        : []),
                      ...(field.type === 'category'
                        ? [
                            { value: '0', label: pick('Permission', '权限') },
                            { value: '1', label: 'JWT' }
                          ]
                        : []),
                      ...(field.type === 'boolean'
                        ? [
                            { value: 'true', label: pick('Enabled', '已启用') },
                            {
                              value: 'false',
                              label: pick('Disabled', '已停用')
                            }
                          ]
                        : [])
                    ]}
                  />
                ) : (
                  <FilterTextInput
                    resource={resource}
                    canQuery={can('query')}
                    field={{ ...field, label: localize(field.label, locale) }}
                    value={filterDraft[field.key] ?? ''}
                    history={filterHistory[`${resource}:${field.key}`] ?? []}
                    onChange={(value) => updateFilterDraft(field.key, value)}
                    onRemoveHistory={(item) => {
                      const historyKey = `${resource}:${field.key}`;
                      const next = {
                        ...filterHistory,
                        [historyKey]: (filterHistory[historyKey] ?? []).filter(
                          (value) => value !== item
                        )
                      };
                      setFilterHistory(next);
                      localStorage.setItem('shadcn-system-filter-history', JSON.stringify(next));
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className='mt-3 flex shrink-0 items-center justify-end gap-2 2xl:mt-0 2xl:pt-5'>
            {can('reset-query') && (
              <Button type='button' variant='outline' onClick={resetSearch}>
                {pick('Reset', '重置')}
              </Button>
            )}
            {can('query') && (
              <Button type='submit' variant='secondary'>
                <IconSearch />
                {pick('Search', '查询')}
              </Button>
            )}
            {config.filters.length > 3 && (
              <Button
                type='button'
                variant='ghost'
                onClick={() => setSearchExpanded((value) => !value)}
              >
                {searchExpanded ? pick('Less', '收起') : pick('More', '展开')}
                {searchExpanded ? <IconChevronUp /> : <IconChevronDown />}
              </Button>
            )}
          </div>
        </form>

        {resource === 'action' && (
          <PermissionGroupNav
            selected={activeFilters.group_exact ?? ''}
            selectable={can('query')}
            onSelect={(group) => applyInsight({ group_exact: group || undefined })}
            revision={summaryRevision}
          />
        )}
        <div className='min-w-0 max-w-full space-y-3 bg-background'>
          <div className='flex flex-wrap items-center gap-2'>
            <div role='group' aria-label={text('system-insights.cards')} className='flex gap-1'>
              {(resource === 'action'
                ? (['matrix', 'table'] as const)
                : (['cards', 'table'] as const)
              ).map((mode) => (
                <Button
                  key={mode}
                  size='sm'
                  variant={view === mode ? 'default' : 'outline'}
                  onClick={() => setView(mode)}
                >
                  {text(`system-insights.${mode}`)}
                </Button>
              ))}
            </div>
            {can('create') && (
              <Button onClick={() => openEditor()}>
                <IconPlus />
                {pick('Create', '新建')}
              </Button>
            )}
            {selected.length > 0 && can('delete-selected') && (
              <Button variant='destructive' onClick={() => void remove(selected, 'delete-selected')}>
                <IconTrash />
                {pick('Delete selected', '批量删除')} ({selected.length})
              </Button>
            )}
            <span className='ml-auto text-sm text-muted-foreground'>
              {pick(`${total} records`, `共 ${total} 条记录`)}
            </span>
            <ResultToolbar
              loading={loading}
              canRefresh={can('refresh')}
              refresh={refreshRecords}
              density={density}
              setDensity={setDensity}
              fullscreen={fullscreen}
              toggleFullscreen={() => void toggleFullscreen()}
              bordered={bordered}
              setBordered={setBordered}
              striped={striped}
              setStriped={setStriped}
              sticky={sticky}
              setSticky={setSticky}
            >
              <div className='flex items-center gap-2 border-b pb-2'>
                <Checkbox
                  aria-label={pick('Select all columns', '全选列')}
                  checked={showSelection && visibleColumns.size === config.columns.length}
                  indeterminate={
                    (showSelection || visibleColumns.size > 0) &&
                    !(showSelection && visibleColumns.size === config.columns.length)
                  }
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setShowSelection(enabled);
                    setVisibleColumns(
                      enabled ? new Set(config.columns.map((column) => column.key)) : new Set()
                    );
                    if (!enabled) setSelected([]);
                  }}
                />
                {pick('Select all', '全选')}
              </div>
              <div className='flex items-center gap-2'>
                <Checkbox
                  aria-label={pick('Selection column', '选择列')}
                  checked={showSelection}
                  onCheckedChange={(checked) => {
                    setShowSelection(checked === true);
                    if (!checked) setSelected([]);
                  }}
                />
                {pick('Selection', '选择列')}
              </div>
              {config.columns.map((column) => (
                <div className='flex items-center gap-2' key={column.key}>
                  <Checkbox
                    aria-label={localize(column.label, locale)}
                    checked={visibleColumns.has(column.key)}
                    onCheckedChange={() =>
                      setVisibleColumns((old) => {
                        const next = new Set(old);
                        if (next.has(column.key)) next.delete(column.key);
                        else next.add(column.key);
                        return next;
                      })
                    }
                  />
                  {localize(column.label, locale)}
                </div>
              ))}
            </ResultToolbar>
          </div>

          {loadError && (
            <div
              role='alert'
              className='mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 p-3'
            >
              <span>{text('system-insights.loadError')}</span>
              {can('refresh') && <Button variant='outline' onClick={refreshRecords}>
                {text('system-insights.retry')}
              </Button>}
            </div>
          )}
          {view === 'cards' ? (
            <ResourceCards
              resource={resource}
              records={records}
              loading={loading}
              selected={selected}
              onSelect={(id) => {
                const record = records.find((record) => record.id === id);
                if (record && canDeleteRecord(record, 'delete-selected', latestUser.current))
                  setSelected((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);
              }}
              canSelect={(record) => canDeleteRecord(record as SystemRecord, 'delete-selected')}
              onDetail={can('view-detail') ? openDetail : undefined}
              canEdit={(record) => resource !== 'action' || canManageRecord(record as SystemRecord)}
              canDelete={(record) => canDeleteRecord(record as SystemRecord)}
              onEdit={can('update') ? (record) => openEditor(record as SystemRecord) : undefined}
              onDelete={can('delete') ? (id) => void remove([id]) : undefined}
              renderValue={(key, value, record) =>
                displayValue(key, value, record as SystemRecord, locale, timezone)
              }
            />
          ) : (
            <div
              data-testid='management-table'
              className={cn(
                'w-full max-w-full overflow-auto rounded-lg bg-card',
                bordered ? 'border' : ''
              )}
            >
              <table className='w-full min-w-max text-sm'>
                <thead className={cn(sticky ? 'sticky top-0 z-10' : '', 'bg-muted/90')}>
                  <tr>
                    {showSelection && (
                      <th className={cn(cellPadding, 'text-left')}>
                        <Checkbox
                          aria-label={pick('Select all', '全选')}
                          checked={records.some((record) => canDeleteRecord(record, 'delete-selected')) && records.filter((record) => canDeleteRecord(record, 'delete-selected')).every((record) => selected.includes(record.id))}
                          disabled={!records.some((record) => canDeleteRecord(record, 'delete-selected'))}
                          onCheckedChange={(checked) =>
                            setSelected(checked ? records.filter((record) => canDeleteRecord(record, 'delete-selected', latestUser.current)).map((record) => record.id) : [])
                          }
                        />
                      </th>
                    )}
                    {shownColumns.map((column) => (
                      <th key={column.key} className={cn(cellPadding, 'text-left font-medium')}>
                        {resource === 'action' && view === 'matrix' && ['menu', 'resource', 'button'].includes(column.key)
                          ? text(({ menu: 'permission-display.relatedMenus', resource: 'action-editor.operation', button: 'action-editor.features' } as Record<string, string>)[column.key])
                          : localize(column.label, locale)}
                      </th>
                    ))}
                    <th className={cn('sticky right-0 bg-muted/95', cellPadding, 'text-right')}>
                      {pick('Actions', '操作')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        className='p-8 text-center text-muted-foreground'
                        colSpan={shownColumns.length + 2}
                      >
                        {pick('Loading…', '加载中…')}
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td
                        className='p-8 text-center text-muted-foreground'
                        colSpan={shownColumns.length + 2}
                      >
                        {pick('No data', '暂无数据')}
                      </td>
                    </tr>
                  ) : (
                    records.map((record, rowIndex) => (
                      <tr
                        key={record.id}
                        className={cn(
                          bordered ? 'border-t' : '',
                          striped && rowIndex % 2 === 1 ? 'bg-muted/35' : '',
                          'hover:bg-muted/30'
                        )}
                      >
                        {showSelection && (
                          <td className={cellPadding}>
                            <Checkbox
                              aria-label={`Select ${record.id}`}
                              checked={selected.includes(record.id)}
                              disabled={!canDeleteRecord(record, 'delete-selected')}
                              onCheckedChange={(checked) => {
                                if (!canDeleteRecord(record, 'delete-selected', latestUser.current)) return;
                                setSelected((old) =>
                                  checked
                                    ? [...new Set([...old, record.id])]
                                    : old.filter((id) => id !== record.id)
                                );
                              }}
                            />
                          </td>
                        )}
                        {shownColumns.map((column) => (
                          <td
                            key={column.key}
                            className={cn('max-w-80', cellPadding, 'align-top')}
                            title={
                              typeof record[column.key] === 'string'
                                ? (record[column.key] as string)
                                : undefined
                            }
                          >
                            {resource === 'action' && view === 'matrix' && ['resource', 'menu', 'button'].includes(column.key) ? (
                              <PermissionResultCell config={record.config as ActionConfig | undefined} field={column.key} matrix={view === 'matrix'} onDetail={can('view-detail') ? () => openDetail(record) : undefined} />
                            ) : view === 'matrix' && column.key === 'name' ? (
                              <>
                                <strong>{String(record.name)}</strong>
                                <div className='text-xs text-muted-foreground'>
                                  {String(record.word)}
                                </div>
                              </>
                            ) : (
                              displayValue(column.key, record[column.key], record, locale, timezone)
                            )}
                          </td>
                        ))}
                        <td
                          className={cn(
                            'sticky right-0 z-1 min-w-24 space-x-1 bg-card',
                            cellPadding,
                            'text-right shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.45)]'
                          )}
                        >
                          {can('view-detail') && <Button size='sm' variant='ghost' onClick={() => openDetail(record)}>
                            {text('system-insights.details')}
                          </Button>}
                          {resource === 'user' && can('approve') && Number(record.status) === 0 && (
                            <Button
                              title={pick('Review registration', '注册审核')}
                              size='sm'
                              variant='ghost'
                              onClick={() => openReview(record)}
                            >
                              <IconUserCheck />
                              {pick('Review', '审核')}
                            </Button>
                          )}
                          {resource === 'user' && can('lock') && Number(record.status) === 1 && (
                            <Button
                              title={pick('Lock', '锁定')}
                              size='icon-sm'
                              variant='ghost'
                              onClick={() => openLock(record, Date.now())}
                            >
                              <IconLock />
                            </Button>
                          )}
                          {resource === 'user' && can('unlock') && Number(record.status) === 2 && (
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={() => void updateUserAction(record, 'unlock')}
                            >
                              {pick('Unlock', '解锁')}
                            </Button>
                          )}
                          {resource === 'user' &&
                            can('unlock-password') &&
                            Number(
                              (record.metadata as Record<string, unknown>)?.password_change_failures
                            ) > 0 && (
                              <Button
                                size='sm'
                                variant='ghost'
                                onClick={() => void updateUserAction(record, 'unlock-password')}
                              >
                                {pick('Password unlock', '解锁改密')}
                              </Button>
                            )}
                          {can('update') && (resource !== 'action' || canManageRecord(record)) && (
                            <Button
                              aria-label={pick('Edit', '编辑')}
                              title={pick('Edit', '编辑')}
                              size='icon-sm'
                              variant='ghost'
                              onClick={() => openEditor(record)}
                            >
                              <IconEdit />
                            </Button>
                          )}
                          {can('delete') && canDeleteRecord(record) && (
                            <Button
                              aria-label={pick('Delete', '删除')}
                              title={pick('Delete', '删除')}
                              size='icon-sm'
                              variant='ghost'
                              className='text-destructive'
                              onClick={() => void remove([record.id])}
                            >
                              <IconTrash />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className='flex items-center justify-end gap-2'>
            <StyledSelect
              value={String(size)}
              onChange={(value) => {
                setSize(Number(value));
                setPage(1);
              }}
              ariaLabel={pick('Page size', '每页数量')}
              className='w-24'
              options={[10, 20, 50].map((item) => ({
                value: String(item),
                label: `${item} / ${pick('page', '页')}`
              }))}
            />
            <Button
              size='sm'
              variant='outline'
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {pick('Previous', '上一页')}
            </Button>
            <span className='text-sm'>
              {page} / {Math.max(1, Math.ceil(total / size))}
            </span>
            <Button
              size='sm'
              variant='outline'
              disabled={page * size >= total}
              onClick={() => setPage((value) => value + 1)}
            >
              {pick('Next', '下一页')}
            </Button>
          </div>
        </div>
      </div>

      <RecordDetail
        resource={resource}
        record={can('view-detail') ? detailRecord : undefined}
        onClose={() => setDetailRecord(undefined)}
        onEdit={can('update') ? (record) => openEditor(record as SystemRecord) : undefined}
        renderValue={(key, value, record) =>
          displayValue(key, value, record as SystemRecord, locale, timezone)
        }
      />
      <AdminDrawer
        wide={['action', 'role', 'user', 'user-group'].includes(resource)}
        open={open}
        title={`${editing ? pick('Edit', '编辑') : pick('Create', '新增')} — ${localize(config.title, locale)}`}
        onClose={closeEditor}
        footer={
          <DialogFooter>
            <Button type='button' variant='outline' onClick={closeEditor}>
              {pick('Cancel', '取消')}
            </Button>
            {can(editing ? 'update' : 'create') && <Button type='submit' form='management-editor-form' disabled={saving}>
              {saving ? pick('Saving…', '保存中…') : pick('Save', '保存')}
            </Button>}
          </DialogFooter>
        }
      >
        <form id='management-editor-form' className='space-y-4' noValidate onSubmit={submit}>
          {resource === 'action' ? (
            <ActionEditor
              values={values}
              recordId={editing?.id}
              onChange={(changes) => setValues((old) => ({ ...old, ...changes }))}
              onValidity={setPermissionProblem}
            />
          ) : (
            editorFields.map((field) =>
              field.type === 'action-select' ? (
                <PermissionAssignment
                  key={field.key}
                  codes={Array.isArray(values.action_codes) ? values.action_codes.map(String) : []}
                  onChange={setBindings}
                  onValidity={setPermissionProblem}
                />
              ) : field.key === 'user_ids' && editing && resource === 'user-group' ? (
                <GroupMemberEditor
                  key={field.key}
                  record={editing}
                  disabled={saving}
                  added={memberAdded}
                  removed={memberRemoved}
                  onChange={(added, removed) => {
                    const members = groupMemberAccess(latestUser.current);
                    if (members.add) setMemberAdded(added);
                    if (members.remove) setMemberRemoved(removed);
                  }}
                />
              ) : (
                <FieldEditor
                  key={field.key}
                  field={{ ...field, label: localize(field.label, locale) }}
                  value={values[field.key]}
                  seed={editing}
                  associationAllowed={resource === 'user-group' && field.type === 'user-select' ? !!canAssign && can(editing ? 'update' : 'create') : undefined}
                  required={Boolean(field.required || (!editing && field.key === 'password'))}
                  error={fieldErrors[field.key]}
                  onChange={(value) => {
                    setValues((old) => ({ ...old, [field.key]: value }));
                    setFieldErrors((old) => {
                      const next = { ...old };
                      delete next[field.key];
                      return next;
                    });
                  }}
                />
              )
            )
          )}
          {fieldErrors.word && (
            <p role='alert' className='text-destructive'>
              {fieldErrors.word}
            </p>
          )}
          {fieldErrors.action_codes && (
            <p role='alert' className='text-destructive'>
              {fieldErrors.action_codes}
            </p>
          )}
        </form>
      </AdminDrawer>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text('system-editor.discardTitle')}</DialogTitle>
            <DialogDescription>{text('system-editor.unsaved')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDiscardOpen(false)}>{text('system-editor.continue')}</Button>
            <Button
              variant='destructive'
              onClick={() => {
                setDiscardOpen(false);
                setOpen(false);
              }}
            >
              {text('system-editor.discard')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(reviewUser)}
        onOpenChange={(next) => {
          if (!next) setReviewUser(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pick('Review Registration', '注册审核')} — {String(reviewUser?.username ?? '')}
            </DialogTitle>
            <DialogDescription>
              {pick(
                'Approve the account or retain pending status with a rejection reason.',
                '通过账号，或填写原因后驳回并保持待审核状态。'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-2'>
              <Button
                type='button'
                variant={reviewDecision === 'approve' ? 'default' : 'outline'}
                onClick={() => setReviewDecision('approve')}
              >
                {pick('Approve', '通过')}
              </Button>
              <Button
                type='button'
                variant={reviewDecision === 'reject' ? 'destructive' : 'outline'}
                onClick={() => setReviewDecision('reject')}
              >
                {pick('Reject', '拒绝')}
              </Button>
            </div>
            {reviewDecision === 'reject' && (
              <div className='space-y-2'>
                <Label htmlFor='review-reason'>{pick('Reason', '原因')}</Label>
                <Textarea
                  id='review-reason'
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  placeholder={pick(
                    'Enter the registration rejection reason',
                    '请输入注册驳回原因'
                  )}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setReviewUser(undefined)}>
              {pick('Cancel', '取消')}
            </Button>
            <Button type='button' disabled={reviewSaving || !can('approve')} onClick={() => void submitReview()}>
              {reviewSaving ? pick('Saving…', '保存中…') : pick('Confirm', '确认')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(lockUser)}
        onOpenChange={(next) => {
          if (!next) setLockUser(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pick('Lock User', '锁定用户')} — {String(lockUser?.username ?? '')}
            </DialogTitle>
            <DialogDescription>
              {pick('Choose a timed or permanent lock.', '选择定时锁定或永久锁定。')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-2'>
              <Button
                type='button'
                variant={lockMode === 'until' ? 'default' : 'outline'}
                onClick={() => setLockMode('until')}
              >
                {pick('Until a specific time', '至指定时间')}
              </Button>
              <Button
                type='button'
                variant={lockMode === 'permanent' ? 'default' : 'outline'}
                onClick={() => setLockMode('permanent')}
              >
                {pick('Permanent', '永久')}
              </Button>
            </div>
            {lockMode === 'until' && (
              <div className='space-y-2'>
                <Label htmlFor='lock-until'>{pick('Locked Until', '锁定截止时间')}</Label>
                <Input
                  id='lock-until'
                  type='datetime-local'
                  value={lockUntil}
                  min={minimumLockTime}
                  onChange={(event) => setLockUntil(event.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setLockUser(undefined)}>
              {pick('Cancel', '取消')}
            </Button>
            <Button type='button' disabled={lockSaving || !can('lock')} onClick={() => void submitLock(Date.now())}>
              {lockSaving ? pick('Saving…', '保存中…') : pick('Lock', '锁定')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return text;
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className='bg-transparent font-semibold text-red-500'>
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

function FilterTextInput({
  canQuery,
  resource,
  field,
  value,
  history,
  onChange,
  onRemoveHistory
}: {
  canQuery: boolean;
  resource: ResourceKind;
  field: FieldConfig;
  value: string;
  history: string[];
  onChange: (value: string) => void;
  onRemoveHistory: (value: string) => void;
}) {
  const [backend, setBackend] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setBackend([]);
    if (!canQuery || !value.trim())
      return () => {
        active = false;
      };
    const timer = setTimeout(async () => {
      try {
        const suggestionResource: ResourceKind = field.key === 'action_code' ? 'action' : resource;
        const suggestionKey = field.key === 'action_code' ? 'code' : field.key;
        const result = await listRecords(suggestionResource, {
          p: 1,
          s: 10,
          f: suggestionKey,
          [suggestionKey]: value.trim()
        });
        if (!active) return;
        setBackend([
          ...new Set(
            result.items
              .map((item) => item[suggestionKey])
              .filter(
                (item): item is string | number =>
                  typeof item === 'string' || typeof item === 'number'
              )
              .map(String)
          )
        ]);
      } catch {
        if (active) setBackend([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [field.key, resource, value, canQuery]);
  const { pick } = useLocale();
  const backendOptions = [...new Set(backend)].slice(0, 6);
  const historyOptions = [...new Set(history)];
  const query = value.split(',').at(-1)?.trim() ?? '';
  const hasSuggestions = backendOptions.length > 0 || historyOptions.length > 0;
  return (
    <Popover open={canQuery && open && hasSuggestions} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <Input
            id={`filter-${field.key}`}
            value={value}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            autoComplete='off'
            placeholder={
              field.type === 'multi-text'
                ? pick(
                    'Enter one or more values, separated by commas',
                    '输入一个或多个值，使用逗号分隔'
                  )
                : pick(`Enter ${field.label}`, `请输入${field.label}`)
            }
          />
        }
      />
      <PopoverContent align='start' className='max-h-80 w-(--anchor-width) overflow-y-auto p-1'>
        {backendOptions.length > 0 && (
          <div>
            <div className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>
              {pick('Backend results', '查询结果')}
            </div>
            {backendOptions.map((item) => (
              <button
                type='button'
                key={`backend-${item}`}
                className='flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-accent'
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <span className='truncate'>
                  <HighlightMatch text={item} query={query} />
                </span>
              </button>
            ))}
          </div>
        )}
        {backendOptions.length > 0 && historyOptions.length > 0 && (
          <div className='my-1 border-t' />
        )}
        {historyOptions.length > 0 && (
          <div>
            <div className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>
              {pick('History', '历史记录')}
            </div>
            {historyOptions.map((item) => (
              <div key={`history-${item}`} className='flex items-center rounded-md hover:bg-accent'>
                <button
                  type='button'
                  className='min-w-0 flex-1 px-2 py-2 text-left text-sm'
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <span className='block truncate'>
                    <HighlightMatch text={item} query={query} />
                  </span>
                </button>
                <button
                  type='button'
                  tabIndex={-1}
                  aria-label={pick(`Remove ${item} from history`, `从历史记录中移除“${item}”`)}
                  className='mr-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
                  onClick={() => onRemoveHistory(item)}
                >
                  <IconX className='size-3.5' />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MultiStatusFilter({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { pick } = useLocale();
  const selected = value.split(',').filter(Boolean);
  const options = [
    { value: '0', label: pick('Pending', '待审核') },
    { value: '1', label: pick('Active', '正常') },
    { value: '2', label: pick('Locked', '已锁定') }
  ];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            className='w-full justify-between font-normal'
            aria-label={pick('Status', '状态')}
          />
        }
      >
        <span>
          {selected.length
            ? options
                .filter((item) => selected.includes(item.value))
                .map((item) => item.label)
                .join(', ')
            : pick('All', '全部')}
        </span>
        <IconChevronDown />
      </PopoverTrigger>
      <PopoverContent align='start'>
        {options.map((option) => (
          <div className='flex items-center gap-2' key={option.value}>
            <Checkbox
              aria-label={option.label}
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(
                  (checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value)
                  ).join(',')
                )
              }
            />
            {option.label}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function FieldEditor({
  field,
  value,
  required,
  error,
  onChange,
  seed,
  associationAllowed
}: {
  seed?: SystemRecord;
  associationAllowed?: boolean;
  field: FieldConfig;
  value: unknown;
  required: boolean;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const { pick } = useLocale();
  const label = (
    <Label htmlFor={field.key}>
      {field.label}
      {required && <span className='ml-1 text-destructive'>*</span>}
    </Label>
  );
  const errorMessage = error && (
    <p id={`${field.key}-error`} role='alert' className='text-xs text-destructive'>
      {error}
    </p>
  );
  if (field.type === 'boolean')
    return (
      <div className='space-y-1'>
        <div className='flex items-center justify-between gap-3 rounded-md border p-3'>
          {label}
          <Switch
            id={field.key}
            checked={value === true || value === 'true'}
            onCheckedChange={onChange}
          />
        </div>
        {errorMessage}
      </div>
    );
  if (field.type === 'status' || field.type === 'category')
    return (
      <div className='space-y-2'>
        {label}
        <StyledSelect
          id={field.key}
          value={String(value)}
          onChange={onChange}
          options={
            field.type === 'status'
              ? [
                  { value: '0', label: pick('Pending', '待审核') },
                  { value: '1', label: pick('Active', '正常') },
                  { value: '2', label: pick('Locked', '已锁定') }
                ]
              : [
                  { value: '0', label: pick('Permission', '权限') },
                  { value: '1', label: 'JWT' }
                ]
          }
        />
        {errorMessage}
      </div>
    );
  if (field.type === 'action-group')
    return (
      <div>
        <ActionGroupEditor
          field={field}
          value={String(value ?? '')}
          required={required}
          onChange={onChange}
        />
        {errorMessage}
      </div>
    );
  if (field.type === 'action-select' || field.type === 'user-select')
    return (
      <div className='space-y-2'>
        {label}
        <AssociationEditor
          resource={field.type === 'action-select' ? 'action' : 'user'}
          browseAllowed={associationAllowed}
          value={Array.isArray(value) ? (value as Array<string | number>) : []}
          seed={
            ((field.type === 'action-select' ? seed?.actions : seed?.users) as AdminRecord[]) ?? []
          }
          onChange={onChange}
        />
        {errorMessage}
      </div>
    );
  if (['resource', 'menu', 'button'].includes(field.key))
    return (
      <div className='space-y-2'>
        {label}
        <RuleListEditor label={field.label} value={String(value ?? '')} onChange={onChange} />
        {errorMessage}
      </div>
    );
  if (field.type === 'role-select')
    return (
      <div>
        <RelationPicker
          field={field}
          resource='role'
          initialOptions={
            seed?.role
              ? [
                  {
                    value: Number((seed.role as Record<string, unknown>).id),
                    label: `${String((seed.role as Record<string, unknown>).name)} · ${String((seed.role as Record<string, unknown>).word)}`
                  }
                ]
              : []
          }
          value={typeof value === 'number' ? value : Number(value || 0)}
          onChange={onChange}
        />
        {errorMessage}
      </div>
    );
  const multiline =
    field.type === 'textarea' ||
    field.type === 'json' ||
    field.type === 'csv' ||
    field.type === 'number-csv';
  return (
    <div className='space-y-2'>
      {label}
      {multiline ? (
        <Textarea
          id={field.key}
          rows={field.type === 'json' ? 8 : 3}
          className={
            field.type === 'json'
              ? 'h-56 min-h-40 max-h-72 resize-y overflow-auto whitespace-pre font-mono [field-sizing:fixed]'
              : undefined
          }
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${field.key}-error` : undefined}
          placeholder={field.placeholder}
        />
      ) : (
        <Input
          id={field.key}
          type={
            field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'
          }
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${field.key}-error` : undefined}
          placeholder={field.placeholder}
        />
      )}
      {errorMessage}
    </div>
  );
}

function ActionGroupEditor({
  field,
  value,
  required,
  onChange
}: {
  field: FieldConfig;
  value: string;
  required: boolean;
  onChange: (value: unknown) => void;
}) {
  const [options, setOptions] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      void listActionGroups(value)
        .then((result) => setOptions(result.items))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);
  const { pick } = useLocale();
  return (
    <div className='space-y-2'>
      <Label htmlFor={field.key}>
        {field.label}
        {required && <span className='ml-1 text-destructive'>*</span>}
      </Label>
      <Popover open={open && options.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger
          nativeButton={false}
          render={
            <Input
              id={field.key}
              value={value}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                onChange(event.target.value);
                setOpen(true);
              }}
              autoComplete='off'
              placeholder={pick('Search or create an action group', '搜索或创建权限分组')}
            />
          }
        />
        <PopoverContent align='start' className='w-(--anchor-width) p-1'>
          {options.map((option) => (
            <button
              type='button'
              key={option}
              className='w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent'
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <p className='text-xs text-muted-foreground'>
        {pick(
          'Select an existing action group or enter a new group name.',
          '选择已有权限分组，或输入新分组名称。'
        )}
      </p>
    </div>
  );
}
