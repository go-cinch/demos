import type { UserInfoWithPermissions } from '#/api';

import { mount } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';

import { expect, it, vi } from 'vitest';

import ProfileEmailSetting from './email-setting.vue';

const enabled = ref(false);
const route = reactive({
  path: '/profile',
  query: {} as Record<string, string>,
});
const replace = vi.fn(async ({ query }) => {
  route.query = query;
});
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}));
vi.mock('#/api/core/auth', () => ({}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('#/store/system-properties', () => ({
  get emailEnabled() {
    return enabled;
  },
}));
const grants = ref(true);
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasProfileAction: () => grants.value }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ captureSession: () => () => true }),
}));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

it.each(['bound@example.test', ''])(
  'gates the profile card independently of the saved email (%s)',
  async (email) => {
    enabled.value = false;
    const page = mount(ProfileEmailSetting, {
      props: { user: { email, userId: '1' } as UserInfoWithPermissions },
      global: { stubs: { EmailBindingForm: true, EmailUnlink: true } },
    });
    try {
      expect(page.find('[data-testid="profile-email"]').exists()).toBe(false);
      expect(page.findComponent({ name: 'EmailUnlink' }).exists()).toBe(false);
      enabled.value = true;
      await nextTick();
      expect(page.find('[data-testid="profile-email"]').exists()).toBe(true);
      expect(page.findComponent({ name: 'EmailUnlink' }).exists()).toBe(
        Boolean(email),
      );
      expect(page.findComponent({ name: 'EmailBindingForm' }).exists()).toBe(
        !email,
      );
    } finally {
      page.unmount();
    }
  },
);

it('starts collapsed and keeps the binding form while toggling the section', async () => {
  enabled.value = true;
  const page = mount(ProfileEmailSetting, {
    props: { user: { email: '', userId: '1' } as UserInfoWithPermissions },
    global: { stubs: { EmailBindingForm: true, EmailUnlink: true } },
  });
  try {
    const toggle = page.get('.security-section-actions button');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    const form = page.getComponent({ name: 'EmailBindingForm' });
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    await toggle.trigger('click');
    expect(page.getComponent({ name: 'EmailBindingForm' }).vm).toBe(form.vm);
    await toggle.trigger('click');
    form.vm.$emit('cancel');
    await nextTick();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(page.getComponent({ name: 'EmailBindingForm' }).vm).not.toBe(
      form.vm,
    );
  } finally {
    page.unmount();
  }
});

it('locates and highlights email binding before automatically expanding it', async () => {
  vi.useFakeTimers();
  enabled.value = true;
  route.query = { tab: 'security', focus: 'email' };
  const page = mount(ProfileEmailSetting, {
    props: { user: { email: '', userId: '1' } as UserInfoWithPermissions },
    global: { stubs: { EmailBindingForm: true, EmailUnlink: true } },
  });
  try {
    await nextTick();
    expect(page.find('.email-binding-cue').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(900);
    expect(
      page.get('.security-section-actions button').attributes('aria-expanded'),
    ).toBe('true');
    expect(route.query.focus).toBeUndefined();
    expect(page.find('.email-binding-cue').exists()).toBe(false);
  } finally {
    page.unmount();
    route.query = {};
    vi.useRealTimers();
  }
});

it('keeps mailbox status readable and hides binding actions when access is revoked', async () => {
  enabled.value = true;
  const page = mount(ProfileEmailSetting, {
    props: { user: { email: '', userId: '1' } as UserInfoWithPermissions },
    global: { stubs: { EmailBindingForm: true, EmailUnlink: true } },
  });
  try {
    expect(page.find('button').exists()).toBe(true);
    grants.value = false;
    await nextTick();
    expect(page.get('[data-testid="profile-email"]').text()).toContain(
      'profile-center.emailUnbound',
    );
    expect(page.find('button').exists()).toBe(false);
    expect(page.findComponent({ name: 'EmailBindingForm' }).exists()).toBe(
      false,
    );
  } finally {
    page.unmount();
    grants.value = true;
  }
});
