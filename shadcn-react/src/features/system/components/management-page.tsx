'use client';

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale, type Locale } from '@/features/i18n/locale-context';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconColumns3,
  IconEdit,
  IconLock,
  IconMaximize,
  IconMinimize,
  IconPlus,
  IconRefresh,
  IconList,
  IconSearch,
  IconSettings2,
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

const menuPermission: Record<ResourceKind, string> = {
  action: '/system/action',
  role: '/system/role',
  user: '/system/user',
  'user-group': '/system/group',
  dictionary: '/system/dictionary',
  whitelist: '/system/whitelist'
};

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
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key])
    )
  );
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

const padDatePart = (number: number) => String(number).padStart(2, '0');

function formatPlainDateTime(value: number) {
  const date = new Date(value);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

function formatDateTimeInput(value: number) {
  return formatPlainDateTime(value).slice(0, 16).replace(' ', 'T');
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
  if (key.endsWith('_at') && typeof value === 'number') return formatPlainDateTime(value);
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
                ? formatPlainDateTime(lockExpiredAt)
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
              className={`max-w-full whitespace-normal ${semanticBadgeClass(resourceRuleColor(item, record.category))}`}
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
  const { locale, pick, timezone } = useLocale();
  const [records, setRecords] = React.useState<SystemRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(10);
  const [filterDraft, setFilterDraft] = React.useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = React.useState<Record<string, string>>({});
  const filterDraftRef = React.useRef<Record<string, string>>({});
  const filtersDirtyRef = React.useRef(false);
  const filterSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterHistory, setFilterHistory] = React.useState<Record<string, string[]>>({});
  const [searchExpanded, setSearchExpanded] = React.useState(false);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SystemRecord>();
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [initialEditorValues, setInitialEditorValues] = React.useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [reviewUser, setReviewUser] = React.useState<SystemRecord>();
  const [reviewDecision, setReviewDecision] = React.useState<'approve' | 'reject'>('approve');
  const [reviewReason, setReviewReason] = React.useState('');
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [lockUser, setLockUser] = React.useState<SystemRecord>();
  const [minimumLockTime] = React.useState(() => formatDateTimeInput(Date.now()));
  const [lockMode, setLockMode] = React.useState<'until' | 'permanent'>('until');
  const [lockUntil, setLockUntil] = React.useState('');
  const [lockSaving, setLockSaving] = React.useState(false);
  const [density, setDensity] = React.useState<Density>('default');
  const [visibleColumns, setVisibleColumns] = React.useState(
    () => new Set(config.columns.map((column) => column.key))
  );
  const [showSelection, setShowSelection] = React.useState(true);
  const [bordered, setBordered] = React.useState(true);
  const [striped, setStriped] = React.useState(false);
  const [sticky, setSticky] = React.useState(true);
  const [fullscreen, setFullscreen] = React.useState(false);
  const tableContainer = React.useRef<HTMLDivElement>(null);
  const permissions = React.useMemo(
    () => auth.user?.permission.btns ?? [],
    [auth.user?.permission.btns]
  );
  const canOpenPage = Boolean(
    auth.user?.permission.menus.includes('*') ||
    auth.user?.permission.menus.includes(menuPermission[resource])
  );
  const can = React.useCallback(
    (operation: string) =>
      permissions.includes('*') || permissions.includes(`${config.permission}.${operation}`),
    [config.permission, permissions]
  );
  const visibleFilterFields = searchExpanded ? config.filters : config.filters.slice(0, 3);
  const shownColumns = config.columns.filter((column) => visibleColumns.has(column.key));
  const cellPadding = density === 'compact' ? 'p-1.5' : density === 'loose' ? 'p-4' : 'p-3';

  React.useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- browser-only persisted filter history
    setFilterHistory(loadHistory());
    const applyRouteFilters = () => {
      const query = new URLSearchParams(window.location.search);
      const next = Object.fromEntries(
        config.filters
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
    if (!canOpenPage || !can('read')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await listRecords(resource, { p: page, s: size, ...activeFilters });
      setRecords(result.items);
      setTotal(result.t);
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Failed to load', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [activeFilters, can, canOpenPage, page, pick, resource, size]);

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
    filterSearchTimer.current = setTimeout(() => {
      filterSearchTimer.current = null;
      if (filtersDirtyRef.current && can('read')) runSearch();
    }, 500);
  }

  React.useEffect(
    () => () => {
      if (filterSearchTimer.current) clearTimeout(filterSearchTimer.current);
    },
    []
  );

  function resetSearch() {
    cancelFilterSearch();
    filtersDirtyRef.current = false;
    filterDraftRef.current = {};
    setFilterDraft({});
    setActiveFilters({});
    setPage(1);
  }

  function openEditor(record?: SystemRecord) {
    const next = initialValues(resource, record);
    setEditing(record);
    setValues(next);
    setInitialEditorValues(next);
    setFieldErrors({});
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    for (const field of config.fields) {
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
    if (resource === 'user' && !isValidUsername(String(values.username ?? ''))) {
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
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      requestAnimationFrame(() => document.getElementById(Object.keys(errors)[0])?.focus());
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const fullPayload = formPayload(config.fields, values, Boolean(editing));
      const initialPayload = editing ? formPayload(config.fields, initialEditorValues, true) : {};
      const payload = editing ? changedPayload(fullPayload, initialPayload) : fullPayload;
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
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Save failed', '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(ids: number[]) {
    if (
      !confirm(
        pick(`Delete ${ids.length} selected record(s)?`, `确认删除选中的 ${ids.length} 条记录？`)
      )
    )
      return;
    try {
      await deleteRecords(resource, ids);
      toast.success(pick('Deleted successfully', '删除成功'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Delete failed', '删除失败'));
    }
  }

  async function updateUserAction(record: SystemRecord, action: 'unlock' | 'unlock-password') {
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
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Update failed', '修改失败'));
    }
  }

  function openReview(record: SystemRecord) {
    setReviewUser(record);
    setReviewDecision('approve');
    setReviewReason('');
  }

  async function submitReview() {
    if (!reviewUser || reviewSaving) return;
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
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Review failed', '审核失败'));
    } finally {
      setReviewSaving(false);
    }
  }

  function openLock(record: SystemRecord) {
    const next = new Date(Date.now() + 86_400_000);
    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setLockUser(record);
    setLockMode('until');
    setLockUntil(local);
  }

  async function submitLock() {
    if (!lockUser || lockSaving) return;
    const expiration = lockMode === 'permanent' ? 0 : new Date(lockUntil).getTime();
    if (lockMode === 'until' && (!Number.isFinite(expiration) || expiration <= Date.now())) {
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
      pageDescription={pick('Connected to the Go Cinch auth service', '已连接 Go Cinch 认证后端')}
    >
      <div
        ref={tableContainer}
        className={`min-w-0 max-w-full space-y-4 bg-background ${fullscreen ? 'h-screen overflow-auto p-5' : ''}`}
      >
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
                            { value: 'false', label: pick('Disabled', '已停用') }
                          ]
                        : [])
                    ]}
                  />
                ) : (
                  <FilterTextInput
                    resource={resource}
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
            <Button type='button' variant='outline' onClick={resetSearch}>
              {pick('Reset', '重置')}
            </Button>
            <Button type='submit' variant='secondary'>
              <IconSearch />
              {pick('Search', '查询')}
            </Button>
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

        <div className='min-w-0 max-w-full space-y-3 bg-background'>
          <div className='flex flex-wrap items-center gap-2'>
            {can('create') && (
              <Button onClick={() => openEditor()}>
                <IconPlus />
                {pick('Create', '新建')}
              </Button>
            )}
            {selected.length > 0 && can('delete') && (
              <Button variant='destructive' onClick={() => void remove(selected)}>
                <IconTrash />
                {pick('Delete selected', '批量删除')} ({selected.length})
              </Button>
            )}
            <span className='ml-auto text-sm text-muted-foreground'>
              {pick(`${total} records`, `共 ${total} 条记录`)}
            </span>
            <Button
              aria-label={pick('Refresh', '刷新')}
              title={pick('Refresh', '刷新')}
              size='icon-sm'
              variant='outline'
              onClick={() => void load()}
              disabled={loading}
            >
              <IconRefresh className={loading ? 'animate-spin' : ''} />
            </Button>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    aria-label={pick('Density', '表格密度')}
                    title={pick('Density', '表格密度')}
                    size='icon-sm'
                    variant='outline'
                  />
                }
              >
                <IconList />
              </PopoverTrigger>
              <PopoverContent align='end' className='w-36'>
                {(['compact', 'default', 'loose'] as Density[]).map((item) => (
                  <Button
                    key={item}
                    variant={density === item ? 'secondary' : 'ghost'}
                    className='justify-start'
                    onClick={() => setDensity(item)}
                  >
                    {item === 'compact'
                      ? pick('Compact', '紧凑')
                      : item === 'loose'
                        ? pick('Loose', '宽松')
                        : pick('Default', '默认')}
                  </Button>
                ))}
              </PopoverContent>
            </Popover>
            <Button
              aria-label={pick('Fullscreen', '全屏')}
              title={pick('Fullscreen', '全屏')}
              size='icon-sm'
              variant='outline'
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <IconMinimize /> : <IconMaximize />}
            </Button>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    aria-label={pick('Visible columns', '显示列')}
                    title={pick('Visible columns', '显示列')}
                    size='icon-sm'
                    variant='outline'
                  />
                }
              >
                <IconColumns3 />
              </PopoverTrigger>
              <PopoverContent align='end' className='w-64'>
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
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    aria-label={pick('Table style', '表格样式')}
                    title={pick('Table style', '表格样式')}
                    size='icon-sm'
                    variant='outline'
                  />
                }
              >
                <IconSettings2 />
              </PopoverTrigger>
              <PopoverContent align='end' className='w-52'>
                <div className='flex items-center justify-between gap-3'>
                  {pick('Bordered', '边框')}
                  <Switch
                    aria-label={pick('Bordered', '边框')}
                    checked={bordered}
                    onCheckedChange={setBordered}
                  />
                </div>
                <div className='flex items-center justify-between gap-3'>
                  {pick('Striped', '斑马纹')}
                  <Switch
                    aria-label={pick('Striped', '斑马纹')}
                    checked={striped}
                    onCheckedChange={setStriped}
                  />
                </div>
                <div className='flex items-center justify-between gap-3'>
                  {pick('Sticky', '固定表头')}
                  <Switch
                    aria-label={pick('Sticky', '固定表头')}
                    checked={sticky}
                    onCheckedChange={setSticky}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div
            className={`w-full max-w-full overflow-auto rounded-lg bg-card ${bordered ? 'border' : ''}`}
          >
            <table className='w-full min-w-max text-sm'>
              <thead className={`${sticky ? 'sticky top-0 z-10' : ''} bg-muted/90`}>
                <tr>
                  {showSelection && (
                    <th className={`${cellPadding} text-left`}>
                      <Checkbox
                        aria-label={pick('Select all', '全选')}
                        checked={records.length > 0 && selected.length === records.length}
                        onCheckedChange={(checked) =>
                          setSelected(checked ? records.map((record) => record.id) : [])
                        }
                      />
                    </th>
                  )}
                  {shownColumns.map((column) => (
                    <th key={column.key} className={`${cellPadding} text-left font-medium`}>
                      {localize(column.label, locale)}
                    </th>
                  ))}
                  <th className={`sticky right-0 bg-muted/95 ${cellPadding} text-right`}>
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
                      className={`${bordered ? 'border-t' : ''} ${striped && rowIndex % 2 === 1 ? 'bg-muted/35' : ''} hover:bg-muted/30`}
                    >
                      {showSelection && (
                        <td className={cellPadding}>
                          <Checkbox
                            aria-label={`Select ${record.id}`}
                            checked={selected.includes(record.id)}
                            onCheckedChange={(checked) =>
                              setSelected((old) =>
                                checked
                                  ? [...new Set([...old, record.id])]
                                  : old.filter((id) => id !== record.id)
                              )
                            }
                          />
                        </td>
                      )}
                      {shownColumns.map((column) => (
                        <td
                          key={column.key}
                          className={`max-w-80 ${cellPadding} align-top`}
                          title={
                            typeof record[column.key] === 'string'
                              ? (record[column.key] as string)
                              : undefined
                          }
                        >
                          {displayValue(column.key, record[column.key], record, locale, timezone)}
                        </td>
                      ))}
                      <td
                        className={`sticky right-0 z-1 min-w-24 space-x-1 bg-card ${cellPadding} text-right shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.45)]`}
                      >
                        {resource === 'user' && can('update') && Number(record.status) === 0 && (
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
                        {resource === 'user' && can('update') && Number(record.status) === 1 && (
                          <Button
                            title={pick('Lock', '锁定')}
                            size='icon-sm'
                            variant='ghost'
                            onClick={() => openLock(record)}
                          >
                            <IconLock />
                          </Button>
                        )}
                        {resource === 'user' && can('update') && Number(record.status) === 2 && (
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => void updateUserAction(record, 'unlock')}
                          >
                            {pick('Unlock', '解锁')}
                          </Button>
                        )}
                        {resource === 'user' &&
                          can('update') &&
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
                        {can('update') && (
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
                        {can('delete') && (
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {editing ? pick('Edit', '编辑') : pick('Create', '新增')} —{' '}
              {localize(config.title, locale)}
            </DialogTitle>
            <DialogDescription>
              {pick(
                'Search related records by name or code. Passwords use one-time encrypted challenges.',
                '可按名称或编码检索关联项，密码使用一次性挑战加密。'
              )}
            </DialogDescription>
          </DialogHeader>
          <form className='space-y-4' noValidate onSubmit={submit}>
            {config.fields.map((field) => (
              <FieldEditor
                key={field.key}
                field={{ ...field, label: localize(field.label, locale) }}
                value={values[field.key]}
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
            ))}
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setOpen(false)}>
                {pick('Cancel', '取消')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? pick('Saving…', '保存中…') : pick('Save', '保存')}
              </Button>
            </DialogFooter>
          </form>
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
            <Button type='button' disabled={reviewSaving} onClick={() => void submitReview()}>
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
            <Button type='button' disabled={lockSaving} onClick={() => void submitLock()}>
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
  resource,
  field,
  value,
  history,
  onChange,
  onRemoveHistory
}: {
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
    if (!value.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const suggestionResource: ResourceKind = field.key === 'action_code' ? 'action' : resource;
        const suggestionKey = field.key === 'action_code' ? 'code' : field.key;
        const result = await listRecords(suggestionResource, {
          p: 1,
          s: 10,
          [suggestionKey]: value.trim()
        });
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
        setBackend([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [field.key, resource, value]);
  const { pick } = useLocale();
  const backendOptions = [...new Set(backend)].slice(0, 6);
  const historyOptions = [...new Set(history)];
  const query = value.split(',').at(-1)?.trim() ?? '';
  const hasSuggestions = backendOptions.length > 0 || historyOptions.length > 0;
  return (
    <Popover open={open && hasSuggestions} onOpenChange={setOpen}>
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

function StyledSelect({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className = 'w-full'
}: {
  id?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const normalizedValue = value === '' ? '__all__' : value;
  const selectedLabel =
    options.find((option) => (option.value || '__all__') === normalizedValue)?.label ?? value;
  return (
    <Select
      value={normalizedValue}
      onValueChange={(next) => onChange(next === '__all__' || next == null ? '' : next)}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={`h-9 ${className}`}>
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value || '__all__'} value={option.value || '__all__'}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
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
  onChange
}: {
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
  if (field.type === 'action-select')
    return (
      <div>
        <RelationPicker
          field={field}
          resource='action'
          multiple
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
        />
        {errorMessage}
      </div>
    );
  if (field.type === 'user-select')
    return (
      <div>
        <RelationPicker
          field={field}
          resource='user'
          multiple
          value={Array.isArray(value) ? value.map(Number) : []}
          onChange={onChange}
        />
        {errorMessage}
      </div>
    );
  if (field.type === 'role-select')
    return (
      <div>
        <RelationPicker
          field={field}
          resource='role'
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

interface RelationOption {
  label: string;
  value: string | number;
}

function RelationPicker({
  field,
  resource,
  multiple = false,
  value,
  onChange
}: {
  field: FieldConfig;
  resource: 'action' | 'role' | 'user';
  multiple?: boolean;
  value: Array<string | number> | string | number;
  onChange: (value: unknown) => void;
}) {
  const { pick } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<RelationOption[]>([]);
  const selected = multiple
    ? (value as Array<string | number>)
    : value
      ? [value as string | number]
      : [];
  const selectedKey = selected.map(String).join('\u0000');
  React.useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const results = query
          ? await Promise.all(
              resource === 'user'
                ? [
                    listRecords('user', { p: 1, s: 20, username: query }),
                    listRecords('user', { p: 1, s: 20, code: query })
                  ]
                : [
                    listRecords(resource, { p: 1, s: 20, name: query }),
                    listRecords(resource, { p: 1, s: 20, word: query })
                  ]
            )
          : [await listRecords(resource, { p: 1, s: 20 })];
        if (!active) return;
        const fetched = results
          .flatMap((result) => result.items)
          .map((item) => {
            const option = {
              value: resource === 'action' ? String(item.code) : Number(item.id),
              label:
                resource === 'user'
                  ? `${item.username} · ${item.code}`
                  : resource === 'action'
                    ? `${item.name} · ${item.word} (${item.code})`
                    : `${item.name} · ${item.word}`
            } satisfies RelationOption;
            return option;
          });
        setOptions((current) => {
          const selectedValues = new Set(selectedKey.split('\u0000').filter(Boolean));
          const next = new Map(
            current
              .filter((option) => selectedValues.has(String(option.value)))
              .map((option) => [String(option.value), option])
          );
          for (const option of fetched) next.set(String(option.value), option);
          return [...next.values()];
        });
      } catch {
        if (active)
          setOptions((current) => {
            const selectedValues = new Set(selectedKey.split('\u0000').filter(Boolean));
            return current.filter((option) => selectedValues.has(String(option.value)));
          });
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, resource, selectedKey]);
  function toggle(option: RelationOption) {
    if (!multiple) {
      onChange(option.value);
      setOpen(false);
      return;
    }
    const exists = selected.some((item) => String(item) === String(option.value));
    onChange(
      exists
        ? selected.filter((item) => String(item) !== String(option.value))
        : [...selected, option.value]
    );
  }
  return (
    <div className='space-y-2'>
      <Label>{field.label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type='button'
              variant='outline'
              className='h-auto min-h-9 w-full justify-between whitespace-normal'
              aria-label={field.label}
            />
          }
        >
          <span className='flex flex-wrap gap-1 text-left'>
            {selected.length ? (
              selected.map((item) => (
                <Badge key={String(item)} variant='secondary'>
                  {options.find((option) => String(option.value) === String(item))?.label ??
                    String(item)}
                </Badge>
              ))
            ) : (
              <span className='text-muted-foreground'>
                {pick('Search and select', '搜索并选择')}
              </span>
            )}
          </span>
          <IconChevronDown className='size-4 shrink-0' />
        </PopoverTrigger>
        <PopoverContent align='start' className='w-[min(34rem,calc(100vw-3rem))]'>
          <Input
            aria-label={pick(`Search ${field.label}`, `搜索${field.label}`)}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={pick('Search by name or code', '按名称或编码搜索')}
            autoFocus
          />
          {!multiple && (
            <Button
              type='button'
              variant='ghost'
              className='justify-start'
              onClick={() => {
                onChange(0);
                setOpen(false);
              }}
            >
              <IconX />
              {pick('None', '无')}
            </Button>
          )}
          <div className='max-h-64 space-y-1 overflow-auto'>
            {options.length === 0 ? (
              <p className='p-3 text-center text-muted-foreground'>
                {pick('No results', '暂无结果')}
              </p>
            ) : (
              options.map((option) => {
                const checked = selected.some((item) => String(item) === String(option.value));
                return (
                  <button
                    type='button'
                    key={String(option.value)}
                    className='flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted'
                    onClick={() => toggle(option)}
                  >
                    {multiple && <Checkbox checked={checked} tabIndex={-1} />}
                    {!multiple && checked && <IconCheck className='size-4 text-primary' />}
                    <span>{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <p className='text-xs text-muted-foreground'>
        {resource === 'action'
          ? pick(
              'Search by permission name or key, or open the list to browse.',
              '按权限名称或标识搜索，也可以展开列表选择。'
            )
          : resource === 'role'
            ? pick(
                'Search by role name or key, or open the list to browse.',
                '按角色名称或标识搜索，也可以展开列表选择。'
              )
            : pick(
                'Search by username or user code, or open the list to browse.',
                '按用户名或用户编码搜索，也可以展开列表选择。'
              )}
      </p>
    </div>
  );
}
