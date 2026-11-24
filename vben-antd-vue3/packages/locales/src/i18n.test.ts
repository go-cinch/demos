import { createApp } from 'vue';

import { useSimpleLocale } from '@vben-core/composables';

import { expect, it } from 'vitest';

import { i18n, loadLocaleMessages, setupI18n } from './i18n';

it('keeps component labels in the active language when a switch is superseded', async () => {
  const { $t } = useSimpleLocale();
  await setupI18n(createApp({}), { defaultLocale: 'zh-CN' });

  const switchToEnglish = loadLocaleMessages('en-US');
  await loadLocaleMessages('zh-CN');
  await switchToEnglish;

  expect(i18n.global.locale.value).toBe('zh-CN');
  expect(document.documentElement.lang).toBe('zh-CN');
  expect($t.value('cancel')).toBe('取消');

  await loadLocaleMessages('en-US');
  expect(i18n.global.locale.value).toBe('en-US');
  expect($t.value('cancel')).toBe('Cancel');
});
