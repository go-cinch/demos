import type { App, Component } from 'vue';

import type {
  CustomPreferencesField,
  CustomPreferencesRecord,
} from '@vben/preferences';

import { createApp, h, nextTick, reactive } from 'vue';

import {
  onUserPreferencesChange,
  preferences,
  updatePreferences,
} from '@vben/preferences';

import { afterEach, expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import LayoutHeader from '../../basic/header/header.vue';
import UserDropdown from '../user-dropdown/user-dropdown.vue';
import Custom from './blocks/custom/custom.vue';
import Animation from './blocks/general/animation.vue';
import General from './blocks/general/general.vue';
import Breadcrumb from './blocks/layout/breadcrumb.vue';
import Header from './blocks/layout/header.vue';
import Navigation from './blocks/layout/navigation.vue';
import Sidebar from './blocks/layout/sidebar.vue';
import Tabbar from './blocks/layout/tabbar.vue';
import Widget from './blocks/layout/widget.vue';
import FontSize from './blocks/theme/font-size.vue';
import Radius from './blocks/theme/radius.vue';
import Preferences from './preferences.vue';

vi.mock('@vben/locales', async (original) => ({
  ...(await original<typeof import('@vben/locales')>()),
  $t: (key: string) => key,
  $placeholder: (key: string) => key,
}));
vi.mock('@vben/icons', async (original) => ({
  ...(await original<typeof import('@vben/icons')>()),
  createIconifyIcon: () => () => h('svg'),
}));
vi.mock('@vben/stores', async (original) => ({
  ...(await original<typeof import('@vben/stores')>()),
  useAccessStore: () => ({ accessMenus: [] }),
  useTimezoneStore: () => ({ options: [], timezone: 'Etc/UTC' }),
}));
vi.mock('@vben/hooks', async (original) => ({
  ...(await original<typeof import('@vben/hooks')>()),
  useRefresh: () => ({ refresh: vi.fn() }),
}));

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
});

function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render });
  app.mount(host);
  return host;
}

function mountModels(component: Component, initial: Record<string, unknown>) {
  app?.unmount();
  document.body.replaceChildren();
  const state = reactive({ ...initial });
  const update = vi.fn();
  const listeners = Object.fromEntries(
    Object.keys(initial).map((key) => [
      `onUpdate:${key}`,
      (value: unknown) => {
        update({ [key]: value });
        state[key] = value;
      },
    ]),
  );
  const host = mount(() => h(component, { ...state, ...listeners }));
  return { host, state, update };
}

function element<T extends Element>(root: ParentNode, selector: string): T {
  const target = root.querySelector<T>(selector);
  expect(target, selector).not.toBeNull();
  return required(target);
}

function toggle(root: ParentNode, caption: string) {
  const control = [
    ...root.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
  ].find(
    (candidate) => candidate.parentElement?.textContent?.trim() === caption,
  );
  expect(control, caption).toBeDefined();
  return required(control);
}

async function text(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

function button(host: ParentNode, label: string) {
  const matched = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent?.trim() === label,
  );
  expect(matched, label).toBeDefined();
  return required(matched);
}

async function option(trigger: HTMLElement, label: string) {
  trigger.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  const selected = await vi.waitFor(() => {
    const match = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((item) => item.textContent?.trim() === label);
    expect(match, label).toBeDefined();
    return required(match);
  });
  selected.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await nextTick();
}

