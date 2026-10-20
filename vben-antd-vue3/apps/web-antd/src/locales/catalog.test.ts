import { getSupportLanguages } from '@vben/constants';
import { i18n } from '@vben/locales';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  catalogDefaultLocale,
  catalogGroupNames,
  catalogGroupOrder,
  catalogGroupWords,
  refreshI18nCatalog,
  registerCatalogFallback,
  resolveCatalogLocale,
} from './catalog';

afterEach(() => vi.unstubAllGlobals());

describe('live dictionary localization', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }),
    );
    await refreshI18nCatalog();
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    const selected = new URL(String(url), 'http://localhost').searchParams
      .get('f')
      ?.split(',');
    expect(selected).toEqual([
      'default_locale',
      'locales',
      'group_order',
      'frontend_messages',
    ]);
    expect(options?.headers).toMatchObject({ 'Accept-Language': 'en-US' });
    expect(i18n.global.t('common.title')).toBe('Live');
    expect(i18n.global.t('menus.admin:menu:system:user')).toBe('Operators');
    expect(getSupportLanguages()).toContainEqual({
      label: 'Français',
      value: 'fr-FR',
    });
    catalog.messages['en-US'].frontend =
      {} as (typeof catalog.messages)['en-US']['frontend'];
    await refreshI18nCatalog();
    expect(i18n.global.t('common.title')).toBe('Bundled');
    expect(i18n.global.te('menus.admin:menu:system:user')).toBe(false);
  });

  it('coalesces concurrent refreshes and exposes group names and configured order', async () => {
    i18n.global.locale.value = 'en-US';
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const first = refreshI18nCatalog();
    const second = refreshI18nCatalog();
    finish({
      ok: true,
      json: async () => ({
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
      }),
    });
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![1].headers).toMatchObject({
      'X-Auth-Scope': 'admin',
    });
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
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => valid });
    vi.stubGlobal('fetch', fetcher);
    await refreshI18nCatalog();
    for (const response of [
      { ok: false },
      { ok: true, json: async () => ({ ...valid, schema_version: 1 }) },
      { ok: true, json: async () => ({ ...valid, default_locale: 'fr-FR' }) },
    ]) {
      fetcher.mockResolvedValueOnce(response);
      await refreshI18nCatalog();
      expect(i18n.global.t('preserved')).toBe('Last good catalog');
      expect(catalogDefaultLocale()).toBe('en-US');
    }
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await refreshI18nCatalog();
    expect(i18n.global.t('preserved')).toBe('Last good catalog');
  });
});
