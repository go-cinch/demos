import { ref } from 'vue';

import { setSupportLanguages } from '@vben/constants';
import { i18n, loadLocaleMessages } from '@vben/locales';
import { updatePreferences } from '@vben/preferences';

export interface I18nCatalog {
  group_order?: string[];
  default_locale: string;
  locales: { enabled: boolean; name: string; tag: string }[];
  messages: Record<string, { frontend?: Record<string, unknown> }>;
  schema_version: number;
}
let catalog: I18nCatalog | undefined;
const catalogRevision = ref(0);
let pending: Promise<void> | undefined;
let lastSnapshot = '';
const fallbacks = new Map<string, Record<string, unknown>>();
export function registerCatalogFallback(
  locale: string,
  messages: Record<string, unknown>,
) {
  fallbacks.set(locale, JSON.parse(JSON.stringify(messages)));
  i18n.global.setLocaleMessage(locale, messages);
}

export function catalogMessages(locale: string) {
  return catalog?.messages[locale]?.frontend ?? {};
}
export function catalogDefaultLocale() {
  void catalogRevision.value;
  return catalog?.default_locale ?? 'en-US';
}
export function catalogLanguages() {
  void catalogRevision.value;
  return catalog?.locales ?? [];
}
export function catalogGroupWords() {
  void catalogRevision.value;
  return [
    ...new Set(
      Object.values(catalog?.messages ?? {}).flatMap((messages) => {
        const groups = messages.frontend?.groups;
        return groups && typeof groups === 'object' && !Array.isArray(groups)
          ? Object.keys(groups)
          : [];
      }),
    ),
  ].sort((left, right) => left.localeCompare(right));
}
export function catalogGroupOrder() {
  void catalogRevision.value;
  return catalog?.group_order ?? [];
}
export function catalogGroupNames(word: string) {
  void catalogRevision.value;
  return Object.fromEntries(
    (catalog?.locales ?? []).map((locale) => {
      const groups = catalog?.messages[locale.tag]?.frontend?.groups as
        | Record<string, string>
        | undefined;
      return [locale.tag, groups?.[word] ?? ''];
    }),
  );
}
export function resolveCatalogLocale(requested: string) {
  return !catalog ||
    catalog.locales.some((item) => item.enabled && item.tag === requested)
    ? requested
    : catalog.default_locale;
}

/** Public translation data only; this must also work before a session exists. */
export async function refreshI18nCatalog() {
  if (pending) return pending;
  pending = (async () => {
    try {
      const base = (
        import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth'
      ).replace(/\/$/, '');
      const response = await fetch(
        `${base}/dictionary/pub/i18n?f=default_locale,locales,group_order,frontend_messages`,
        {
          headers: {
            'Accept-Language': String(i18n.global.locale.value || 'en-US'),
            'X-Auth-Scope': 'admin',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) return;
      const next = (await response.json()) as I18nCatalog;
      if (
        next.schema_version !== 2 ||
        !Array.isArray(next.locales) ||
        !next.messages
      )
        return;
      const enabled = next.locales.filter(
        (item) => item.enabled && item.tag && next.messages[item.tag],
      );
      if (!enabled.some((item) => item.tag === next.default_locale)) return;
      const snapshot = JSON.stringify(next);
      if (lastSnapshot === snapshot) return;
      catalog = next;
      catalogRevision.value++;
      lastSnapshot = snapshot;
      setSupportLanguages(
        enabled.map((item) => ({ label: item.name, value: item.tag })),
      );
      i18n.global.fallbackLocale.value = next.default_locale;
      for (const tag of new Set([
        ...Object.keys(next.messages),
        ...fallbacks.keys(),
        ...i18n.global.availableLocales,
      ])) {
        i18n.global.setLocaleMessage(
          tag,
          JSON.parse(JSON.stringify(fallbacks.get(tag) ?? {})),
        );
        if (enabled.some((item) => item.tag === tag))
          i18n.global.mergeLocaleMessage(
            tag,
            next.messages[tag]?.frontend ?? {},
          );
      }
      const current = String(i18n.global.locale.value);
      if (current && !enabled.some((item) => item.tag === current)) {
        updatePreferences({ app: { locale: next.default_locale } });
        queueMicrotask(() => {
          void loadLocaleMessages(next.default_locale);
        });
      }
    } catch {
      // Keep the last good catalog (or bundled startup fallback) while offline.
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

let watching = false;
export function watchI18nCatalog() {
  if (watching || import.meta.env.MODE === 'test') return;
  watching = true;
  const refresh = () => {
    if (document.visibilityState !== 'hidden') void refreshI18nCatalog();
  };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.setInterval(refresh, 5000);
}
