import { authSilentPublicRequestClient } from '#/api/request';

export interface I18nCatalog {
  group_order?: string[];
  default_locale: string;
  locales: { enabled: boolean; name: string; tag: string }[];
  messages: Record<string, { frontend?: Record<string, unknown> }>;
  schema_version: number;
}

export function getPublicI18nCatalogApi() {
  return authSilentPublicRequestClient.get<I18nCatalog>('/pub/i18n', {
    params: { f: 'default_locale,locales,group_order,frontend_messages' },
    timeout: 5000,
  });
}
