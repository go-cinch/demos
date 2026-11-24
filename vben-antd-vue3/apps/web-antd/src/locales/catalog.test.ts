import { i18n } from '@vben/locales';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  catalogDefaultLocale,
  catalogGroupNames,
  catalogGroupOrder,
  catalogGroupWords,
  catalogMessages,
  refreshI18nCatalog,
  registerCatalogFallback,
  resolveCatalogLocale,
} from './catalog';

vi.mock('#/store/system-properties', () => ({
  loadSystemProperties: vi.fn().mockResolvedValue(undefined),
}));

const { publicGet } = vi.hoisted(() => ({ publicGet: vi.fn() }));
vi.mock('#/api/request', () => ({
  authSilentPublicRequestClient: { get: publicGet },
}));

describe('live dictionary localization', () => {
  beforeEach(() => {
    publicGet.mockReset();
  });
  it('registers new locales, applies shared menu labels and removes deleted overrides', async () => {
    i18n.global.locale.value = 'en-US';
    i18n.global.setLocaleMessage('en-US', { common: { title: 'Bundled' } });
    registerCatalogFallback('en-US', { common: { title: 'Bundled' } });
    const catalog = {
      schema_version: 2,
      default_locale: 'en-US',
      locales: [
        { tag: 'en-US', name: 'English', enabled: true },
        { tag: 'fr-FR', name: 'Français', enabled: true },
      ],
      messages: {
        'en-US': {
          frontend: {
            common: { title: 'Live' },
            menus: { 'admin:menu:system:user': 'Operators' },
          },
        },
        'fr-FR': { frontend: { common: { title: 'Direct' } } },
      },
    };
    publicGet.mockResolvedValue(catalog);
    await refreshI18nCatalog();
    expect(publicGet).toHaveBeenCalledExactlyOnceWith('/pub/i18n', {
      params: { f: 'default_locale,locales,group_order,frontend_messages' },
      timeout: 5000,
    });
    expect(i18n.global.t('common.title')).toBe('Live');
    expect(i18n.global.t('menus.admin:menu:system:user')).toBe('Operators');
    catalog.messages['en-US'].frontend =
      {} as (typeof catalog.messages)['en-US']['frontend'];
    await refreshI18nCatalog();
    expect(i18n.global.t('common.title')).toBe('Bundled');
    expect(i18n.global.te('menus.admin:menu:system:user')).toBe(false);
  });

  it('uses the published default for blank resource names while keeping translated siblings', async () => {
    const messages = {
      'en-US': {
        frontend: { resources: { user: 'Operators', role: 'Roles' } },
      },
      'zh-CN': { frontend: { resources: { user: '', role: '角色' } } },
    };
    publicGet.mockResolvedValue({
      schema_version: 2,
      default_locale: 'en-US',
      messages,
      locales: [
        { tag: 'en-US', enabled: true },
        { tag: 'zh-CN', enabled: true },
      ],
    });
    await refreshI18nCatalog();
    expect(catalogMessages('zh-CN').resources).toEqual({
      user: 'Operators',
      role: '角色',
    });
    expect(messages['zh-CN'].frontend.resources.user).toBe('');
  });

  it('coalesces concurrent refreshes and exposes group names and configured order', async () => {
    i18n.global.locale.value = 'en-US';
    let finish!: (value: unknown) => void;
    publicGet.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = refreshI18nCatalog();
    const second = refreshI18nCatalog();
    finish({
      schema_version: 2,
      default_locale: 'en-US',
      locales: [
        { tag: 'en-US', name: 'English', enabled: true },
        { tag: 'zh-CN', name: '中文', enabled: false },
      ],
      group_order: ['admin:b', 'admin:a'],
      messages: {
        'en-US': { frontend: { groups: { 'admin:a': 'A', 'admin:b': 'B' } } },
        'zh-CN': { frontend: { groups: { 'admin:a': '甲' } } },
      },
    });
    await Promise.all([first, second]);
    expect(publicGet).toHaveBeenCalledOnce();
    expect(catalogGroupOrder()).toEqual(['admin:b', 'admin:a']);
    expect(catalogGroupWords()).toEqual(['admin:a', 'admin:b']);
    expect(catalogGroupNames('admin:b')).toEqual({ 'en-US': 'B', 'zh-CN': '' });
    expect(resolveCatalogLocale('zh-CN')).toBe('en-US');
    expect(resolveCatalogLocale('en-US')).toBe('en-US');
  });

  it('keeps the last valid catalog when offline, malformed or missing an enabled default locale', async () => {
    i18n.global.locale.value = 'en-US';
    const valid = {
      schema_version: 2,
      default_locale: 'en-US',
      locales: [{ tag: 'en-US', name: 'English', enabled: true }],
      messages: { 'en-US': { frontend: { preserved: 'Last good catalog' } } },
    };
    publicGet.mockResolvedValue(valid);
    await refreshI18nCatalog();
    for (const response of [
      null,
      { ...valid, schema_version: 1 },
      { ...valid, default_locale: 'fr-FR' },
    ]) {
      publicGet.mockResolvedValueOnce(response);
      await refreshI18nCatalog();
      expect(i18n.global.t('preserved')).toBe('Last good catalog');
      expect(catalogDefaultLocale()).toBe('en-US');
    }
    publicGet.mockRejectedValueOnce(new Error('offline'));
    const onUnavailable = vi.fn();
    await refreshI18nCatalog(onUnavailable);
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(i18n.global.t('preserved')).toBe('Last good catalog');
  });
});
