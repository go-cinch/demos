/* eslint-disable vue/one-component-per-file -- Test harness includes cached login and reset routes. */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, KeepAlive, markRaw, nextTick, ref } from 'vue';

import { useVbenForm } from '@vben/common-ui';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LoginAccountInput from './login-account-input.vue';

vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));

describe('cached login account dropdown', () => {
  let wrapper: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      `LOGIN_ACCOUNT_HISTORY_${location.hostname}`,
      '["super"]',
    );
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it.each(['mouse', 'keyboard'])(
    'writes a %s-selected account into the real form and the visible input',
    async (method) => {
      const [Form, formApi] = useVbenForm({
        schema: [
          {
            component: markRaw(LoginAccountInput),
            componentProps: {
              onSelect: () => formApi.setFieldValue('password', ''),
            },
            defaultValue: '',
            fieldName: 'username',
          },
          {
            component: 'VbenInput',
            defaultValue: 'old-password',
            fieldName: 'password',
          },
        ],
        showDefaultActions: false,
      });
      wrapper = mount(Form, { attachTo: document.body });
      await flushPromises();
      const input = wrapper.get<HTMLInputElement>('input[name="username"]');
      input.element.focus();
      await flushPromises();
      const option = document.querySelector<HTMLElement>(
        '.ant-select-item-option',
      );
      expect(option).not.toBeNull();
      if (method === 'mouse') {
        option!.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
        );
        option!.querySelector<HTMLButtonElement>('button')!.click();
      } else {
        await input.trigger('keydown', {
          key: 'ArrowDown',
          keyCode: 40,
          which: 40,
        });
        await input.trigger('keydown', {
          key: 'Enter',
          keyCode: 13,
          which: 13,
        });
      }
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await flushPromises();
      expect((await formApi.getValues()).username).toBe('super');
      expect((await formApi.getValues()).password).toBe('');
      expect(input.element.value).toBe('super');
      expect(input.attributes('aria-expanded')).toBe('false');

      await wrapper.get('.ant-input-clear-icon').trigger('click');
      await flushPromises();
      expect((await formApi.getValues()).username).toBe('');
      expect(input.element.value).toBe('');
      input.element.focus();
      await input.trigger('input');
      await flushPromises();
      document
        .querySelector<HTMLButtonElement>(
          '.ant-select-item-option-content button',
        )!
        .click();
      await flushPromises();
      expect((await formApi.getValues()).username).toBe('super');
      expect(input.element.value).toBe('super');
    },
  );

  it('keeps history actions inside the dropdown and clears history without changing the account', async () => {
    wrapper = mount(LoginAccountInput, {
      attachTo: document.body,
      props: { modelValue: 'super' },
      attrs: { name: 'username' },
    });
    expect(wrapper.text()).not.toContain('authentication.accountHistory');
    expect(document.body.textContent).not.toContain(
      'authentication.clearAccountHistory',
    );

    const input = wrapper.get<HTMLInputElement>('input[name="username"]');
    input.element.focus();
    await flushPromises();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.ant-select-dropdown')?.textContent,
      ).toContain('authentication.clearAccountHistory');
    });
    expect(wrapper.text()).not.toContain('authentication.accountHistory');

    input.element.blur();
    await flushPromises();
    await vi.waitFor(() => {
      const popup = document.querySelector<HTMLElement>('.ant-select-dropdown');
      expect(
        !popup ||
          popup.classList.contains('ant-select-dropdown-hidden') ||
          popup.style.display === 'none',
      ).toBe(true);
    });
    expect(wrapper.text()).not.toContain('authentication.accountHistory');
    input.element.focus();
    await flushPromises();

    // Keep the actions accessible inside the popup even if the search has no matches.
    await wrapper.setProps({ modelValue: 'unmatched-account' });
    await flushPromises();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.ant-select-dropdown')?.textContent,
      ).toContain('common.noData');
    });
    const clearButton = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.ant-select-dropdown button',
      ),
    ].find((button) =>
      button.textContent?.includes('authentication.clearAccountHistory'),
    );
    expect(clearButton).toBeDefined();
    clearButton!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    clearButton!.click();
    await flushPromises();

    expect(
      localStorage.getItem(`LOGIN_ACCOUNT_HISTORY_${location.hostname}`),
    ).toBeNull();
    expect(input.element.value).toBe('unmatched-account');
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(document.body.textContent).not.toContain(
      'authentication.clearAccountHistory',
    );
  });

  it('does not show history controls for an empty history', async () => {
    localStorage.clear();
    wrapper = mount(LoginAccountInput, { attachTo: document.body });
    wrapper.get<HTMLInputElement>('input').element.focus();
    await flushPromises();
    expect(document.body.textContent).not.toContain(
      'authentication.accountHistory',
    );
    expect(document.body.textContent).not.toContain(
      'authentication.clearAccountHistory',
    );
  });

  it('removes the teleported popup on reset navigation and returns with it closed', async () => {
    const login = ref(true);
    const account = ref('');
    const Login = defineComponent({
      name: 'CachedLogin',
      setup: () => () =>
        h(LoginAccountInput, { modelValue: account.value, name: 'username' }),
    });
    const Reset = defineComponent({
      setup: () => () => h('input', { name: 'newPassword', type: 'password' }),
    });
    const Harness = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, { default: () => h(login.value ? Login : Reset) }),
    });
    wrapper = mount(Harness, { attachTo: document.body });
    const input = wrapper.get<HTMLInputElement>('input[name="username"]');
    input.element.focus();
    await flushPromises();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.ant-select-dropdown')?.textContent,
      ).toContain('super');
    });

    // A newly entered account has no matches, but Ant retains its internal
    // open state. The cached form resets to an empty username after navigation.
    account.value = 'guest';
    await nextTick();
    input.element.blur();
    login.value = false;
    await nextTick();
    account.value = '';
    await flushPromises();
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
    wrapper.get<HTMLInputElement>('input[name="newPassword"]').element.focus();
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();

    login.value = true;
    await flushPromises();
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
    wrapper.get<HTMLInputElement>('input[name="username"]').element.focus();
    await flushPromises();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.ant-select-dropdown')?.textContent,
      ).toContain('super');
    });
  });
});
