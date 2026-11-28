import { createApp, watch, watchEffect } from 'vue';

import { registerAccessDirective } from '@vben/access';
import { registerLoadingDirective } from '@vben/common-ui/es/loading';
import { loadLocaleMessages, onLocaleSelected } from '@vben/locales';
import {
  onUserPreferencesChange,
  preferences,
  updatePreferences,
  updateUserPreferences,
} from '@vben/preferences';
import {
  initStores,
  setTimezoneHandler,
  useTabbarStore,
  useTimezoneStore,
  useUserStore,
} from '@vben/stores';
import { browserSession } from '@vben/stores/session';
import '@vben/styles';
import '@vben/styles/antd';
import { userCache } from '@vben/utils/cache';

import { useTitle } from '@vueuse/core';
import { message, Modal, notification } from 'ant-design-vue';

import { $t, loginPageLocale, setupI18n } from '#/locales';

import { initComponentAdapter } from './adapter/component';
import { initSetupVbenForm } from './adapter/form';
import { getTimezoneOptionsApi } from './api/core/timezones';
import App from './app.vue';
import { resetRoutes, router } from './router';
import { useAuthStore } from './store/auth';
import { clearLegacyLoginCredentials } from './store/login-account-history';
import { loadSystemProperties } from './store/system-properties';
import { initializeTimezonePreference } from './store/timezone-preference';
import { initializeUIPreferences } from './store/ui-preferences';

async function bootstrap(namespace: string) {
  clearLegacyLoginCredentials();
  // 初始化组件适配器
  await initComponentAdapter();

  // 初始化表单组件
  await initSetupVbenForm();

  // // 设置弹窗的默认配置
  // setDefaultModalProps({
  //   fullscreenButton: false,
  // });
  // // 设置抽屉的默认配置
  // setDefaultDrawerProps({
  //   zIndex: 1020,
  // });

  const app = createApp(App);

  // 注册v-loading指令
  registerLoadingDirective(app, {
    loading: 'loading', // 在这里可以自定义指令名称，也可以明确提供false表示不注册这个指令
    spinning: 'spinning',
  });

  // Public options use the request client, so initialize stores before i18n.
  await initStores(app, { namespace });
  let leavingSession = false;
  const invalidateExternalSession = () => {
    if (!leavingSession && browserSession.hasExpired()) {
      // A hard navigation also disposes kept-alive pages and outstanding dialogs.
      leavingSession = true;
      window.location.replace(router.resolve('/auth/login').href);
    }
  };
  window.addEventListener('storage', invalidateExternalSession);
  window.addEventListener('pageshow', invalidateExternalSession);
  window.addEventListener('focus', invalidateExternalSession);
  await setupI18n(app);
  userCache.onChange(() => {
    resetRoutes();
    Modal.destroyAll();
    message.destroy();
    notification.destroy();
    if (userCache.account === undefined) {
      updatePreferences({ app: { locale: loginPageLocale() } });
      initializeTimezonePreference();
      initializeUIPreferences();
    }
    void loadLocaleMessages(preferences.app.locale);
  });
  watch(
    () => useUserStore().userInfo,
    (info) => {
      if (info)
        useTabbarStore().retainAuthorizedTabs(
          new Set(['/profile', ...(info.roles ?? [])]),
        );
    },
    { flush: 'sync' },
  );
  const options = await loadSystemProperties();
  initializeTimezonePreference();
  initializeUIPreferences(options?.ui_preferences?.vben_pc);
  setTimezoneHandler({
    getTimezoneOptions: getTimezoneOptionsApi,
    getTimezone: async () =>
      preferences.app.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    setTimezone: async (timezone) => {
      updateUserPreferences({ app: { timezone } });
    },
  });
  const timezoneStore = useTimezoneStore();
  watch(
    () => preferences.app.timezone,
    (timezone) => timezoneStore.applyTimezone(timezone),
    { immediate: true },
  );
  onUserPreferencesChange((change) => {
    const timezone = change.preferences?.app?.timezone;
    if (typeof timezone === 'string' && timezone)
      useAuthStore().selectTimezone(timezone);
    useAuthStore().selectUIPreferences(change);
  });
  onLocaleSelected((locale) => useAuthStore().selectLanguage(locale));

  // 安装权限指令
  registerAccessDirective(app);

  // 初始化 tippy
  const { initTippy } = await import('@vben/common-ui/es/tippy');
  initTippy(app);

  // 配置路由及路由守卫
  app.use(router);

  // 配置Motion插件
  const { MotionPlugin } = await import('@vben/plugins/motion');
  app.use(MotionPlugin);

  // 动态更新标题
  watchEffect(() => {
    if (preferences.app.dynamicTitle) {
      const routeTitle = router.currentRoute.value.meta?.title;
      const pageTitle =
        (routeTitle ? `${$t(routeTitle)} - ` : '') + preferences.app.name;
      useTitle(pageTitle);
    }
  });

  app.mount('#app');
}

export { bootstrap };
