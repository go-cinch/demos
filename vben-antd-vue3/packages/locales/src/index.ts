import {
  i18n,
  loadBundledLocaleMessages,
  loadLocaleMessages,
  loadLocalesMap,
  loadLocalesMapFromDir,
  setupI18n,
} from './i18n';
import { normalizePlaceholder } from './placeholder';

const $t = i18n.global.t;
const $te = i18n.global.te;

export { normalizePlaceholder } from './placeholder';

export const $placeholder = ((...args: Parameters<typeof $t>) =>
  normalizePlaceholder($t(...args))) as typeof $t;

export {
  $t,
  $te,
  i18n,
  loadBundledLocaleMessages,
  loadLocaleMessages,
  loadLocalesMap,
  loadLocalesMapFromDir,
  setupI18n,
};
export { notifyLocaleSelected, onLocaleSelected } from './selection';
export {
  type ImportLocaleFn,
  type LocaleSetupOptions,
  type SupportedLanguagesType,
} from './typing';

export type { CompileError } from '@intlify/core-base';

export { useI18n } from 'vue-i18n';

export type { Locale } from 'vue-i18n';
