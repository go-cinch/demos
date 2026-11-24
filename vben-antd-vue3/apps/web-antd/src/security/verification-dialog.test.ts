import type { VueWrapper } from '@vue/test-utils';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';

import { ConfigProvider, theme } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import VerificationDialog from './verification-dialog.vue';
import { cancelVerification, requestVerification } from './verification-prompt';

const emailApi = vi.hoisted(() => ({
  options: vi.fn(async () => ({ totp: true, address: '' })),
  cooldown: vi.fn(),
  send: vi.fn(),
}));
vi.mock('#/api/core/auth', () => ({
  getSensitiveOptionsApi: emailApi.options,
  getMailboxCooldownApi: emailApi.cooldown,
  sendSensitiveEmailApi: emailApi.send,
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ openTOTPRecovery: vi.fn() }),
}));
vi.mock('./totp-enrollment.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vben/icons', () => ({
  Mail: { template: '<svg />' },
  ShieldCheck: { template: '<svg />' },
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
  '--sensitive-text': 'colorText',
  '--sensitive-text-secondary': 'colorTextSecondary',
  '--sensitive-primary': 'colorPrimary',
  '--sensitive-primary-bg': 'colorPrimaryBg',
  '--sensitive-border': 'colorBorder',
  '--sensitive-divider': 'colorBorderSecondary',
  '--sensitive-surface': 'colorBgContainer',
  '--sensitive-success': 'colorSuccess',
  '--sensitive-success-bg': 'colorSuccessBg',
} satisfies Record<string, keyof typeof lightTokens>;

let wrapper: undefined | VueWrapper;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  emailApi.options.mockReset().mockResolvedValue({ totp: true, address: '' });
  emailApi.cooldown.mockReset();
  emailApi.send.mockReset();
  wrapper?.unmount();
  wrapper = undefined;
  cancelVerification();
  await flushPromises();
  host?.remove();
  host = undefined;
});

async function openDialog(verify = vi.fn()) {
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
    setup: () => () =>
      h(
        ConfigProvider,
        {
          theme: {
            token: selectedTokens.value,
            algorithm: darkAlgorithm.value
              ? theme.darkAlgorithm
              : theme.defaultAlgorithm,
            hashed: false,
          },
        },
        { default: () => [h(ThemeProbe), h(VerificationDialog)] },
      ),
  });
  host = document.createElement('div');
  document.body.append(host);
  // Keep Ant Modal and Vue Teleport real: the theme must reach the form after
  // it leaves the component's mounting container.
  wrapper = mount(Harness, { attachTo: host });
  const pending = requestVerification(
    'sensitive',
    undefined,
    undefined,
    verify,
  );
  void pending.catch(() => undefined);
  await flushPromises();
  await nextTick();
  const form = document.body.querySelector<HTMLFormElement>(
    '.ant-modal-body form.sensitive-form',
  );
  expect(form).not.toBeNull();
  expect(host.querySelector('form.sensitive-form')).toBeNull();
  return {
    form: required(form),
    selectedTokens,
    darkAlgorithm,
    providerTokens,
    pending,
  };
}

function expectLocalTokens(form: HTMLFormElement, tokens: typeof lightTokens) {
  for (const [cssName, tokenName] of Object.entries(cssTokens)) {
    expect(form.style.getPropertyValue(cssName).trim(), cssName).toBe(
      tokens[tokenName],
    );
  }
}

describe('sensitive MFA theme across the real modal portal', () => {
  it('places every required theme variable on the form inside document.body', async () => {
    const { form } = await openDialog();

    expectLocalTokens(form, lightTokens);
    expect(form.querySelectorAll('input.verification-code-input')).toHaveLength(
      1,
    );
    expect(form.querySelector('.sensitive-cell')).toBeNull();
    expect(
      form
        .querySelector<HTMLElement>('.verification-code-control')
        ?.style.getPropertyValue('--verification-code-primary'),
    ).toBe(lightTokens.colorPrimary);
    expect(
      form.querySelector('.sensitive-body > .sensitive-shield svg'),
    ).toBeTruthy();
    expect(
      form.querySelector('footer [data-testid="sensitive-help"]'),
    ).toBeTruthy();
  });

  it('updates the teleported form variables when the provider theme changes', async () => {
    const { form, selectedTokens } = await openDialog();
    expectLocalTokens(form, lightTokens);

    selectedTokens.value = { ...darkTokens };
    await nextTick();
    await flushPromises();

    expect(
      document.body.querySelector('.ant-modal-body form.sensitive-form'),
    ).toBe(form);
    expectLocalTokens(form, darkTokens);
  });

  it('inherits the dark algorithm and a new primary color through the real portal', async () => {
    const { form, selectedTokens, darkAlgorithm, providerTokens } =
      await openDialog();

    selectedTokens.value = { colorPrimary: '#d97706' };
    darkAlgorithm.value = true;
    await nextTick();
    await flushPromises();

    expectLocalTokens(form, providerTokens());
    expect(form.style.getPropertyValue('--sensitive-primary')).not.toBe(
      lightTokens.colorPrimary,
    );
    expect(form.style.getPropertyValue('--sensitive-surface')).not.toBe(
      lightTokens.colorBgContainer,
    );
    expect(form.style.getPropertyValue('--sensitive-primary-bg')).not.toBe(
      lightTokens.colorPrimaryBg,
    );
  });
});

