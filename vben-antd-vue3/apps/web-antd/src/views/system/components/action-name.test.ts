import type { ActionConfig } from '#/api/system';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { actionDisplayName, automaticActionName } from './action-name';

const state = vi.hoisted(() => ({
  locale: { value: 'en-US' },
  messages: {} as Record<string, Record<string, Record<string, string>>>,
  bundled: {} as Record<string, string>,
}));
vi.mock('@vben/locales', () => ({
  $te: (key: string) => key in state.bundled,
  i18n: { global: { locale: state.locale } },
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => state.bundled[key],
  catalogLabel: (_kind: string, key: string) => key,
}));
vi.mock('#/locales/catalog', () => ({
  catalogDefaultLocale: () => 'en-US',
  catalogMessages: (locale: string) => state.messages[locale] ?? {},
}));
const config: ActionConfig = {
  bindings: [
    { resource_key: 'admin:system:user', operation: 'read', feature_keys: [] },
  ],
  ui: [],
  endpoints: [],
};
beforeEach(() => {
  state.locale.value = 'en-US';
  state.bundled = {};
  state.messages = {
    'en-US': {
      resources: { 'admin:system:user': 'Users' },
      operations: { read: 'Read' },
      actions: {},
    },
    'zh-CN': {
      resources: { 'admin:system:user': '用户' },
      operations: { read: '查看' },
    },
  };
});

describe('permission display names', () => {
  it('derives multilingual names from actual bindings instead of the arbitrary action word', () => {
    expect(
      actionDisplayName('admin:read:random:suffix', config, 'Old name'),
    ).toBe('Read Users');
    state.locale.value = 'zh-CN';
    expect(automaticActionName(config)).toBe('查看用户');
    expect(automaticActionName(config, 'fr-FR')).toBe('Read Users');
  });
  it('prefers explicit action translations and default-language translations', () => {
    state.messages['en-US']!.actions = {
      'admin:read:custom:name': 'Review accounts',
    };
    state.locale.value = 'zh-CN';
    expect(actionDisplayName('admin:read:custom:name', config)).toBe(
      'Review accounts',
    );
    state.messages['zh-CN']!.actions = { 'admin:read:custom:name': '审核账户' };
    expect(actionDisplayName('admin:read:custom:name', config)).toBe(
      '审核账户',
    );
  });
  it('deduplicates generated names and falls back to stored names and identifiers', () => {
    expect(
      automaticActionName({
        ...config,
        bindings: [...config.bindings!, ...config.bindings!],
      }),
    ).toBe('Read Users');
    expect(
      actionDisplayName('admin:read:custom:name', undefined, 'Stored name'),
    ).toBe('Stored name');
    expect(actionDisplayName('admin:read:custom:name')).toBe(
      'admin:read:custom:name',
    );
    state.messages = {};
    expect(automaticActionName(config)).toBe('read admin:system:user');
  });
  it('uses bundled bootstrap translations only for the active locale', () => {
    state.messages = {};
    state.bundled = {
      'resources.admin:system:user': 'Users',
      'operations.read': 'Read',
    };
    expect(automaticActionName(config)).toBe('Read Users');
    expect(automaticActionName(config, 'fr-FR')).toBe('read admin:system:user');
  });
});
