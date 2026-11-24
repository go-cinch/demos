import type { I18nCatalog } from '#/api/core/i18n';

import { ref } from 'vue';

import { i18n, loadLocaleMessages } from '@vben/locales';
import { updatePreferences } from '@vben/preferences';

import { getPublicI18nCatalogApi } from '#/api/core/i18n';
import { loadSystemProperties } from '#/store/system-properties';

export type { I18nCatalog } from '#/api/core/i18n';

let catalog: I18nCatalog | undefined;
const catalogRevision = ref(0);
let pending: Promise<boolean> | undefined;
let lastSnapshot = '';
const fallbacks = new Map<string, Record<string, unknown>>();
export function registerCatalogFallback(
  locale: string,
  messages: Record<string, unknown>,
) {
  fallbacks.set(locale, JSON.parse(JSON.stringify(messages)));
  i18n.global.setLocaleMessage(locale, messages);
}

function resolveBlankMessages(
  messages: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]): [string, unknown][] => {
      const other = fallback[key];
      if (typeof value === 'string' && !value.trim())
        return typeof other === 'string' && other.trim() ? [[key, other]] : [];
      if (value && typeof value === 'object' && !Array.isArray(value))
        return [
          [
            key,
            resolveBlankMessages(
              value as Record<string, unknown>,
              other && typeof other === 'object' && !Array.isArray(other)
                ? (other as Record<string, unknown>)
                : {},
            ),
          ],
        ];
      return [[key, value]];
    }),
  );
}

export function catalogMessages(locale: string) {
  if (!catalog) return {};
  return resolveBlankMessages(
    catalog.messages[locale]?.frontend ?? {},
    catalog.messages[catalog.default_locale]?.frontend ?? {},
  );
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
  ].toSorted((left, right) => left.localeCompare(right));
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
export async function refreshI18nCatalog(
  onUnavailable?: () => void,
): Promise<void> {
  pending ??= (async () => {
    try {
      const options = await loadSystemProperties({ fresh: Boolean(catalog) });
      const translationCatalog = await getPublicI18nCatalogApi();
      const next = {
        ...translationCatalog,
        default_locale:
          options?.default_locale ?? translationCatalog.default_locale,
        locales: options?.locales ?? translationCatalog.locales,
      };
      if (
        next.schema_version !== 2 ||
        !Array.isArray(next.locales) ||
        !next.messages
      )
        return false;
      const enabled = next.locales.filter(
        (item) => item.enabled && item.tag && next.messages[item.tag],
      );
      if (!enabled.some((item) => item.tag === next.default_locale))
        return false;
      const snapshot = JSON.stringify(next);
      if (lastSnapshot === snapshot) return true;
      catalog = next;
      catalogRevision.value++;
      lastSnapshot = snapshot;
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
          i18n.global.mergeLocaleMessage(tag, catalogMessages(tag));
      }
      const current = String(i18n.global.locale.value);
      if (current && !enabled.some((item) => item.tag === current)) {
        updatePreferences({ app: { locale: next.default_locale } });
        queueMicrotask(() => {
          void loadLocaleMessages(next.default_locale);
        });
      }
      return true;
    } catch {
      // Keep the last good catalog (or bundled startup fallback) while offline.
      return false;
    }
  })().finally(() => {
    pending = undefined;
  });
  if (!(await pending)) onUnavailable?.();
}