it('renders each widget at its selected header or user-dropdown position', async () => {
  const supported = [
    [
      'globalSearchButtonPosition',
      'global-search',
      'preferences.widget.globalSearch',
    ],
    ['themeToggleButtonPosition', 'theme-toggle', 'preferences.theme.title'],
    [
      'languageToggleButtonPosition',
      'language-toggle',
      'preferences.widget.languageToggle',
    ],
    ['timezoneButtonPosition', 'timezone', 'ui.widgets.timezone.setTimezone'],
    ['fullscreenButtonPosition', 'fullscreen', 'preferences.widget.fullscreen'],
    ['refreshButtonPosition', 'refresh', 'preferences.widget.refresh'],
    [
      'notificationButtonPosition',
      'notification',
      'preferences.widget.notification',
    ],
    [
      'lockScreenButtonPosition',
      'lock-screen-btn',
      'ui.widgets.lockScreen.title',
    ],
    ['logoutButtonPosition', 'logout-btn', 'common.logout'],
  ] as const;
  const controls = [
    ...supported.map(([, slot, label]) => [slot, label] as const),
    ['preferences', 'preferences.title'] as const,
  ];
  const previous = {
    app: { ...preferences.app },
    header: { ...preferences.header },
    shortcutKeys: { ...preferences.shortcutKeys },
    widget: { ...preferences.widget, order: [...preferences.widget.order] },
  };
  try {
    for (const [position, menuAlign] of [
      ['header', 'start'],
      ['user-dropdown', 'center'],
      ['none', 'end'],
    ] as const) {
      app?.unmount();
      document.body.replaceChildren();
      updatePreferences({
        app: { enablePreferences: true, preferencesButtonPosition: position },
        header: { menuAlign },
        shortcutKeys: { enable: false },
        widget: {
          globalSearch: true,
          themeToggle: true,
          languageToggle: true,
          timezone: true,
          fullscreen: true,
          refresh: true,
          notification: true,
          lockScreen: true,
          ...Object.fromEntries(supported.map(([field]) => [field, position])),
        },
      });
      const headerSlots = Object.fromEntries(
        controls.map(([slot]) => [
          slot,
          () => h('button', { 'data-header-slot': slot }, slot),
        ]),
      );
      const host = mount(() =>
        h('div', [
          h(LayoutHeader, {}, { ...headerSlots, 'user-dropdown': () => null }),
          h(UserDropdown, { text: 'Preference operator' }),
        ]),
      );
      expect(host.querySelector(`.menu-align-${menuAlign}`)).not.toBeNull();
      for (const [slot] of controls)
        expect(
          Boolean(host.querySelector(`[data-header-slot="${slot}"]`)),
          slot,
        ).toBe(position === 'header');
      const trigger = element<HTMLButtonElement>(
        host,
        '[data-testid="user-avatar"]',
      );
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      const menu = await vi.waitFor(() =>
        element<HTMLElement>(document.body, '[role="menu"]'),
      );
      const labels = new Set(
        [...menu.querySelectorAll('[role="menuitem"]')].map((item) =>
          item.textContent?.trim(),
        ),
      );
      for (const [, label] of controls)
        expect(labels.has(label), label).toBe(position === 'user-dropdown');
    }
  } finally {
    updatePreferences(previous);
  }
});

