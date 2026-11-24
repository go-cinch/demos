import { createApp } from 'vue';

import { i18n, loadLocaleMessages } from '@vben/locales';

import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';

vi.mock('#/store/system-properties', () => ({
  loadSystemProperties: vi.fn().mockResolvedValue(undefined),
}));

const { getCatalog } = vi.hoisted(() => ({ getCatalog: vi.fn() }));
vi.mock('#/api/core/i18n', () => ({ getPublicI18nCatalogApi: getCatalog }));

const { antdLocale, setupI18n, refreshI18nCatalog } = await import('./index');
afterEach(() => {
  getCatalog.mockReset();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const englishModules = import.meta.glob<object>('./langs/en-US/*.json', {
  eager: true,
  import: 'default',
});
const chineseModules = import.meta.glob<object>('./langs/zh-CN/*.json', {
  eager: true,
  import: 'default',
});

function messages(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof item === 'string'
        ? [[path, item]]
        : Object.entries(messages(item, path));
    }),
  );
}

describe('application internationalization', () => {
  it('drops catalog-only labels after the actual startup and locale switching sequence', async () => {
    const catalog = {
      schema_version: 2,
      default_locale: 'en-US',
      locales: [
        { tag: 'en-US', name: 'English', enabled: true },
        { tag: 'zh-CN', name: '简体中文', enabled: true },
      ],
      messages: {
        'en-US': {
          frontend: { menus: { 'admin:menu:system:user': 'Live operators' } },
        },
        'zh-CN': { frontend: {} },
      },
    };
    getCatalog.mockResolvedValue(catalog);
    await setupI18n(createApp({}), { defaultLocale: 'zh-CN' });
    expect(getCatalog).toHaveBeenCalledOnce();
    await loadLocaleMessages('en-US');
    expect(getCatalog).toHaveBeenCalledOnce();
    expect(i18n.global.t('menus.admin:menu:system:user')).toBe(
      'Live operators',
    );
    catalog.messages['en-US'].frontend =
      {} as (typeof catalog.messages)['en-US']['frontend'];
    await refreshI18nCatalog();
    expect(i18n.global.te('menus.admin:menu:system:user', 'en-US')).toBe(false);
    expect(i18n.global.t('system.menu.users')).toBe('Users');
  });

  it('does not refresh on focus, visibility changes or elapsed time', async () => {
    vi.stubEnv('MODE', 'development');
    getCatalog.mockRejectedValue(new Error('offline'));
    vi.useFakeTimers();
    await setupI18n(createApp({}), { defaultLocale: 'zh-CN' });
    expect(getCatalog).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    await loadLocaleMessages('en-US');
    await loadLocaleMessages('zh-CN');
    expect(getCatalog).toHaveBeenCalledOnce();
  });

  it('keeps bilingual keys and interpolation parameters aligned', () => {
    expect(
      Object.keys(englishModules)
        .map((path) => path.replace('/en-US/', '/'))
        .toSorted(),
    ).toEqual(
      Object.keys(chineseModules)
        .map((path) => path.replace('/zh-CN/', '/'))
        .toSorted(),
    );
    for (const [path, english] of Object.entries(englishModules)) {
      const chinese = required(
        chineseModules[path.replace('/en-US/', '/zh-CN/')],
      );
      const en = messages(english);
      const zh = messages(chinese);
      expect(Object.keys(en).toSorted(), path).toEqual(
        Object.keys(zh).toSorted(),
      );
      for (const [key, value] of Object.entries(en)) {
        expect(zh[key]?.trim(), `${path}:${key}`).toBeTruthy();
        expect(
          zh[key]?.match(/\{\w+\}/g)?.toSorted() ?? [],
          `${path}:${key}`,
        ).toEqual(value.match(/\{\w+\}/g)?.toSorted() ?? []);
      }
    }
  });

  it('loads English fallback on a Chinese first visit and switches component locales', async () => {
    getCatalog.mockRejectedValue(new Error('offline'));
    await setupI18n(createApp({}), { defaultLocale: 'zh-CN' });
    expect(i18n.global.t('system.menu.users')).toBe('用户');
    expect(i18n.global.t('system.table.total', { count: 12 })).toBe('共 12 条');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(antdLocale.value.locale).toBe('zh-cn');
    expect(dayjs.locale()).toBe('zh-cn');
    expect(i18n.global.getLocaleMessage('en-US')).toHaveProperty('system');
    i18n.global.mergeLocaleMessage('en-US', {
      fallbackTest: 'English fallback',
    });
    expect(i18n.global.t('fallbackTest')).toBe('English fallback');

    await loadLocaleMessages('en-US');
    expect(i18n.global.t('system.menu.users')).toBe('Users');
    expect(document.documentElement.lang).toBe('en-US');
    expect(antdLocale.value.locale).toBe('en');
    expect(dayjs.locale()).toBe('en');
  });
});
