import type { Dayjs } from 'dayjs';

import type { Recordable } from '@vben/types';

import type { DisplayColumn, ResourceKind } from './management-types';

import { useTimezoneStore } from '@vben/stores';

import dayjs from 'dayjs';

import { $t, catalogLabel } from '#/locales';

import { actionDisplayName } from './action-name';
import { actionMapping } from './system-record-format';
export function useManagementFormatting(resource: () => ResourceKind) {
  const timezone = useTimezoneStore();
  function getRecordID(record: Recordable<any>) {
    return record.id;
  }

  function getRecordLabel(record: Recordable<any>) {
    if (resource() === 'action' && record.word)
      return actionDisplayName(record.word, record.config, record.name);
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
    if (
      resource() === 'action' &&
      ['button', 'menu', 'resource'].includes(column.dataIndex)
    )
      return actionMapping(record, column.dataIndex);
    if (resource() === 'action' && column.dataIndex === 'group')
      return catalogLabel('groups', record.group || '');
    if (resource() === 'action' && column.dataIndex === 'name')
      return actionDisplayName(record.word || '', record.config, record.name);
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
        GRPC: 'purple',
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

  return {
    getRecordID,
    getRecordLabel,
    columnDisplay,
    columnValue,
    formatDate,
    formatLockExpiration,
    userLockExpiration,
    userPasswordChangeFailures,
    disablePastDate,
    resourceRules,
    resourceRuleColor,
    formatJSON,
    statusColor,
    statusLabel,
  };
}
