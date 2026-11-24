import { createApp, h, nextTick } from 'vue';

import { expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import TimezoneButton from './timezone-button.vue';

const timezone = vi.hoisted(() => {
  const options = [
    { label: 'Shanghai', region: 'Asia', value: 'Asia/Shanghai' },
    { label: 'Paris', region: 'Europe', value: 'Europe/Paris' },
    { label: 'UTC', region: 'Other', value: 'Etc/UTC' },
  ];
  return {
    options,
    timezone: 'Asia/Shanghai',
    getTimezoneOptions: vi.fn(async () => options),
    setTimezone: vi.fn(async () => {}),
  };
});
vi.mock('@vben/stores', async (original) => ({
  ...(await original<typeof import('@vben/stores')>()),
  useTimezoneStore: () => timezone,
}));
vi.mock('@vben/icons', async (original) => ({
  ...(await original<typeof import('@vben/icons')>()),
  createIconifyIcon: () => () => h('svg'),
}));
vi.mock('@vben/locales', async (original) => ({
  ...(await original<typeof import('@vben/locales')>()),
  $t: (key: string) => key,
}));

function control<T extends HTMLElement>(root: ParentNode, selector: string) {
  const node = root.querySelector<T>(selector);
  expect(node, selector).not.toBeNull();
  return required(node);
}

function containsChoices(dialog: HTMLElement, expected: string[]) {
  const rows = [...dialog.querySelectorAll('[role="radio"]')].map(
    (radio) => radio.closest('label')?.textContent,
  );
  expect(rows).toHaveLength(expected.length);
  for (const value of expected)
    expect(rows.some((row) => row?.includes(value))).toBe(true);
}

function button(dialog: HTMLElement, caption: RegExp) {
  const target = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
    (option) => caption.test(option.textContent?.trim() ?? ''),
  );
  expect(target, caption.source).toBeDefined();
  return required(target);
}

it('filters the timezone list, cancels cleanly, and saves the selected IANA value', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(TimezoneButton, { settingsEntry: true }),
  });
  app.mount(host);
  const open = async () => {
    control<HTMLButtonElement>(
      host,
      '[data-testid="settings-timezone"]',
    ).click();
    return await vi.waitFor(() => {
      const dialog = control<HTMLElement>(document.body, '[role="dialog"]');
      containsChoices(dialog, ['Asia/Shanghai', 'Europe/Paris', 'Etc/UTC']);
      return dialog;
    });
  };
  const search = async (dialog: HTMLElement, value: string) => {
    const input = control<HTMLInputElement>(
      dialog,
      'input[placeholder="ui.widgets.timezone.search"]',
    );
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
  };
  const choose = (dialog: HTMLElement, value: string) => {
    const row = [...dialog.querySelectorAll('label')].find((label) =>
      label.textContent?.includes(value),
    );
    expect(row).toBeDefined();
    control<HTMLButtonElement>(required(row), '[role="radio"]').click();
  };
  try {
    const first = await open();
    expect(button(first, /ui\.widgets\.timezone\.save/).disabled).toBe(true);
    await search(first, 'no matching city');
    containsChoices(first, []);
    await search(first, '');
    button(first, /ui\.widgets\.timezone\.regions\.Europe/).click();
    await nextTick();
    containsChoices(first, ['Europe/Paris']);
    choose(first, 'Europe/Paris');
    await nextTick();
    button(first, /(?:cancel|Cancel|取消)$/).click();
    await vi.waitFor(() => expect(document.body.contains(first)).toBe(false));
    expect(timezone.setTimezone).not.toHaveBeenCalled();

    const second = await open();
    await search(second, 'etc/utc');
    containsChoices(second, ['Etc/UTC']);
    choose(second, 'Etc/UTC');
    await nextTick();
    button(second, /ui\.widgets\.timezone\.save/).click();
    await vi.waitFor(() =>
      expect(timezone.setTimezone).toHaveBeenCalledExactlyOnceWith('Etc/UTC'),
    );
  } finally {
    app.unmount();
    host.remove();
    vi.clearAllMocks();
  }
});