describe('sensitive email cooldown on entry', () => {
  it('loads the server budget before enabling email delivery', async () => {
    emailApi.options.mockResolvedValue({
      totp: false,
      address: 'ow***@example.test',
    });
    emailApi.cooldown.mockResolvedValue({
      server_time: 1000,
      retry_at: 61_000,
    });
    const { form } = await openDialog();
    expect(emailApi.cooldown).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'sensitive',
    );
    expect(form.textContent).toContain('verification.resendAfter');
    expect(
      form.querySelector<HTMLButtonElement>('[data-testid="sensitive-submit"]')
        ?.disabled,
    ).toBe(true);
    expect(form.querySelector('[role="alert"]')).toBeNull();
    expect(emailApi.send).not.toHaveBeenCalled();
  });

  it('leaves authenticator verification available without querying email', async () => {
    emailApi.options.mockResolvedValue({
      totp: true,
      address: 'ow***@example.test',
    });
    const { form } = await openDialog();
    expect(emailApi.cooldown).not.toHaveBeenCalled();
    expect(form.querySelector('input.verification-code-input')).not.toBeNull();
  });
});

it.each([
  [500, {}, 'ui.fallback.http.internalServerError'],
  [502, '', 'app.errors.serverLost'],
  [503, { msg: '邮件服务暂不可用' }, '邮件服务暂不可用'],
  [504, {}, 'app.errors.serverLost'],
])(
  'shows status %s in a red top message and keeps retry available',
  async (status, data, expected) => {
    emailApi.options
      .mockRejectedValueOnce({
        response: { status, data },
      })
      .mockResolvedValueOnce({ totp: true, address: '' });
    const { form } = await openDialog();
    const tip = document.body.querySelector(
      '.ant-message-error [role="status"]',
    );
    expect(tip?.textContent).toBe(expected);
    expect(form.textContent).not.toContain(expected);
    expect(form.querySelector('input')).toBeNull();
    expect(
      form
        .querySelector('[data-testid="sensitive-submit"]')
        ?.textContent?.trim(),
    ).toBe('verification.retry');

    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );
    await flushPromises();
    expect(form.querySelector('input')?.getAttribute('aria-invalid')).toBe(
      'false',
    );
  },
);

it('reports email status and send failures without marking a code invalid', async () => {
  emailApi.options.mockResolvedValue({
    totp: false,
    address: 'ow***@example.test',
  });
  emailApi.cooldown
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ server_time: 1000, retry_at: 0 });
  emailApi.send.mockRejectedValueOnce({
    response: { status: 502, data: { msg: 'delivery unavailable' } },
  });
  const { form } = await openDialog();
  const tip = () =>
    document.body.querySelector('.ant-message-error [role="status"]')
      ?.textContent;
  const submit = async () => {
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );
    await flushPromises();
  };
  expect(tip()).toBe('ui.fallback.http.networkError');

  await submit();
  expect(emailApi.send).not.toHaveBeenCalled();
  await submit();
  expect(tip()).toBe('delivery unavailable');
  expect(form.querySelector('[role="alert"]')).toBeNull();
  expect(form.querySelector('input')).toBeNull();
});

it('validates sensitive codes and restores cancelled email and TOTP prompts', async () => {
  const verify = vi
    .fn()
    .mockRejectedValue(new Error('Invalid verification code'));
  const { form, pending } = await openDialog(verify);
  const code = required(
    form.querySelector<HTMLInputElement>('input.verification-code-input'),
  );
  const submit = () => {
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );
    return flushPromises();
  };
  const dismiss = async () => {
    required(
      document.body.querySelector<HTMLButtonElement>('.ant-modal-close'),
    ).click();
    await flushPromises();
  };
  code.value = '123';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  await submit();
  expect(verify).not.toHaveBeenCalled();
  code.value = '111111';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  await submit();
  expect(verify).toHaveBeenCalledExactlyOnceWith('111111', undefined);
  expect(form.querySelector('[role="alert"]')).not.toBeNull();
  await dismiss();
  await expect(pending).rejects.toThrow('Verification cancelled');

  emailApi.options.mockResolvedValue({
    totp: false,
    address: 'ow***@example.test',
  });
  emailApi.cooldown.mockResolvedValue({ server_time: 1000, retry_at: 11_000 });
  const emailVerification = vi.fn();
  const emailPending = requestVerification(
    'sensitive',
    undefined,
    undefined,
    emailVerification,
  );
  void emailPending.catch(() => undefined);
  await flushPromises();
  const emailForm = required(
    document.body.querySelector<HTMLFormElement>('form.sensitive-form'),
  );
  expect(emailForm.textContent).toContain('verification.resendAfter');
  expect(
    emailForm.querySelector<HTMLButtonElement>(
      '[data-testid="sensitive-submit"]',
    )?.disabled,
  ).toBe(true);
  await dismiss();
  await expect(emailPending).rejects.toThrow('Verification cancelled');
  expect(emailVerification).not.toHaveBeenCalled();
  expect(emailApi.send).not.toHaveBeenCalled();
});
