import { createApp } from 'vue';

import { i18n, loadLocaleMessages } from '@vben/locales';

import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import appEnglish from './langs/en-US/app.json';
import systemEnglish from './langs/en-US/system.json';
import appChinese from './langs/zh-CN/app.json';
import systemChinese from './langs/zh-CN/system.json';
import { antdLocale, setupI18n } from './index';

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
  it('keeps bilingual keys and interpolation parameters aligned', () => {
    for (const [english, chinese] of [
      [appEnglish, appChinese],
      [systemEnglish, systemChinese],
    ] as const) {
      const en = messages(english);
      const zh = messages(chinese);
      expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
      for (const [key, value] of Object.entries(en)) {
        expect(zh[key]?.trim()).toBeTruthy();
        expect(zh[key]?.match(/\{\w+\}/g)?.sort() ?? []).toEqual(
          value.match(/\{\w+\}/g)?.sort() ?? [],
        );
      }
    }
  });

  it('loads English fallback on a Chinese first visit and switches component locales', async () => {
    await setupI18n(createApp({}), { defaultLocale: 'zh-CN' });
    expect(i18n.global.t('system.menu.users')).toBe('用户管理');
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
