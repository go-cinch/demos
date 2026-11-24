import { loadLocaleMessages } from '@vben/locales';
import {
  preferences,
  preferencesManager,
  updatePreferences,
} from '@vben/preferences';

import { updateUserLanguageApi } from '#/api/core/user';
import { resolveCatalogLocale } from '#/locales/catalog';

import {
  createGlobalPreferenceSync,
  pendingSelection,
} from './global-preference';

async function applyLanguage(locale: string) {
  updatePreferences({ app: { locale } });
  await loadLocaleMessages(locale);
}

export function createLanguagePreferenceSync() {
  const sync = createGlobalPreferenceSync({
    fallback: () => preferencesManager.getInitialPreferences().app.locale,
    field: 'language',
    current: () => preferences.app.locale,
    resolve: resolveCatalogLocale,
    save: updateUserLanguageApi,
    apply: applyLanguage,
  });
  return {
    ...sync,
    async applyPendingSelection(acceptedAt: number) {
      const locale = pendingSelection('language', acceptedAt)?.value;
      if (
        locale &&
        locale !== preferences.app.locale &&
        resolveCatalogLocale(locale) === locale
      ) {
        await applyLanguage(locale);
      }
    },
  };
}
