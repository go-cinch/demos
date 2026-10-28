'use client';
import { useCallback, useEffect, useState } from 'react';
import { request } from '@/features/auth/api';
import { useLocale } from '@/features/i18n/locale-context';
import type { Catalog } from '@/features/developer/catalog-model';
let cached: Catalog | undefined;
let pending: Promise<Catalog> | undefined;
export function refreshCatalog() {
  pending ??= request<Catalog>(
    '/dictionary/pub/i18n?f=default_locale,locales,group_order,frontend_messages',
    {},
    false
  )
    .then((value) => {
      cached = value;
      window.dispatchEvent(new Event('go-cinch-catalog'));
      return value;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
export function useCatalogLabels() {
  const { locale } = useLocale();
  const [catalog, setCatalog] = useState(cached);
  useEffect(() => {
    const update = () => setCatalog(cached);
    const refresh = () => {
      void refreshCatalog().catch(() => undefined);
    };
    window.addEventListener('go-cinch-catalog', update);
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      window.removeEventListener('go-cinch-catalog', update);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const label = useCallback(
    (kind: string, key: string) => {
      const read = (tag: string) =>
        (
          catalog?.messages?.[tag]?.frontend as Record<string, Record<string, unknown>> | undefined
        )?.[kind]?.[key];
      const value = read(locale) ?? read(catalog?.default_locale ?? 'en-US');
      return typeof value === 'string' && value ? value : key;
    },
    [catalog, locale]
  );
  return { catalog, label };
}
