import type {
  ActionRecord,
  DictionaryRecord,
  RoleRecord,
  UserGroupRecord,
  UserRecord,
  WhitelistRecord,
} from '#/api';

import { useTimezoneStore } from '@vben/stores';

import dayjs from 'dayjs';

import { $t } from '#/locales';

export type ResourceKind =
  | 'action'
  | 'dictionary'
  | 'role'
  | 'user'
  | 'user-group'
  | 'whitelist';

type Preview<T extends { id: number }> = Pick<T, 'id'> & Partial<T>;
export type SystemRecord =
  | Preview<ActionRecord>
  | Preview<DictionaryRecord>
  | Preview<RoleRecord>
  | Preview<UserGroupRecord>
  | Preview<UserRecord>
  | Preview<WhitelistRecord>;

export interface ResourceRule {
  method: string;
  path: string;
  raw: string;
}

export function recordLabel(record: SystemRecord) {
  if ('name' in record) return record.name ?? '';
  if ('username' in record) return record.username ?? '';
  return $t('system-cards.whitelistEntry', { id: record.id });
}

export function recordDate(value: number | undefined) {
  return typeof value === 'number' && value > 0
    ? dayjs(value).tz(useTimezoneStore().timezone).format('YYYY-MM-DD HH:mm:ss')
    : '—';
}

export function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2) ?? 'null';
}

export function jsonType(value: unknown) {
  if (value === null) return $t('system-cards.types.null');
  if (Array.isArray(value)) return $t('system-cards.types.array');
  return $t(`system-cards.types.${typeof value}`);
}

export function jsonStructure(value: unknown) {
  if (Array.isArray(value))
    return $t('system-cards.items', { count: value.length });
  if (typeof value === 'object' && value !== null) {
    return $t('system-cards.fields', { count: Object.keys(value).length });
  }
  if (typeof value === 'string') {
    return $t('system-cards.characters', { count: [...value].length });
  }
  return $t('system-cards.scalar');
}

export function splitLines(value = '') {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resourceRules(value = ''): ResourceRule[] {
  return splitLines(value).map((raw) => {
    const separator = raw.indexOf('|');
    return separator === -1
      ? { method: '', path: raw, raw }
      : {
          method: raw.slice(0, separator).trim(),
          path: raw.slice(separator + 1).trim(),
          raw,
        };
  });
}

export function ruleColor(rule: ResourceRule, category?: number) {
  if (category !== undefined) return category === 0 ? 'blue' : 'green';
  return (
    (
      { DELETE: 'red', GET: 'green', PATCH: 'orange', POST: 'blue' } as Record<
        string,
        string
      >
    )[rule.method.toUpperCase()] || 'default'
  );
}

export function recordActions(record: SystemRecord): ActionRecord[] {
  return 'actions' in record ? record.actions ?? [] : [];
}

export function recordActionSummaries(record: SystemRecord) {
  return 'action_summaries' in record ? record.action_summaries ?? [] : recordActions(record);
}

export function permissionCount(record: SystemRecord) {
  return recordActionSummaries(record).length;
}

export function permissionGroups(record: SystemRecord) {
  return [
    ...new Set(
      recordActionSummaries(record)
        .map((item) => item.group)
        .filter(Boolean),
    ),
  ];
}

export function userStatus(status = -1) {
  return {
    color: (
      { 0: 'warning', 1: 'success', 2: 'error' } as Record<number, string>
    )[status],
    label: $t(
      (
        {
          0: 'system.status.pending',
          1: 'system.status.active',
          2: 'system.status.locked',
        } as Record<number, string>
      )[status] || 'system.common.unknown',
    ),
  };
}

export function recordIcon(resource: ResourceKind) {
  return {
    action: 'lucide:key-round',
    dictionary: 'lucide:book-key',
    role: 'lucide:shield-check',
    user: 'lucide:user-round',
    'user-group': 'lucide:users-round',
    whitelist: 'lucide:list-checks',
  }[resource];
}

/** Render-only shapes; never passed to the request layer or selectable while busy. */
export function skeletonRecord(resource: ResourceKind, id = -1): SystemRecord {
  const base = { id, created_at: 0, updated_at: 0 };
  const named = { ...base, name: '────────', word: '────────' };
  switch (resource) {
    case 'dictionary': return { ...named, key: '────────', description: '────────', enabled: true, value: {} };
    case 'whitelist': return { ...base, category: 0, resource: 'GET /────────' };
    case 'action': return { ...named, code: '────────', group: '────────', resource: 'GET /────────', menu: '', button: '' };
    case 'user': return { ...base, username: '────────', code: '────────', status: 1, actions: [], action_codes: [], metadata: {}, login_count: 0, wrong: 0 };
    case 'user-group': return { ...named, users: [], actions: [], action_codes: [] };
    case 'role': return { ...named, actions: [], action_codes: [] };
  }
}

export function memberPreview(record: SystemRecord | Record<string, any>) {
  if ('member_preview' in record) return (record.member_preview ?? []) as import('#/api').UserSummary[];
  return ('users' in record ? (record.users ?? []).slice(0, 5) : []) as import('#/api').UserSummary[];
}
export function memberCount(record: SystemRecord | Record<string, any>) {
  if ('member_count' in record) return record.member_count ?? 0;
  return 'users' in record ? (record.users ?? []).length : 0;
}
