import {
  appCopyrightPreferences,
  defineOverridesPreferences,
  definePreferencesExtension,
} from '@vben/preferences';

interface WebAntdPreferencesExtension {
  defaultTableSize: number;
  enableFormFullscreen: boolean;
  reportTitle: string;
}

export const applicationWidgetPreferences = {
  logoutButtonPosition: 'user-dropdown',
  refreshButtonPosition: 'none',
} as const;

export const applicationBrandingPreferences = {
  app: {
    name: import.meta.env.VITE_APP_TITLE,
  },
  copyright: {
    companyName: 'go-cinch',
    companySiteLink: 'https://github.com/go-cinch/demos',
    date: String(new Date().getFullYear()),
  },
  logo: {
    source: `${import.meta.env.BASE_URL}go-cinch.svg`,
    sourceDark: `${import.meta.env.BASE_URL}go-cinch-white.svg`,
  },
};

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * !!! 更改配置后请清空缓存，否则可能不生效
 */
export const overridesPreferences = defineOverridesPreferences({
  // overrides
  app: {
    defaultHomePath: '/dashboard/overview',
    enableRefreshToken: true,
    locale: 'en-US',
    ...applicationBrandingPreferences.app,
  },
  copyright: {
    ...appCopyrightPreferences,
    ...applicationBrandingPreferences.copyright,
    icp: '',
    icpLink: '',
  },
  logo: applicationBrandingPreferences.logo,
  theme: {
    radius: '0.25',
  },
  widget: applicationWidgetPreferences,
});

export const preferencesExtension =
  definePreferencesExtension<WebAntdPreferencesExtension>({
    tabLabel: 'preferences.antd.tabLabel',
    title: 'preferences.antd.title',
    fields: [
      {
        component: 'switch',
        defaultValue: true,
        key: 'enableFormFullscreen',
        label: 'preferences.antd.fields.enableFormFullscreen.label',
        tip: 'preferences.antd.fields.enableFormFullscreen.tip',
      },
      {
        component: 'number',
        componentProps: {
          max: 200,
          min: 10,
          step: 10,
        },
        defaultValue: 20,
        key: 'defaultTableSize',
        label: 'preferences.antd.fields.defaultTableSize.label',
      },
      {
        component: 'input',
        defaultValue: '',
        key: 'reportTitle',
        label: 'preferences.antd.fields.reportTitle.label',
        placeholder: 'preferences.antd.fields.reportTitle.placeholder',
      },
    ],
  });
