import type { ActionRecord } from '#/api';
import type { RouteRecordRaw } from 'vue-router';

import { $te } from '@vben/locales';

import { $t, catalogLabel } from '#/locales';
import { accessRoutes } from '#/router/routes';

import { isHighRiskAction } from './assignment-policy';
import { actionDisplayName } from './action-name';
import { actionResourceBindings } from './resource-catalog';
import { splitLines } from './system-record-format';

export type PermissionOption = Omit<ActionRecord, 'created_at' | 'updated_at'>;

const definitionLabel = (kind: 'operations' | 'resources', key: string) =>
  $te(`${kind}.${key}`) ? $t(`${kind}.${key}`) : key;

const pageTitles = new Map<string, string>();
function collectPageTitles(routes: RouteRecordRaw[], parent = '') {
  for (const route of routes) {
    const path = route.path.startsWith('/') ? route.path : `${parent}/${route.path}`;
    if (typeof route.meta?.title === 'string') pageTitles.set(path, route.meta.title);
    if (route.children) collectPageTitles(route.children, path);
  }
}
collectPageTitles(accessRoutes);
function pageLabel(key: string) {
  const title = pageTitles.get(key);
  return title ? ($te(title) ? $t(title) : title) : catalogLabel('menus', key);
}
const grantsAll = (item: PermissionOption) => item.config?.builtin === 'all'
  || item.config?.permission_scope === '*' || Boolean(item.config?.permission_scopes?.length)
  || item.word.endsWith(':all:system:all');

export function permissionName(item: PermissionOption) {
  return actionDisplayName(item.word, item.config, item.name) || item.code;
}

export function permissionGroup(word: string) {
  return word ? catalogLabel('groups', word) : $t('system-insights.ungrouped');
}

export function permissionRisk(item: PermissionOption) {
  return item.word.endsWith(':grant:system:permission-admin') || grantsAll(item)
    || isHighRiskAction(item.word, item.config?.builtin, item.config?.permission_scope, item.config?.permission_scopes)
    || (item.resource ?? '').includes('*');
}

export function permissionScope(item: PermissionOption) {
  if (item.config?.permission_scope === '*') return $t('permission-assignment.everyScope');
  return (item.config?.permission_scopes?.length
    ? item.config.permission_scopes
    : [item.scope || item.word.split(':')[0] || ''])
    .map((scope) => catalogLabel('scopes', scope)).join('、');
}

export function permissionEffects(item: PermissionOption) {
  const resources = new Map<string, string[]>();
  for (const binding of actionResourceBindings(item.config)) {
    const values = resources.get(binding.resource_key) ?? [];
    const operation = definitionLabel('operations', binding.operation);
    if (!values.includes(operation)) values.push(operation);
    resources.set(binding.resource_key, values);
  }
  return [...resources].map(([key, operations]) => ({
    key, name: definitionLabel('resources', key), operations: operations.join('、'),
  }));
}

export function permissionPages(item: PermissionOption) {
  return [...new Set(item.config
    ? (item.config.ui ?? []).filter((entry) => entry.page_entry).map((entry) => pageLabel(entry.menu_key))
    : splitLines(item.menu).map((key) => pageLabel(key)))];
}

export function permissionButtons(item: PermissionOption) {
  return [...new Set(item.config
    ? (item.config.ui ?? []).flatMap((entry) => entry.button_keys ?? []).map((key) => catalogLabel('buttons', key))
    : splitLines(item.button).map((key) => catalogLabel('buttons', key)))];
}

export function permissionDescription(item: PermissionOption) {
  if (grantsAll(item)) {
    return $t('permission-assignment.fullAccess', { scope: permissionScope(item) });
  }
  if (item.word.endsWith(':grant:system:permission-admin')) return $t('permission-assignment.grantAccess');
  const effects = permissionEffects(item);
  if (effects.length) return effects.map((effect) => `${effect.name} · ${effect.operations}`).join('；');
  const pages = permissionPages(item);
  if (pages.length) return $t('permission-assignment.pageAccess', { pages: pages.join('、') });
  return $t('permission-assignment.capabilityAccess');
}