it('emits every tab and widget field without mutating sibling preferences', async () => {
  const tabFlags = [
    ['tabbarEnable', 'enable'],
    ['tabbarPersist', 'persist'],
    ['tabbarVisitHistory', 'visitHistory'],
    ['tabbarDraggable', 'draggable'],
    ['tabbarWheelable', 'wheelable'],
    ['tabbarMiddleClickToClose', 'middleClickClose'],
    ['tabbarShowIcon', 'icon'],
    ['tabbarShowMore', 'showMore'],
    ['tabbarShowMaximize', 'showMaximize'],
  ] as const;
  const tabs = mountModels(Tabbar, {
    disabled: false,
    tabbarStyleType: 'chrome',
    tabbarMaxCount: 15,
    ...Object.fromEntries(tabFlags.map(([field]) => [field, true])),
  });
  for (const [field, label] of tabFlags) {
    const control = toggle(tabs.host, `preferences.tabbar.${label}`);
    for (const checked of [false, true]) {
      control.click();
      await nextTick();
      expect(tabs.update).toHaveBeenLastCalledWith({ [field]: checked });
      expect(control.getAttribute('aria-checked')).toBe(String(checked));
    }
  }
  const maxCount = element<HTMLInputElement>(tabs.host, 'input');
  for (const maximum of [0, 15, 30]) {
    await text(maxCount, String(maximum));
    maxCount.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await nextTick();
    expect(tabs.update).toHaveBeenLastCalledWith({ tabbarMaxCount: maximum });
    expect(maxCount.value).toBe(String(maximum));
  }
  const styleSelector = () =>
    element<HTMLElement>(tabs.host, '[role="combobox"]');
  for (const style of ['brisk', 'card', 'chrome', 'plain']) {
    await option(styleSelector(), `preferences.tabbar.styleType.${style}`);
    expect(tabs.update).toHaveBeenLastCalledWith({ tabbarStyleType: style });
    await vi.waitFor(() =>
      expect(styleSelector().textContent).toContain(
        `preferences.tabbar.styleType.${style}`,
      ),
    );
  }
  expect(tabs.state.tabbarMaxCount).toBe(30);

  const widgetFields = [
    [
      'globalSearch',
      'widgetGlobalSearchButtonPosition',
      'preferences.widget.globalSearch',
    ],
    ['preferences', 'appPreferencesButtonPosition', 'preferences.title'],
    [
      'themeToggle',
      'widgetThemeToggleButtonPosition',
      'preferences.widget.themeToggle',
    ],
    [
      'languageToggle',
      'widgetLanguageToggleButtonPosition',
      'preferences.widget.languageToggle',
    ],
    ['timezone', 'widgetTimezoneButtonPosition', 'preferences.widget.timezone'],
    [
      'fullscreen',
      'widgetFullscreenButtonPosition',
      'preferences.widget.fullscreen',
    ],
    ['refresh', 'widgetRefreshButtonPosition', 'preferences.widget.refresh'],
    [
      'notification',
      'widgetNotificationButtonPosition',
      'preferences.widget.notification',
    ],
    [
      'lockScreenBtn',
      'widgetLockScreenButtonPosition',
      'ui.widgets.lockScreen.title',
    ],
    ['logoutBtn', 'widgetLogoutButtonPosition', 'common.logout'],
  ] as const;
  const widgets = mountModels(Widget, {
    widgetOrder: widgetFields.map(([key]) => key),
    ...Object.fromEntries(widgetFields.map(([, field]) => [field, 'header'])),
  });
  const values = [
    ['user-dropdown', 'preferences.widget.userDropdown'],
    ['none', 'common.notShow'],
    ['header', 'preferences.widget.header'],
  ] as const;
  for (const [key, field, caption] of widgetFields) {
    const dropdown = () => {
      const label = [...widgets.host.querySelectorAll('span')].find(
        (span) =>
          span.textContent?.trim() === caption &&
          span.closest('div')?.querySelector('[role="combobox"]'),
      );
      expect(label, caption).toBeDefined();
      return element<HTMLElement>(
        required(required(label).closest('div')),
        '[role="combobox"]',
      );
    };
    const entries =
      key === 'preferences'
        ? ([
            ['user-dropdown', 'preferences.position.userDropdown'],
            ['none', 'common.notShow'],
            ['header', 'preferences.position.header'],
            ['fixed', 'preferences.position.fixed'],
            ['auto', 'preferences.position.auto'],
          ] as const)
        : values;
    for (const [position, label] of entries) {
      const before = Object.fromEntries(
        widgetFields.map(([, preference]) => [
          preference,
          widgets.state[preference],
        ]),
      );
      widgets.update.mockClear();
      await option(dropdown(), label);
      expect(widgets.update).toHaveBeenCalledWith({ [field]: position });
      expect(widgets.state).toMatchObject({ ...before, [field]: position });
      await vi.waitFor(() => expect(dropdown().textContent).toContain(label));
    }
  }
});

