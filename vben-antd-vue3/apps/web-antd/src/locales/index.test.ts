import { createApp } from 'vue';

import { i18n, loadLocaleMessages } from '@vben/locales';

import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { antdLocale, setupI18n, refreshI18nCatalog } from './index';
afterEach(() => vi.unstubAllGlobals());

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }),
    );
    await setupI18n(createApp({}), { defaultLocale: 'zh-CN' });
    await loadLocaleMessages('en-US');
    expect(i18n.global.t('menus.admin:menu:system:user')).toBe(
      'Live operators',
    );
    catalog.messages['en-US'].frontend =
      {} as (typeof catalog.messages)['en-US']['frontend'];
    await refreshI18nCatalog();
    expect(i18n.global.te('menus.admin:menu:system:user', 'en-US')).toBe(false);
    expect(i18n.global.t('system.menu.users')).toBe('Users');
  });

  it('keeps bilingual keys and interpolation parameters aligned', () => {
    expect(
      Object.keys(englishModules)
        .map((path) => path.replace('/en-US/', '/'))
        .sort(),
    ).toEqual(
      Object.keys(chineseModules)
        .map((path) => path.replace('/zh-CN/', '/'))
        .sort(),
    );
    for (const [path, english] of Object.entries(englishModules)) {
      const chinese = chineseModules[path.replace('/en-US/', '/zh-CN/')]!;
      const en = messages(english);
      const zh = messages(chinese);
      expect(Object.keys(en).sort(), path).toEqual(Object.keys(zh).sort());
      for (const [key, value] of Object.entries(en)) {
        expect(zh[key]?.trim(), `${path}:${key}`).toBeTruthy();
        expect(
          zh[key]?.match(/\{\w+\}/g)?.sort() ?? [],
          `${path}:${key}`,
        ).toEqual(value.match(/\{\w+\}/g)?.sort() ?? []);
      }
    }
  });

  it('loads English fallback on a Chinese first visit and switches component locales', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
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
