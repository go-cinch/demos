import { apiRequest } from '@/api/client';
import i18n from './index';
let pending: Promise<void> | undefined;
export function refreshCatalogMessages() {
  if (!pending) pending = apiRequest<{ messages?: Record<string, { frontend?: Record<string, unknown> }>; frontend_messages?: Record<string, Record<string, unknown>> }>('/dictionary/pub/i18n?f=default_locale,locales,group_order,frontend_messages', { auth: false })
    .then(catalog => {
      for (const [code, locale] of [['en', 'en-US'], ['zh', 'zh-CN']]) {
        const messages = catalog.frontend_messages?.[locale] ?? catalog.messages?.[locale]?.frontend;
        if (messages) i18n.addResourceBundle(code, 'common', messages, true, true);
      }
    }).finally(() => { pending = undefined; });
  return pending;
}