it('maps navigation, sidebar, breadcrumb and header controls to the rendered layout', async () => {
  const nav = mountModels(Navigation, {
    disabled: false,
    disabledNavigationSplit: true,
    navigationStyleType: 'rounded',
    navigationSplit: true,
    navigationAccordion: false,
  });
  const change = async (
    target: typeof nav,
    model: string,
    value: unknown,
    action: HTMLElement,
  ) => {
    action.click();
    await nextTick();
    expect(target.update).toHaveBeenLastCalledWith({ [model]: value });
    expect(target.state[model]).toEqual(value);
  };
  const disabled = (control: HTMLElement) =>
    control.parentElement?.classList.contains('pointer-events-none');
  for (const style of ['plain', 'rounded'])
    await change(
      nav,
      'navigationStyleType',
      style,
      button(nav.host, `preferences.${style}`),
    );
  const split = toggle(nav.host, 'preferences.navigationMenu.split');
  expect(disabled(split)).toBe(true);
  nav.state.disabledNavigationSplit = false;
  await nextTick();
  expect(disabled(split)).toBe(false);
  await change(nav, 'navigationSplit', false, split);
  await change(
    nav,
    'navigationAccordion',
    true,
    toggle(nav.host, 'preferences.navigationMenu.accordion'),
  );

  const breadcrumb = mountModels(Breadcrumb, {
    disabled: false,
    breadcrumbEnable: true,
    breadcrumbShowIcon: true,
    breadcrumbShowHome: false,
    breadcrumbHideOnlyOne: false,
    breadcrumbStyleType: 'normal',
  });
  const crumb = (key: string) =>
    toggle(breadcrumb.host, `preferences.breadcrumb.${key}`);
  await change(breadcrumb, 'breadcrumbShowHome', true, crumb('home'));
  await change(breadcrumb, 'breadcrumbShowIcon', false, crumb('icon'));
  expect(disabled(crumb('home'))).toBe(true);
  await change(breadcrumb, 'breadcrumbShowIcon', true, crumb('icon'));
  expect(disabled(crumb('home'))).toBe(false);
  await change(breadcrumb, 'breadcrumbHideOnlyOne', true, crumb('hideOnlyOne'));
  await change(
    breadcrumb,
    'breadcrumbStyleType',
    'background',
    button(breadcrumb.host, 'preferences.breadcrumb.background'),
  );
  await change(
    breadcrumb,
    'breadcrumbStyleType',
    'normal',
    button(breadcrumb.host, 'preferences.normal'),
  );
  await change(breadcrumb, 'breadcrumbEnable', false, crumb('enable'));
  expect(
    ['hideOnlyOne', 'home', 'icon'].every((key) => disabled(crumb(key))),
  ).toBe(true);

  const sidebar = mountModels(Sidebar, {
    currentLayout: 'sidebar-nav',
    disabled: false,
    sidebarEnable: true,
    sidebarDraggable: true,
    sidebarCollapsed: false,
    sidebarExpandOnHover: false,
    sidebarCollapsedShowTitle: false,
    sidebarAutoActivateChild: false,
    sidebarCollapsedButton: false,
    sidebarFixedButton: false,
    sidebarWidth: 224,
  });
  const side = (key: string) =>
    toggle(sidebar.host, `preferences.sidebar.${key}`);
  expect(disabled(side('collapsedShowTitle'))).toBe(true);
  expect(disabled(side('expandOnHover'))).toBe(true);
  await change(sidebar, 'sidebarCollapsed', true, side('collapsed'));
  await change(
    sidebar,
    'sidebarCollapsedShowTitle',
    true,
    side('collapsedShowTitle'),
  );
  await change(sidebar, 'sidebarExpandOnHover', true, side('expandOnHover'));
  expect(disabled(side('autoActivateChild'))).toBe(true);
  sidebar.state.currentLayout = 'sidebar-mixed-nav';
  await nextTick();
  expect(disabled(side('autoActivateChild'))).toBe(false);
  await change(
    sidebar,
    'sidebarAutoActivateChild',
    true,
    side('autoActivateChild'),
  );
  for (const [field, label, sibling] of [
    ['sidebarCollapsedButton', 'buttonCollapsed', 'sidebarFixedButton'],
    ['sidebarFixedButton', 'buttonFixed', 'sidebarCollapsedButton'],
  ] as const) {
    for (const checked of [true, false]) {
      await change(
        sidebar,
        field,
        checked,
        button(sidebar.host, `preferences.sidebar.${label}`),
      );
      expect(sidebar.state[sibling]).toBe(false);
    }
  }
  await change(sidebar, 'sidebarEnable', false, side('visible'));
  expect(
    [
      'collapsed',
      'draggable',
      'autoActivateChild',
      'expandOnHover',
      'collapsedShowTitle',
    ].every((key) => disabled(side(key))),
  ).toBe(true);
  expect(sidebar.state).toMatchObject({
    sidebarDraggable: true,
    sidebarWidth: 224,
  });
});

