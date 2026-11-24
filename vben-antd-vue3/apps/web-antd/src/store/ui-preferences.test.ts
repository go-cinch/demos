import type { UIPreferences } from './ui-preferences-contract';

import { UnsecuredJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  apply: vi.fn(),
  custom: vi.fn(),
  defaults: vi.fn(),
}));
vi.mock('#/api/core/user', () => ({ updateUIPreferencesApi: mocks.save }));
vi.mock('@vben/preferences', () => ({
  preferencesManager: {
    getInitialPreferences: () => ({
      theme: { mode: 'auto', radius: '0.25', fontSize: 16 },
      sidebar: { collapsed: false },
    }),
  },
  getInitialCustomPreferences: () => ({
    reportTitle: '',
    defaultTableSize: 20,
    enableFormFullscreen: true,
  }),
  updatePreferences: mocks.apply,
  updateCustomPreferences: mocks.custom,
  setPreferenceDefaults: mocks.defaults,
}));

const base: UIPreferences = {
  theme: { mode: 'auto', radius: '0.25', font_size: 16 },
  custom: {
    report_title: '',
    default_table_size: 20,
    enable_form_fullscreen: true,
  },
  sidebar: { collapsed: false },
};
const current = () => true;
const result = (value: UIPreferences) => ({
  ui_preferences: { vben_pc: value },
});
async function setup() {
  const module = await import('./ui-preferences');
  module.initializeUIPreferences(base);
  return {
    ...module.createUIPreferenceSync(),
    initialize: module.initializeUIPreferences,
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
  mocks.save.mockResolvedValue(result(base));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('sparse account UI preferences', () => {
  it('applies dictionary/account defaults without turning either into user modifications', async () => {
    const sync = await setup();
    await sync.sync(
      { ...base, theme: { ...base.theme, mode: 'light' } },
      current,
      Date.now(),
      base,
    );
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ mode: 'light' }),
      }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it('hydrates every declared preference field from server metadata', async () => {
    const accountPreferences: UIPreferences = {
      app: {
        layout: 'full-content',
        watermark: true,
        dynamic_title: false,
        color_gray_mode: true,
        color_weak_mode: true,
        content_compact: 'compact',
        auth_page_layout: 'panel-left',
        watermark_content: 'Sample',
        enable_check_updates: false,
        enable_copy_preferences: false,
        preferences_button_position: 'fixed',
        enable_sticky_preferences_navigation_bar: false,
      },
      theme: {
        mode: 'light',
        radius: '0.75',
        font_size: 18,
        builtin_type: 'custom',
        color_primary: '#abcdef',
        semi_dark_header: true,
        semi_dark_sidebar: true,
        semi_dark_sidebar_sub: true,
      },
      sidebar: {
        width: 300,
        enable: false,
        hidden: true,
        collapsed: true,
        draggable: false,
        fixed_button: false,
        extra_collapse: true,
        expand_on_hover: false,
        collapsed_button: false,
        auto_activate_child: true,
        collapsed_show_title: true,
      },
      header: { mode: 'auto-scroll', enable: false, menu_align: 'center' },
      footer: { fixed: true, enable: true },
      breadcrumb: {
        enable: false,
        show_home: true,
        show_icon: false,
        style_type: 'background',
        hide_only_one: true,
      },
      navigation: { split: false, accordion: false, style_type: 'plain' },
      tabbar: {
        enable: false,
        persist: false,
        draggable: false,
        max_count: 0,
        show_icon: false,
        show_more: false,
        wheelable: false,
        style_type: 'card',
        show_maximize: false,
        visit_history: false,
        middle_click_to_close: true,
      },
      widget: {
        order: [
          'timezone',
          'globalSearch',
          'preferences',
          'themeToggle',
          'languageToggle',
          'fullscreen',
          'refresh',
          'notification',
          'lockScreenBtn',
          'logoutBtn',
        ],
        logout_button_position: 'header',
        refresh_button_position: 'header',
        timezone_button_position: 'user-dropdown',
        fullscreen_button_position: 'none',
        lock_screen_button_position: 'none',
        notification_button_position: 'none',
        theme_toggle_button_position: 'user-dropdown',
        global_search_button_position: 'none',
        language_toggle_button_position: 'none',
      },
      copyright: {
        icp: 'Sample-ICP',
        date: '2020-2026',
        enable: false,
        icp_link: 'https://example.com/icp',
        company_name: 'Sample Company',
        setting_show: false,
        company_site_link: 'https://example.com',
      },
      shortcut_keys: {
        enable: false,
        global_escape: true,
        global_logout: false,
        global_search: false,
        global_lock_screen: false,
      },
      transition: {
        name: 'fade-up',
        enable: false,
        loading: false,
        progress: false,
      },
      custom: {
        report_title: '',
        default_table_size: 50,
        enable_form_fullscreen: false,
      },
    };
    const sync = await setup();
    await sync.sync(accountPreferences, current, Date.now(), {
      ...base,
      tabbar: { max_count: 15 },
      custom: { ...base.custom, report_title: 'Default report' },
    });
    expect(mocks.apply).toHaveBeenLastCalledWith({
      app: {
        layout: 'full-content',
        watermark: true,
        dynamicTitle: false,
        colorGrayMode: true,
        colorWeakMode: true,
        contentCompact: 'compact',
        authPageLayout: 'panel-left',
        watermarkContent: 'Sample',
        enableCheckUpdates: false,
        enableCopyPreferences: false,
        preferencesButtonPosition: 'fixed',
        enableStickyPreferencesNavigationBar: false,
      },
      theme: {
        mode: 'light',
        radius: '0.75',
        fontSize: 18,
        builtinType: 'custom',
        colorPrimary: '#abcdef',
        semiDarkHeader: true,
        semiDarkSidebar: true,
        semiDarkSidebarSub: true,
      },
      sidebar: {
        width: 300,
        enable: false,
        hidden: true,
        collapsed: true,
        draggable: false,
        fixedButton: false,
        extraCollapse: true,
        expandOnHover: false,
        collapsedButton: false,
        autoActivateChild: true,
        collapsedShowTitle: true,
      },
      header: { mode: 'auto-scroll', enable: false, menuAlign: 'center' },
      footer: { fixed: true, enable: true },
      breadcrumb: {
        enable: false,
        showHome: true,
        showIcon: false,
        styleType: 'background',
        hideOnlyOne: true,
      },
      navigation: { split: false, accordion: false, styleType: 'plain' },
      tabbar: {
        enable: false,
        persist: false,
        draggable: false,
        maxCount: 0,
        showIcon: false,
        showMore: false,
        wheelable: false,
        styleType: 'card',
        showMaximize: false,
        visitHistory: false,
        middleClickToClose: true,
      },
      widget: {
        order: [
          'timezone',
          'globalSearch',
          'preferences',
          'themeToggle',
          'languageToggle',
          'fullscreen',
          'refresh',
          'notification',
          'lockScreenBtn',
          'logoutBtn',
        ],
        logoutButtonPosition: 'header',
        refreshButtonPosition: 'header',
        timezoneButtonPosition: 'user-dropdown',
        fullscreenButtonPosition: 'none',
        lockScreenButtonPosition: 'none',
        notificationButtonPosition: 'none',
        themeToggleButtonPosition: 'user-dropdown',
        globalSearchButtonPosition: 'none',
        languageToggleButtonPosition: 'none',
      },
      copyright: {
        icp: 'Sample-ICP',
        date: '2020-2026',
        enable: false,
        icpLink: 'https://example.com/icp',
        companyName: 'Sample Company',
        settingShow: false,
        companySiteLink: 'https://example.com',
      },
      shortcutKeys: {
        enable: false,
        globalEscape: true,
        globalLogout: false,
        globalSearch: false,
        globalLockScreen: false,
      },
      transition: {
        name: 'fade-up',
        enable: false,
        loading: false,
        progress: false,
      },
    });
    expect(mocks.custom).toHaveBeenLastCalledWith({
      reportTitle: '',
      defaultTableSize: 50,
      enableFormFullscreen: false,
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('debounces user edits and submits only changed fields, including false, zero, empty text and custom settings', async () => {
    const sync = await setup();
    sync.select(
      {
        preferences: {
          theme: { radius: '0.5' },
          sidebar: { collapsed: false },
          tabbar: { maxCount: 0 },
        },
      },
      true,
      current,
    );
    sync.select(
      { custom: { reportTitle: '', defaultTableSize: 40 } },
      true,
      current,
    );
    expect(mocks.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      theme: { radius: '0.5' },
      sidebar: { collapsed: false },
      tabbar: { max_count: 0 },
      custom: { report_title: '', default_table_size: 40 },
    });
  });
  it('keeps per-field timestamps and overrides only anonymous choices still valid at successful login', async () => {
    const sync = await setup();
    sync.select({ preferences: { theme: { radius: '0.5' } } }, false, current);
    vi.setSystemTime(Date.now() + 86_400_000);
    sync.select({ preferences: { theme: { fontSize: 18 } } }, false, current);
    vi.setSystemTime(Date.now() + 1);
    const acceptedAt = Date.now();
    vi.setSystemTime(Date.now() + 60_000);
    await sync.sync(base, current, acceptedAt, base);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      theme: { font_size: 18 },
    });
    // An expired field is never submitted again after reload.
    sync.initialize(base);
    expect(sessionStorage.length).toBe(0);
  });
  it('keeps a pending anonymous choice across reload and failed writes, and consumes it on successful retry', async () => {
    const sync = await setup();
    sync.select({ preferences: { theme: { mode: 'light' } } }, false, current);
    vi.resetModules();
    const reloaded = await setup();
    mocks.save.mockRejectedValueOnce(new Error('offline'));
    await expect(
      reloaded.sync(base, current, Date.now(), base),
    ).rejects.toThrow('offline');
    expect(sessionStorage.length).toBe(1);
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ mode: 'light' }),
      }),
    );
    await reloaded.flush();
    expect(sessionStorage.length).toBe(0);
  });
  it('preserves newer local edits while an older response arrives, then writes in order', async () => {
    const sync = await setup();
    let finish!: (value: ReturnType<typeof result>) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    sync.select({ preferences: { theme: { mode: 'light' } } }, true, current);
    const saving = sync.flush();
    sync.select({ preferences: { theme: { mode: 'dark' } } }, true, current);
    finish(result({ ...base, theme: { ...base.theme, mode: 'light' } }));
    await saving;
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ mode: 'dark' }),
      }),
    );
    await sync.flush();
    expect(mocks.save.mock.calls).toEqual([
      [{ theme: { mode: 'light' } }],
      [{ theme: { mode: 'dark' } }],
    ]);
  });
  it('keeps an in-flight local edit visible when an earlier profile snapshot arrives', async () => {
    const sync = await setup();
    let finish!: (value: ReturnType<typeof result>) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    sync.select({ preferences: { theme: { mode: 'light' } } }, true, current);
    const saving = sync.flush();
    const restoring = sync.sync(base, current, Date.now(), base);
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ mode: 'light' }),
      }),
    );
    finish(result({ ...base, theme: { ...base.theme, mode: 'light' } }));
    await Promise.all([saving, restoring]);
  });

  it('clears only the current client through a reset and preserves edits made immediately afterwards', async () => {
    const sync = await setup();
    sync.select({ reset: true }, true, current);
    sync.select({ custom: { reportTitle: 'new' } }, true, current);
    await sync.flush();
    expect(mocks.save.mock.calls).toEqual([
      [null],
      [{ custom: { report_title: 'new' } }],
    ]);
  });
  it('does not queue language or technical application settings as UI overrides', async () => {
    const sync = await setup();
    sync.select(
      {
        preferences: {
          app: {
            locale: 'zh-CN',
            timezone: 'Asia/Tokyo',
            isMobile: true,
            accessMode: 'frontend',
          },
        },
      },
      true,
      current,
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not apply an old session response or send its queued changes after an account switch', async () => {
    const sync = await setup();
    let finish!: (value: ReturnType<typeof result>) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    sync.select({ preferences: { theme: { mode: 'light' } } }, true, current);
    const pending = sync.flush();
    sync.select({ custom: { reportTitle: 'old account' } }, true, current);
    sync.reset();
    mocks.apply.mockClear();
    finish(result(base));
    await pending;
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('retries a failed login-page choice only under its original account after a direct switch', async () => {
    const { bindSessionCache, releaseSessionCache } =
      await import('./session-cache');
    const token = (id: string) =>
      new UnsecuredJWT({ code: 'users' }).setSubject(id).encode();
    const sync = await setup();
    sync.select({ preferences: { theme: { mode: 'light' } } }, false, current);
    bindSessionCache(token('1'));
    mocks.save.mockRejectedValueOnce(new Error('offline'));
    await expect(sync.sync(base, current, Date.now(), base)).rejects.toThrow(
      'offline',
    );
    sync.reset();
    releaseSessionCache();
    bindSessionCache(token('2'));
    mocks.save.mockClear();
    await sync.sync(base, current, Date.now(), base);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ mode: 'auto' }),
      }),
    );
    vi.resetModules();
    const sessionCache = await import('./session-cache');
    sessionCache.bindSessionCache(token('1'));
    const preferences = await setup();
    await preferences.sync(base, current, Date.now(), base);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      theme: { mode: 'light' },
    });
    expect(localStorage.length).toBe(0);
  });
  it('keeps preferences usable when browser storage is blocked', async () => {
    const sync = await setup();
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    try {
      sync.select({ custom: { reportTitle: 'local' } }, false, current);
      await sync.sync(base, current, Date.now(), base);
      expect(mocks.save).toHaveBeenCalledWith({
        custom: { report_title: 'local' },
      });
    } finally {
      storage.mockRestore();
    }
  });
});
