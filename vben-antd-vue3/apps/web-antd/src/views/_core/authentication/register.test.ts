import type { VueWrapper } from '@vue/test-utils';

import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import { AuthenticationRegister } from '@vben/common-ui';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Register from './register.vue';
import ServerSliderCaptcha from './server-slider-captcha.vue';

const mocks = vi.hoisted(() => ({
  availability: vi.fn(),
  register: vi.fn(),
  stageLogin: vi.fn(),
}));

vi.mock('#/api', () => ({
  getUsernameAvailabilityApi: mocks.availability,
  registerApi: mocks.register,
}));
vi.mock('#/store', () => ({ stageRegistrationLogin: mocks.stageLogin }));
vi.mock('@vben/locales', () => ({
  $placeholder: (key: string) => key,
  $t: (key: string) => key,
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

let page: VueWrapper;
let router: ReturnType<typeof createRouter>;

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.availability.mockResolvedValue({ available: true });
  mocks.register.mockResolvedValue({});
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/register', component: Register },
      { path: '/auth/login', component: { template: '<div />' } },
    ],
  });
  await router.push('/auth/register?redirect=/profile');
  page = mount(Register, {
    global: { plugins: [router], stubs: { ServerSliderCaptcha: true } },
  });
  await flushPromises();
});

afterEach(() => page.unmount());

async function fillCredentials() {
  await page.get('input[name="username"]').setValue(' new-user ');
  await page.get('input[name="password"]').setValue(' password ');
  await page.get('input[name="confirmPassword"]').setValue(' password ');
  await flushPromises();
}

async function beginVerification() {
  await fillCredentials();
  await page.get('button[aria-label="register"]').trigger('click');
  await vi.waitFor(() => expect(mocks.availability).toHaveBeenCalled());
  await flushPromises();
}

describe('registration verification flow', () => {
  it('retains an explicit login destination query and hash while carrying the redirect', async () => {
    const form = mount(AuthenticationRegister, {
      props: { loginPath: '/auth/login?source=custom#form' },
      global: { plugins: [router] },
    });
    try {
      await router.push({
        path: '/auth/register',
        query: {
          redirect: '/profile?from=register#security',
          source: 'invite',
        },
      });
      await form.get('.vben-link').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/auth/login');
      expect(router.currentRoute.value.query).toEqual({
        redirect: '/profile?from=register#security',
        source: 'custom',
      });
      expect(router.currentRoute.value.hash).toBe('#form');
    } finally {
      form.unmount();
    }
  });

  it.each([
    { redirect: '/profile?from=register#security' },
    { redirect: '/profile?from=register#security', source: 'invite' },
    {},
  ])(
    'preserves the current query when returning to login: %j',
    async (query) => {
      await router.push({ path: '/auth/register', query });
      await page.get('.vben-link').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/auth/login');
      expect(router.currentRoute.value.query).toEqual(query);
      expect(mocks.register).not.toHaveBeenCalled();
      expect(mocks.stageLogin).not.toHaveBeenCalled();
    },
  );

  it('keeps verification hidden until valid credentials are submitted', async () => {
    expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
    await page.get('button[aria-label="register"]').trigger('click');
    await flushPromises();
    expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
    expect(mocks.availability).not.toHaveBeenCalled();

    await beginVerification();
    expect(page.getComponent(ServerSliderCaptcha).props()).toMatchObject({
      purpose: 'register',
      username: 'new-user',
    });
    expect(page.find('button[aria-label="register"]').exists()).toBe(false);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation and an unavailable username before verification', async () => {
    await fillCredentials();
    await page.get('input[name="confirmPassword"]').setValue('different');
    await page.get('button[aria-label="register"]').trigger('click');
    await flushPromises();
    expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
    expect(mocks.availability).not.toHaveBeenCalled();

    mocks.availability.mockResolvedValue({ available: false });
    await beginVerification();
    expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
    expect(page.text()).toContain('app.register.usernameExists');
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('submits once after verification and preserves the login handoff and redirect', async () => {
    await beginVerification();
    const slider = page.getComponent(ServerSliderCaptcha);
    slider.vm.$emit('update:modelValue', 'server-proof');
    slider.vm.$emit('update:modelValue', 'server-proof');
    await flushPromises();
    expect(mocks.register).toHaveBeenCalledExactlyOnceWith({
      username: 'new-user',
      password: 'password',
      slider_proof: 'server-proof',
    });
    expect(mocks.stageLogin).toHaveBeenCalledExactlyOnceWith({
      username: 'new-user',
      password: 'password',
    });
    expect(router.currentRoute.value.fullPath).toBe(
      '/auth/login?redirect=/profile',
    );
  });

  it.each(['username', 'password', 'confirmPassword'])(
    'cancels verification when %s changes',
    async (field) => {
      await beginVerification();
      const oldSlider = page.getComponent(ServerSliderCaptcha);
      await page.get(`input[name="${field}"]`).setValue('changed');
      await flushPromises();
      expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
      expect(page.find('button[aria-label="register"]').exists()).toBe(true);
      oldSlider.vm.$emit('update:modelValue', 'stale-proof');
      await flushPromises();
      expect(mocks.register).not.toHaveBeenCalled();
    },
  );

  it('returns to the registration button after a failed request and uses a new proof on retry', async () => {
    mocks.register.mockRejectedValueOnce(new Error('Registration failed'));
    await beginVerification();
    page
      .getComponent(ServerSliderCaptcha)
      .vm.$emit('update:modelValue', 'old-proof');
    await flushPromises();
    expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
    expect(page.find('button[aria-label="register"]').exists()).toBe(true);
    expect(mocks.stageLogin).not.toHaveBeenCalled();

    await page.get('button[aria-label="register"]').trigger('click');
    await flushPromises();
    expect(mocks.availability).toHaveBeenCalledTimes(2);
    page
      .getComponent(ServerSliderCaptcha)
      .vm.$emit('update:modelValue', 'fresh-proof');
    await flushPromises();
    expect(mocks.register).toHaveBeenLastCalledWith(
      expect.objectContaining({ slider_proof: 'fresh-proof' }),
    );
  });
});

describe('registration input matrix', () => {
  it.each([
    { variant: 'username-empty', field: 'username', value: '' },
    { variant: 'username-blank', field: 'username', value: '   ' },
    { variant: 'password-empty', field: 'password', value: '' },
    { variant: 'password-blank', field: 'password', value: '   ' },
    { variant: 'confirm-empty', field: 'confirmPassword', value: '' },
    {
      variant: 'confirm-mismatch',
      field: 'confirmPassword',
      value: 'different',
    },
  ])(
    '$variant blocks verification and can be corrected',
    async ({ field, value }) => {
      await fillCredentials();
      await page.get(`input[name="${field}"]`).setValue(value);
      if (field === 'password')
        await page.get('input[name="confirmPassword"]').setValue(value);
      await page.get('button[aria-label="register"]').trigger('click');
      await flushPromises();
      await vi.waitFor(() =>
        expect(
          page.get(`input[name="${field}"]`).attributes('aria-invalid'),
        ).toBe('true'),
      );
      await flushPromises();
      expect(page.findComponent(ServerSliderCaptcha).exists()).toBe(false);
      expect(mocks.availability).not.toHaveBeenCalled();
      expect(mocks.register).not.toHaveBeenCalled();
      await beginVerification();
      expect(page.getComponent(ServerSliderCaptcha).props('purpose')).toBe(
        'register',
      );
      expect(mocks.register).not.toHaveBeenCalled();
    },
  );
});