it('emits every radius font alignment and transition value from rendered controls', async () => {
  const radius = mountModels(Radius, { modelValue: '0.25' });
  for (const value of ['0', '0.25', '0.5', '0.75', '1']) {
    button(radius.host, value).click();
    await nextTick();
    expect(radius.update).toHaveBeenLastCalledWith({ modelValue: value });
    expect(button(radius.host, value).dataset.state).toBe('on');
  }
  expect(
    button(mountModels(Radius, radius.state).host, '1').dataset.state,
  ).toBe('on');

  const font = mountModels(FontSize, { modelValue: 16 });
  const size = element<HTMLInputElement>(font.host, 'input');
  for (const [typed, expected] of [
    [14, 15],
    [16, 16],
    [17, 17],
    [18, 18],
    [19, 19],
    [20, 20],
    [21, 21],
    [23, 22],
  ] as const) {
    await text(size, String(typed));
    size.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await nextTick();
    expect(font.update).toHaveBeenLastCalledWith({ modelValue: expected });
    expect(size.value).toBe(String(expected));
    expect(
      element<HTMLButtonElement>(font.host, '[data-slot="decrement"]').disabled,
    ).toBe(expected === 15);
    expect(
      element<HTMLButtonElement>(font.host, '[data-slot="increment"]').disabled,
    ).toBe(expected === 22);
  }
  expect(
    element<HTMLInputElement>(mountModels(FontSize, font.state).host, 'input')
      .value,
  ).toBe('22');

  const header = mountModels(Header, {
    disabled: false,
    headerEnable: true,
    headerMenuAlign: 'end',
    headerMode: 'fixed',
  });
  for (const [label, value] of [
    ['Start', 'start'],
    ['Center', 'center'],
    ['End', 'end'],
  ] as const) {
    const control = button(header.host, `preferences.header.menuAlign${label}`);
    control.click();
    await nextTick();
    expect(header.update).toHaveBeenLastCalledWith({ headerMenuAlign: value });
    expect(control.dataset.state).toBe('on');
  }
  expect(header.state).toMatchObject({
    headerEnable: true,
    headerMode: 'fixed',
  });
  expect(
    button(
      mountModels(Header, header.state).host,
      'preferences.header.menuAlignEnd',
    ).dataset.state,
  ).toBe('on');

  const animation = mountModels(Animation, {
    transitionEnable: true,
    transitionLoading: true,
    transitionName: 'fade-slide',
    transitionProgress: true,
  });
  for (const name of ['fade', 'fade-slide', 'fade-up', 'fade-down']) {
    const card = required(
      element(animation.host, `.${name}-slow`).parentElement,
    );
    card.click();
    await nextTick();
    expect(animation.update).toHaveBeenLastCalledWith({ transitionName: name });
    expect(card.classList.contains('outline-box-active')).toBe(true);
  }
  for (const [name, label] of [
    ['transitionProgress', 'preferences.animation.progress'],
    ['transitionLoading', 'preferences.animation.loading'],
    ['transitionEnable', 'preferences.animation.transition'],
  ] as const) {
    for (const value of [false, true]) {
      toggle(animation.host, label).click();
      await nextTick();
      expect(animation.update).toHaveBeenLastCalledWith({ [name]: value });
      expect(Boolean(animation.host.querySelector('.fade-down-slow'))).toBe(
        name === 'transitionEnable' ? value : true,
      );
      expect(animation.state.transitionName).toBe('fade-down');
    }
  }
  const restored = mountModels(Animation, animation.state).host;
  expect(
    element(restored, '.fade-down-slow').parentElement?.classList.contains(
      'outline-box-active',
    ),
  ).toBe(true);
});

it('emits each general preference and clears the disabled watermark content', async () => {
  const state = reactive({
    appDynamicTitle: true,
    appEnableCheckUpdates: true,
    appEnableCopyPreferences: true,
    appWatermark: false,
    appWatermarkContent: '',
  });
  const updates = vi.fn();
  const listeners = Object.fromEntries(
    Object.keys(state).map((name) => [
      `onUpdate:${name}`,
      (value: unknown) => {
        updates({ [name]: value });
        Object.assign(state, { [name]: value });
      },
    ]),
  );
  const general = mount(() => h(General, { ...state, ...listeners }));
  for (const [field, label] of [
    ['appDynamicTitle', 'preferences.dynamicTitle'],
    ['appEnableCheckUpdates', 'preferences.checkUpdates'],
    ['appEnableCopyPreferences', 'preferences.enableCopyPreferences'],
  ] as const) {
    for (const value of [false, true]) {
      toggle(general, label).click();
      await nextTick();
      expect(updates).toHaveBeenLastCalledWith({ [field]: value });
      expect(toggle(general, label).getAttribute('aria-checked')).toBe(
        String(value),
      );
    }
  }
  toggle(general, 'preferences.watermark').click();
  await nextTick();
  const watermark = element<HTMLInputElement>(
    general,
    'input[placeholder="preferences.watermarkContent"]',
  );
  await text(watermark, 'Unit watermark');
  expect(updates).toHaveBeenLastCalledWith({
    appWatermarkContent: 'Unit watermark',
  });
  toggle(general, 'preferences.watermark').click();
  await nextTick();
  expect(updates.mock.calls.slice(-2)).toEqual(
    expect.arrayContaining([
      [{ appWatermark: false }],
      [{ appWatermarkContent: '' }],
    ]),
  );
  expect(general.contains(watermark)).toBe(false);
  app?.unmount();
  general.remove();

  updatePreferences({ app: { enableStickyPreferencesNavigationBar: true } });
  const changes = vi.fn();
  const unsubscribe = onUserPreferencesChange(changes);
  try {
    const host = mount(() => h(Preferences));
    element<HTMLButtonElement>(host, '[title="preferences.title"]').click();
    const drawer = await vi.waitFor(() =>
      element(document.body, '[role="dialog"]'),
    );
    for (const visible of [false, true]) {
      const icon = element<SVGElement>(
        drawer,
        visible ? 'svg.lucide-pin' : 'svg.lucide-pin-off',
      );
      required(icon.closest('button')).click();
      await nextTick();
      expect(changes).toHaveBeenLastCalledWith({
        preferences: { app: { enableStickyPreferencesNavigationBar: visible } },
      });
      expect(Boolean(drawer.querySelector('.sticky-tabs-header'))).toBe(
        visible,
      );
    }
  } finally {
    unsubscribe();
    updatePreferences({ app: { enableStickyPreferencesNavigationBar: true } });
  }
});

