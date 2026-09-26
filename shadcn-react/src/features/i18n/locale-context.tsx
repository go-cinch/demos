'use client';

import * as React from 'react';

export type Locale = 'zh-CN' | 'en-US';

const messages = {
  'zh-CN': {
    dashboard: '概览',
    overview: '概览',
    workspace: '工作台',
    system: '系统管理',
    users: '用户管理',
    roles: '角色管理',
    groups: '用户组管理',
    actions: '权限管理',
    dictionaries: '数据字典',
    whitelist: '白名单管理',
    profile: '个人中心',
    logout: '退出登录',
    search: '搜索',
    create: '新建',
    edit: '编辑',
    delete: '删除',
    cancel: '取消',
    save: '保存',
    refresh: '刷新',
    previous: '上一页',
    next: '下一页',
    total: '共 {count} 条',
    language: '语言'
  },
  'en-US': {
    dashboard: 'Dashboard',
    overview: 'Overview',
    workspace: 'Workspace',
    system: 'System',
    users: 'Users',
    roles: 'Roles',
    groups: 'User Groups',
    actions: 'Actions',
    dictionaries: 'Data Dictionary',
    whitelist: 'Whitelist',
    profile: 'Profile',
    logout: 'Sign out',
    search: 'Search',
    create: 'Create',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    refresh: 'Refresh',
    previous: 'Previous',
    next: 'Next',
    total: '{count} records',
    language: 'Language'
  }
} as const;

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  timezone: string;
  setTimezone: (timezone: string) => void;
  pick: (english: string, chinese: string) => string;
  t: (key: keyof (typeof messages)['en-US'], params?: Record<string, string | number>) => string;
}

const LocaleContext = React.createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>('zh-CN');
  const [timezone, setTimezoneState] = React.useState('local');
  React.useEffect(() => {
    const saved = localStorage.getItem('go-cinch-locale');
    // oxlint-disable-next-line react/set-state-in-effect -- hydrate browser-only locale preference after mount
    if (saved === 'en-US' || saved === 'zh-CN') {
      document.documentElement.lang = saved;
      // oxlint-disable-next-line react/set-state-in-effect -- hydrate browser-only locale preference after mount
      setLocaleState(saved);
    }
    const savedTimezone = localStorage.getItem('go-cinch-timezone');
    // oxlint-disable-next-line react/set-state-in-effect -- hydrate browser-only timezone preference after mount
    if (savedTimezone) setTimezoneState(savedTimezone);
  }, []);
  const setLocale = React.useCallback((next: Locale) => {
    localStorage.setItem('go-cinch-locale', next);
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);
  const setTimezone = React.useCallback((next: string) => {
    localStorage.setItem('go-cinch-timezone', next);
    setTimezoneState(next);
  }, []);
  const t = React.useCallback<LocaleValue['t']>(
    (key, params) => {
      let value: string = messages[locale][key];
      for (const [name, replacement] of Object.entries(params ?? {})) {
        value = value.replace(`{${name}}`, String(replacement));
      }
      return value;
    },
    [locale]
  );
  const pick = React.useCallback(
    (english: string, chinese: string) => (locale === 'zh-CN' ? chinese : english),
    [locale]
  );
  return (
    <LocaleContext.Provider value={{ locale, setLocale, timezone, setTimezone, pick, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = React.useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
