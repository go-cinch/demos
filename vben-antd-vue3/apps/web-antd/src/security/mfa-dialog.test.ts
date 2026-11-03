import type { VueWrapper } from '@vue/test-utils';

import { defineComponent, h, nextTick, ref } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';
import { ConfigProvider, theme } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MFADialog from './mfa-dialog.vue';
import { cancelMFA, requestMFA } from './mfa-prompt';

vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ restartLoginForMFARecovery: vi.fn() }),
}));
vi.mock('./mfa-enrollment.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vben/icons', () => ({
  ChevronDown: { template: '<svg />' },
  IconifyIcon: { template: '<svg />' },
}));

const lightTokens = {
  colorText: '#223344',
  colorTextSecondary: '#667788',
  colorPrimary: '#3456ee',
  colorPrimaryBg: '#edf1ff',
  colorBorder: '#b0bdc9',
  colorBorderSecondary: '#e4e8ed',
  colorBgContainer: '#ffffff',
  colorSuccess: '#1f9858',
  colorSuccessText: '#176b42',
  colorSuccessBg: '#edf9f1',
  colorError: '#d93f4a',
  colorErrorText: '#a22b34',
  colorErrorBg: '#fff0f2',
};

const darkTokens: typeof lightTokens = {
  colorText: '#e7edf4',
  colorTextSecondary: '#a4b0bf',
  colorPrimary: '#78a6ff',
  colorPrimaryBg: '#26334e',
  colorBorder: '#516072',
  colorBorderSecondary: '#344251',
  colorBgContainer: '#1f2835',
  colorSuccess: '#79d7a2',
  colorSuccessText: '#9de7bb',
  colorSuccessBg: '#213b2c',
  colorError: '#ff8e99',
  colorErrorText: '#ffb1b8',
  colorErrorBg: '#472831',
};

const cssTokens = {
  '--mfa-sensitive-text': 'colorText',
  '--mfa-sensitive-text-secondary': 'colorTextSecondary',
  '--mfa-sensitive-primary': 'colorPrimary',
  '--mfa-sensitive-primary-bg': 'colorPrimaryBg',
  '--mfa-sensitive-border': 'colorBorder',
  '--mfa-sensitive-divider': 'colorBorderSecondary',
  '--mfa-sensitive-surface': 'colorBgContainer',
  '--mfa-sensitive-success': 'colorSuccess',
  '--mfa-sensitive-success-text': 'colorSuccessText',
  '--mfa-sensitive-success-bg': 'colorSuccessBg',
  '--mfa-sensitive-error': 'colorError',
  '--mfa-sensitive-error-text': 'colorErrorText',
  '--mfa-sensitive-error-bg': 'colorErrorBg',
} satisfies Record<string, keyof typeof lightTokens>;

let wrapper: VueWrapper | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  wrapper?.unmount();
  wrapper = undefined;
  cancelMFA();
  await flushPromises();
  host?.remove();
  host = undefined;
});

async function openDialog() {
  const selectedTokens = ref<Partial<typeof lightTokens>>({ ...lightTokens });
  const darkAlgorithm = ref(false);
  let providerTokens!: () => typeof lightTokens;
  const ThemeProbe = defineComponent({
    setup() {
      const { token } = theme.useToken();
      providerTokens = () => token.value;
      return () => null;
    },
  });
  const Harness = defineComponent({
    setup: () => () => h(ConfigProvider, {
      theme: {
        token: selectedTokens.value,
        algorithm: darkAlgorithm.value ? theme.darkAlgorithm : theme.defaultAlgorithm,
        hashed: false,
      },
    }, { default: () => [h(ThemeProbe), h(MFADialog)] }),
  });
  host = document.createElement('div');
  document.body.append(host);
  // Keep Ant Modal and Vue Teleport real: the theme must reach the form after
  // it leaves the component's mounting container.
  wrapper = mount(Harness, { attachTo: host });
  const pending = requestMFA('sensitive', undefined, undefined, vi.fn());
  void pending.catch(() => undefined);
  await flushPromises();
  await nextTick();
  const form = document.body.querySelector<HTMLFormElement>('.ant-modal-body form.mfa-sensitive-form');
  expect(form).not.toBeNull();
  expect(host.querySelector('form.mfa-sensitive-form')).toBeNull();
  return { form: form!, selectedTokens, darkAlgorithm, providerTokens };
}

function expectLocalTokens(form: HTMLFormElement, tokens: typeof lightTokens) {
  for (const [cssName, tokenName] of Object.entries(cssTokens)) {
    expect(form.style.getPropertyValue(cssName).trim(), cssName).toBe(tokens[tokenName]);
  }
}

describe('sensitive MFA theme across the real modal portal', () => {
  it('places every required theme variable on the form inside document.body', async () => {
    const { form } = await openDialog();

    expectLocalTokens(form, lightTokens);
    expect(form.querySelectorAll('input.mfa-code-input')).toHaveLength(1);
    expect(form.querySelector('.mfa-sensitive-cell')).toBeNull();
    expect(form.querySelector<HTMLElement>('.mfa-code-control')?.style.getPropertyValue('--mfa-code-primary')).toBe(lightTokens.colorPrimary);
    expect(form.querySelector('.mfa-sensitive-shield')).not.toBeNull();
  });

  it('updates the teleported form variables when the provider theme changes', async () => {
    const { form, selectedTokens } = await openDialog();
    expectLocalTokens(form, lightTokens);

    selectedTokens.value = { ...darkTokens };
    await nextTick();
    await flushPromises();

    expect(document.body.querySelector('.ant-modal-body form.mfa-sensitive-form')).toBe(form);
    expectLocalTokens(form, darkTokens);
  });

  it('inherits the dark algorithm and a new primary color through the real portal', async () => {
    const { form, selectedTokens, darkAlgorithm, providerTokens } = await openDialog();

    selectedTokens.value = { colorPrimary: '#d97706' };
    darkAlgorithm.value = true;
    await nextTick();
    await flushPromises();

    expectLocalTokens(form, providerTokens());
    expect(form.style.getPropertyValue('--mfa-sensitive-primary')).not.toBe(lightTokens.colorPrimary);
    expect(form.style.getPropertyValue('--mfa-sensitive-surface')).not.toBe(lightTokens.colorBgContainer);
    expect(form.style.getPropertyValue('--mfa-sensitive-primary-bg')).not.toBe(lightTokens.colorPrimaryBg);
  });
});
