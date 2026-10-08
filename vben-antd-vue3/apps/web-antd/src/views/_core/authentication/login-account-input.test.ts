/* eslint-disable vue/one-component-per-file -- Test harness includes cached login and reset routes. */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';

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