it('emits custom page sizes and preserves false and empty text values', async () => {
  const fields: CustomPreferencesField[] = [
    {
      key: 'enableFormFullscreen',
      component: 'switch',
      label: 'Form fullscreen',
    },
    {
      key: 'defaultTableSize',
      component: 'number',
      label: 'Page size',
      componentProps: { min: 10, max: 200, step: 10 },
    },
    { key: 'reportTitle', component: 'input', label: 'Report title' },
  ];
  const values = reactive<CustomPreferencesRecord>({
    enableFormFullscreen: true,
    defaultTableSize: 10,
    reportTitle: 'Default report',
  });
  const events: CustomPreferencesRecord[] = [];
  const host = mount(() =>
    h(Custom, {
      fields,
      values,
      onUpdate(change) {
        events.push(change);
        Object.assign(values, change);
      },
    }),
  );
  for (const value of [false, true, false]) {
    toggle(host, 'Form fullscreen').click();
    await nextTick();
    expect(events.at(-1)).toEqual({ enableFormFullscreen: value });
    expect(toggle(host, 'Form fullscreen').getAttribute('aria-checked')).toBe(
      String(value),
    );
  }

  const increase = element<HTMLButtonElement>(host, '[data-slot="increment"]');
  const decrease = element<HTMLButtonElement>(host, '[data-slot="decrement"]');
  const sizeInput = element<HTMLInputElement>(host, '[data-slot="input"]');
  expect(decrease.disabled).toBe(true);
  for (let size = 20; size <= 200; size += 10) {
    sizeInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
    );
    await nextTick();
    expect(events.at(-1)).toEqual({ defaultTableSize: size });
    expect(sizeInput.value).toBe(String(size));
  }
  expect(increase.disabled).toBe(true);
  sizeInput.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
  );
  expect(events.at(-1)).toEqual({ defaultTableSize: 200 });
  const validNumberEvents = events.length;
  for (const invalid of ['201', 'not a number']) {
    await text(sizeInput, invalid);
    sizeInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await nextTick();
    expect(values.defaultTableSize).toBe(200);
    expect(events).toHaveLength(validNumberEvents);
  }

  const title = [...host.querySelectorAll<HTMLInputElement>('input')].find(
    (input) => input.value === 'Default report',
  );
  expect(title).toBeDefined();
  await text(required(title), '');
  expect(events.at(-1)).toEqual({ reportTitle: '' });
  expect(values).toEqual({
    enableFormFullscreen: false,
    defaultTableSize: 200,
    reportTitle: '',
  });
});

it('offers selectable preference JSON if the clipboard rejects the copy', async () => {
  const original = preferences.app.watermarkContent;
  updatePreferences({ app: { watermarkContent: 'Manual clipboard fallback' } });
  const clipboard = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockRejectedValue(new Error('denied'));
  const legacy = document.execCommand
    ? vi.spyOn(document, 'execCommand').mockReturnValue(false)
    : undefined;
  try {
    const host = mount(() => h(Preferences));
    element<HTMLButtonElement>(host, '[title="preferences.title"]').click();
    const drawer = await vi.waitFor(() =>
      element(document.body, '[role="dialog"]'),
    );
    const buttons = [...drawer.querySelectorAll('button')];
    const button = buttons.find(
      (item) => item.textContent?.trim() === 'preferences.copyPreferences',
    );
    expect(button?.disabled).toBe(false);
    required(button).click();
    const field = await vi.waitFor(() =>
      element<HTMLTextAreaElement>(drawer, 'textarea[readonly]'),
    );
    expect(field.value).toBe(clipboard.mock.calls[0]?.[0]);
    expect(JSON.parse(field.value)).toBeTypeOf('object');
  } finally {
    updatePreferences({ app: { watermarkContent: original } });
    legacy?.mockRestore();
    clipboard.mockRestore();
  }
});
