import type { Preferences } from '@vben/preferences';

import { preferences } from '@vben/preferences';
import { userCache } from '@vben/utils/cache';

interface LoginPagePreferences {
  app: Pick<Preferences['app'], 'authPageLayout' | 'locale' | 'timezone'>;
  theme: Pick<Preferences['theme'], 'builtinType' | 'colorPrimary' | 'mode'>;
}

const cacheKey = 'login-page-preferences';

export function getLoginPagePreferences() {
  return userCache.anonymous().get<LoginPagePreferences>(cacheKey);
}

export function rememberLoginPagePreferences() {
  const { authPageLayout, locale, timezone } = preferences.app;
  const { builtinType, colorPrimary, mode } = preferences.theme;
  // These values are for rendering the login page. Only manual choices become drafts.
  userCache.anonymous().set<LoginPagePreferences>(cacheKey, {
    app: { authPageLayout, locale, timezone },
    theme: { builtinType, colorPrimary, mode },
  });
}
