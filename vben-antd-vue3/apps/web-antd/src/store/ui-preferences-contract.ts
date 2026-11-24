import type {
  CustomPreferencesRecord,
  Preferences,
  UserPreferenceChange,
} from '@vben/preferences';

import {
  getInitialCustomPreferences,
  preferencesManager,
  setPreferenceDefaults,
  updateCustomPreferences,
  updatePreferences,
} from '@vben/preferences';

export type PreferenceValue = boolean | number | string | string[];
export type UIPreferences = Record<string, Record<string, PreferenceValue>>;
export type UIPreferencePatch = Record<
  string,
  null | Record<string, null | PreferenceValue>
>;

// Explicit API contract: snake_case on the wire; Vben's existing names stay inside its runtime.
export const preferenceFields = {
  'app.dynamic_title': ['app', 'dynamicTitle'],
  'app.layout': ['app', 'layout'],
  'app.color_gray_mode': ['app', 'colorGrayMode'],
  'app.color_weak_mode': ['app', 'colorWeakMode'],
  'app.content_compact': ['app', 'contentCompact'],
  'app.watermark': ['app', 'watermark'],
  'app.watermark_content': ['app', 'watermarkContent'],
  'app.enable_check_updates': ['app', 'enableCheckUpdates'],
  'app.enable_copy_preferences': ['app', 'enableCopyPreferences'],
  'app.enable_sticky_preferences_navigation_bar': [
    'app',
    'enableStickyPreferencesNavigationBar',
  ],
  'app.preferences_button_position': ['app', 'preferencesButtonPosition'],
  'app.auth_page_layout': ['app', 'authPageLayout'],
  'transition.progress': ['transition', 'progress'],
  'transition.name': ['transition', 'name'],
  'transition.loading': ['transition', 'loading'],
  'transition.enable': ['transition', 'enable'],
  'theme.color_primary': ['theme', 'colorPrimary'],
  'theme.builtin_type': ['theme', 'builtinType'],
  'theme.mode': ['theme', 'mode'],
  'theme.radius': ['theme', 'radius'],
  'theme.font_size': ['theme', 'fontSize'],
  'theme.semi_dark_sidebar': ['theme', 'semiDarkSidebar'],
  'theme.semi_dark_sidebar_sub': ['theme', 'semiDarkSidebarSub'],
  'theme.semi_dark_header': ['theme', 'semiDarkHeader'],
  'sidebar.enable': ['sidebar', 'enable'],
  'sidebar.width': ['sidebar', 'width'],
  'sidebar.draggable': ['sidebar', 'draggable'],
  'sidebar.collapsed': ['sidebar', 'collapsed'],
  'sidebar.collapsed_show_title': ['sidebar', 'collapsedShowTitle'],
  'sidebar.auto_activate_child': ['sidebar', 'autoActivateChild'],
  'sidebar.expand_on_hover': ['sidebar', 'expandOnHover'],
  'sidebar.collapsed_button': ['sidebar', 'collapsedButton'],
  'sidebar.fixed_button': ['sidebar', 'fixedButton'],
  'sidebar.hidden': ['sidebar', 'hidden'],
  'sidebar.extra_collapse': ['sidebar', 'extraCollapse'],
  'header.enable': ['header', 'enable'],
  'header.mode': ['header', 'mode'],
  'header.menu_align': ['header', 'menuAlign'],
  'breadcrumb.enable': ['breadcrumb', 'enable'],
  'breadcrumb.show_icon': ['breadcrumb', 'showIcon'],
  'breadcrumb.show_home': ['breadcrumb', 'showHome'],
  'breadcrumb.style_type': ['breadcrumb', 'styleType'],
  'breadcrumb.hide_only_one': ['breadcrumb', 'hideOnlyOne'],
  'tabbar.enable': ['tabbar', 'enable'],
  'tabbar.show_icon': ['tabbar', 'showIcon'],
  'tabbar.show_more': ['tabbar', 'showMore'],
  'tabbar.show_maximize': ['tabbar', 'showMaximize'],
  'tabbar.persist': ['tabbar', 'persist'],
  'tabbar.visit_history': ['tabbar', 'visitHistory'],
  'tabbar.draggable': ['tabbar', 'draggable'],
  'tabbar.wheelable': ['tabbar', 'wheelable'],
  'tabbar.style_type': ['tabbar', 'styleType'],
  'tabbar.max_count': ['tabbar', 'maxCount'],
  'tabbar.middle_click_to_close': ['tabbar', 'middleClickToClose'],
  'navigation.style_type': ['navigation', 'styleType'],
  'navigation.split': ['navigation', 'split'],
  'navigation.accordion': ['navigation', 'accordion'],
  'footer.enable': ['footer', 'enable'],
  'footer.fixed': ['footer', 'fixed'],
  'copyright.setting_show': ['copyright', 'settingShow'],
  'copyright.enable': ['copyright', 'enable'],
  'copyright.company_name': ['copyright', 'companyName'],
  'copyright.company_site_link': ['copyright', 'companySiteLink'],
  'copyright.date': ['copyright', 'date'],
  'copyright.icp': ['copyright', 'icp'],
  'copyright.icp_link': ['copyright', 'icpLink'],
  'shortcut_keys.enable': ['shortcutKeys', 'enable'],
  'shortcut_keys.global_search': ['shortcutKeys', 'globalSearch'],
  'shortcut_keys.global_logout': ['shortcutKeys', 'globalLogout'],
  'shortcut_keys.global_escape': ['shortcutKeys', 'globalEscape'],
  'shortcut_keys.global_lock_screen': ['shortcutKeys', 'globalLockScreen'],
  'widget.global_search_button_position': [
    'widget',
    'globalSearchButtonPosition',
  ],
  'widget.fullscreen_button_position': ['widget', 'fullscreenButtonPosition'],
  'widget.language_toggle_button_position': [
    'widget',
    'languageToggleButtonPosition',
  ],
  'widget.notification_button_position': [
    'widget',
    'notificationButtonPosition',
  ],
  'widget.theme_toggle_button_position': [
    'widget',
    'themeToggleButtonPosition',
  ],
  'widget.lock_screen_button_position': ['widget', 'lockScreenButtonPosition'],
  'widget.logout_button_position': ['widget', 'logoutButtonPosition'],
  'widget.order': ['widget', 'order'],
  'widget.refresh_button_position': ['widget', 'refreshButtonPosition'],
  'widget.timezone_button_position': ['widget', 'timezoneButtonPosition'],
  'custom.enable_form_fullscreen': ['custom', 'enableFormFullscreen'],
  'custom.default_table_size': ['custom', 'defaultTableSize'],
  'custom.report_title': ['custom', 'reportTitle'],
} as const;

