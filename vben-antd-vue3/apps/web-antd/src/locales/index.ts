import type { Locale } from 'ant-design-vue/es/locale';

import type { App } from 'vue';

import type { LocaleSetupOptions, SupportedLanguagesType } from '@vben/locales';

import { ref } from 'vue';

import {
  $t,
  $te,
  i18n,
  loadLocaleMessages,
  loadBundledLocaleMessages,
  setupI18n as coreSetup,
  loadLocalesMapFromDir,
} from '@vben/locales';
import { preferences } from '@vben/preferences';

import antdEnLocale from 'ant-design-vue/es/locale/en_US';
import antdDefaultLocale from 'ant-design-vue/es/locale/zh_CN';
import dayjs from 'dayjs';
import { catalogMessages, catalogDefaultLocale, refreshI18nCatalog, watchI18nCatalog, registerCatalogFallback, resolveCatalogLocale } from './catalog';

const antdLocale = ref<Locale>(antdDefaultLocale);

const modules = import.meta.glob('./langs/**/*.json');

const localesMap = loadLocalesMapFromDir(
  /\.\/langs\/([^/]+)\/(.*)\.json$/,
  modules,
);
/**
 * 加载应用特有的语言包
 * 这里也可以改造为从服务端获取翻译数据
 * @param lang
 */
async function loadMessages(lang: SupportedLanguagesType) {
  const [appLocaleMessages, coreMessages] = await Promise.all([
    localesMap[lang]?.(),
    loadBundledLocaleMessages(lang),
    loadThirdPartyMessage(lang),
  ]);
  // Both inputs come from bundled files; never capture a live dictionary as fallback.
  // Application namespaces are disjoint from core namespaces.
  registerCatalogFallback(lang, { ...coreMessages, ...(appLocaleMessages?.default ?? {}) });
  await refreshI18nCatalog();
  return catalogMessages(lang);
}

/**
 * 加载第三方组件库的语言包
 * @param lang
 */
async function loadThirdPartyMessage(lang: SupportedLanguagesType) {
  await Promise.all([loadAntdLocale(lang), loadDayjsLocale(lang)]);
}

/**
 * 加载dayjs的语言包
 * @param lang
 */
async function loadDayjsLocale(lang: SupportedLanguagesType) {
  let locale;
  switch (lang) {
    case 'en-US': {
      locale = await import('dayjs/locale/en');
      break;
    }
    case 'zh-CN': {
      locale = await import('dayjs/locale/zh-cn');
      break;
    }
    // 默认使用英语
    default: {
      locale = await import('dayjs/locale/en');
    }
  }
  if (locale) {
    dayjs.locale(locale.default);
  } else {
    console.error(`Failed to load dayjs locale for ${lang}`);
  }
}

/**
 * 加载antd的语言包
 * @param lang
 */
async function loadAntdLocale(lang: SupportedLanguagesType) {
  antdLocale.value = antdEnLocale;
  switch (lang) {
    case 'en-US': {
      antdLocale.value = antdEnLocale;
      break;
    }
    case 'zh-CN': {
      antdLocale.value = antdDefaultLocale;
      break;
    }
  }
}

async function setupI18n(app: App, options: LocaleSetupOptions = {}) {
  await refreshI18nCatalog();
  const locale = resolveCatalogLocale(options.defaultLocale ?? preferences.app.locale ?? catalogDefaultLocale());
  i18n.global.fallbackLocale.value = catalogDefaultLocale();
  // Load the fallback catalog even when the first visit starts in Chinese.
  await coreSetup(app, {
    loadMessages,
    missingWarn: !import.meta.env.PROD,
    ...options,
    defaultLocale: 'en-US',
  });
  await loadLocaleMessages(locale);
  watchI18nCatalog();
}

function catalogLabel(kind: 'actions' | 'buttons' | 'groups' | 'menus' | 'scopes', key: string) {
  if ($te(`${kind}.${key}`)) return $t(`${kind}.${key}`);
  if (kind === 'actions') {
    const [scope, operation, ...resource] = key.split(':');
    const resourceKey = `resources.${scope}:${resource.join(':')}`;
    const operationKey = `operations.${operation}`;
    if (resource.length >= 2 && $te(resourceKey) && $te(operationKey)) {
      const separator = String(i18n.global.locale.value).startsWith('zh') ? '' : ' ';
      return `${$t(operationKey)}${separator}${$t(resourceKey)}`;
    }
  }
  return key;
}
export { $t, antdLocale, setupI18n, catalogLabel };
export { refreshI18nCatalog } from './catalog';