export function flattenPreferences(value: UIPreferencePatch | UIPreferences) {
  const result: Record<string, null | PreferenceValue> = {};
  for (const path of Object.keys(preferenceFields)) {
    const [group, field] = path.split('.') as [string, string];
    const entry = value[group]?.[field];
    if (Object.hasOwn(value, group) && value[group] === null)
      result[path] = null;
    else if (entry !== undefined && Object.hasOwn(value[group] ?? {}, field))
      result[path] = entry;
  }
  return result;
}

export function expandPreferences(
  values: Record<string, null | PreferenceValue>,
): UIPreferencePatch {
  const result: UIPreferencePatch = {};
  for (const [path, value] of Object.entries(values)) {
    if (!Object.hasOwn(preferenceFields, path)) continue;
    const [group, field] = path.split('.') as [string, string];
    (result[group] ??= {})[field] = value;
  }
  return result;
}

export function userPreferencePatch(
  change: UserPreferenceChange,
): UIPreferencePatch {
  const input = { ...change.preferences, custom: change.custom } as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const flat: Record<string, PreferenceValue> = {};
  for (const [wire, [group, field]] of Object.entries(preferenceFields)) {
    const item = input[group]?.[field];
    if (
      typeof item === 'boolean' ||
      typeof item === 'string' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      flat[wire] = item;
    else if (
      Array.isArray(item) &&
      item.every((value) => typeof value === 'string')
    )
      flat[wire] = [...item];
  }
  return expandPreferences(flat);
}

function runtimePreferences(value: UIPreferences) {
  const runtime: Record<string, Record<string, PreferenceValue>> = {};
  for (const [wire, [group, field]] of Object.entries(preferenceFields)) {
    const [section, key] = wire.split('.') as [string, string];
    const item = value[section]?.[key];
    if (item !== undefined && item !== null)
      (runtime[group] ??= {})[field] = item;
  }
  const { custom = {}, ...main } = runtime;
  return {
    main: main as Partial<Preferences>,
    custom: custom as CustomPreferencesRecord,
  };
}

export function applyUIPreferences(value: UIPreferences) {
  const { main, custom } = runtimePreferences(value);
  updatePreferences(main);
  updateCustomPreferences(custom);
}

export function setUIDefaults(value: UIPreferences) {
  const { main, custom } = runtimePreferences(value);
  setPreferenceDefaults(main, custom);
}

export function bundledUIDefaults(): UIPreferences {
  return userPreferencePatch({
    preferences: preferencesManager.getInitialPreferences(),
    custom: getInitialCustomPreferences(),
  }) as UIPreferences;
}

export function overlayPreferences(
  base: UIPreferences,
  patch: UIPreferencePatch,
  defaults: UIPreferences,
): UIPreferences {
  const result = structuredClone(base);
  for (const [path, value] of Object.entries(flattenPreferences(patch))) {
    const [group, key] = path.split('.') as [string, string];
    const next = value ?? defaults[group]?.[key];
    if (next !== undefined) (result[group] ??= {})[key] = next;
  }
  return result;
}
