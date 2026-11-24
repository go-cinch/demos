import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VerificationCancelled } from '#/security/verification-prompt';

import { required } from '../../../../../../scripts/test-utils/required';
import TestSend from './test-send.vue';
const api = vi.hoisted(() => ({
  send: vi.fn(),
  success: vi.fn(),
  user: vi.fn(),
  push: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    fetchUserInfo: api.user,
    captureSession: () => () => true,
  }),
}));
vi.mock('#/store/system-properties', async () => {
  const vue = await import('vue');
  return {
    emailEnabled: vue.ref(true),
  };
});
vi.mock('#/api/mail-template', () => ({ sendMailTemplateTest: api.send }));
vi.mock('#/locales', () => ({ $t: (key: string) => key.split('.').at(-1) }));
vi.mock('ant-design-vue', async (original) => {
  const actual = await original<typeof import('ant-design-vue')>();
  const { defineComponent, h } = await import('vue');
  return {
    ...actual,
    message: { success: api.success, error: vi.fn() },
    Modal: defineComponent({
      emits: ['ok', 'cancel'],
      setup:
        (_, { emit, slots }) =>
        () =>
          h('section', [
            slots.default?.(),
            h(
              'button',
              { 'data-send': true, onClick: () => emit('ok') },
              'send',
            ),
          ]),
    }),
  };
});
const wrappers: ReturnType<typeof mount>[] = [];
async function setup() {
  const translation = {
    subject: 'Draft {{subjectOnly}}',
    html: '<p>{{code}} {{code}}</p>',
    text: '{{textOnly}}',
    preview_values: {
      code: '123456',
      subjectOnly: 'Subject',
      textOnly: 'Text',
      unused: 'unused',
    },
  };
  const wrapper = mount(TestSend, {
    props: {
      id: 3,
      locale: 'en-US',
      content: {
        'en-US': translation,
        'zh-CN': {
          subject: '中文主题',
          html: '<p>{{code}}</p>',
          text: '',
          preview_values: { code: '中文示例' },
        },
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, translation };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.send.mockResolvedValue(undefined);
  api.user.mockResolvedValue({ email: 'self@example.com', emailVerifiedAt: 1 });
  api.push.mockResolvedValue(undefined);
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
describe('template test delivery', () => {
  it('collects parameters once and sends edits without changing the draft', async () => {
    const { wrapper, translation } = await setup();
    expect(wrapper.findAll('textarea')).toHaveLength(3);
    expect(
      (wrapper.get('[aria-label="code"]').element as HTMLTextAreaElement).value,
    ).toBe('123456');
    expect(wrapper.find('input[aria-label="recipient"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="mail-test-recipient"]').text()).toBe(
      'self@example.com',
    );
    await wrapper.get('[aria-label="code"]').setValue('edited');
    await wrapper.get('[data-send]').trigger('click');
    await flushPromises();
    expect(api.send).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        locale: 'en-US',
        content: {
          subject: translation.subject,
          html: translation.html,
          text: translation.text,
        },
        values: { code: 'edited', subjectOnly: 'Subject', textOnly: 'Text' },
      }),
      expect.any(String),
    );
    expect(translation.preview_values.code).toBe('123456');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('switches content and preview values with language while retaining per-language edits', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[aria-label="code"]').setValue('English edited');
    await wrapper
      .getComponent({ name: 'ASegmented' })
      .vm.$emit('change', 'zh-CN');
    await flushPromises();
    expect(
      (wrapper.get('[aria-label="code"]').element as HTMLTextAreaElement).value,
    ).toBe('中文示例');
    expect(wrapper.findAll('textarea')).toHaveLength(1);
    await wrapper
      .getComponent({ name: 'ASegmented' })
      .vm.$emit('change', 'en-US');
    await flushPromises();
    expect(
      (wrapper.get('[aria-label="code"]').element as HTMLTextAreaElement).value,
    ).toBe('English edited');
    await wrapper
      .getComponent({ name: 'ASegmented' })
      .vm.$emit('change', 'zh-CN');
    await flushPromises();
    await wrapper.get('[data-send]').trigger('click');
    expect(api.send.mock.calls[0]?.[1]).toEqual({
      locale: 'zh-CN',
      content: { subject: '中文主题', html: '<p>{{code}}</p>', text: '' },
      values: { code: '中文示例' },
    });
    expect(api.send.mock.calls[0]?.[1]).not.toHaveProperty('recipient');
  });
  it('validates missing parameters inline before sending', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[aria-label="code"]').setValue(' ');
    await wrapper.get('[data-send]').trigger('click');
    expect(wrapper.text()).toContain('testValueRequired');
    expect(api.send).not.toHaveBeenCalled();
  });
  it('blocks an unbound account and opens the email binding section', async () => {
    api.user.mockResolvedValue({ email: '', emailVerifiedAt: undefined });
    const { wrapper } = await setup();
    await wrapper.get('[data-send]').trigger('click');
    expect(api.send).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('bindEmailRequired');
    await required(
      wrapper.findAll('button').find((b) => b.text() === 'bindEmail'),
    ).trigger('click');
    expect(api.push).toHaveBeenCalledWith({
      path: '/profile',
      query: { tab: 'security', focus: 'email' },
    });
  });
  it('does not send when account loading fails', async () => {
    api.user.mockRejectedValue(new Error('offline'));
    const { wrapper } = await setup();
    await wrapper.get('[data-send]').trigger('click');
    expect(api.send).not.toHaveBeenCalled();
    expect(wrapper.get('.load-warning button').isVisible()).toBe(true);
  });
  it('silently cancels verification and keeps test values ready for retry', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[aria-label="code"]').setValue('keep this sample');
    api.send.mockRejectedValueOnce(new VerificationCancelled());
    await wrapper.get('[data-send]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('testFailed');
    expect(api.success).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.emitted('sending')?.at(-1)).toEqual([false]);
    expect(
      (wrapper.get('[aria-label="code"]').element as HTMLTextAreaElement).value,
    ).toBe('keep this sample');
    await wrapper.get('[data-send]').trigger('click');
    await flushPromises();
    expect(api.send).toHaveBeenCalledTimes(2);
    expect(api.success).toHaveBeenCalledWith('testSent');
  });

  it('prevents duplicate clicks and retains form values after failure', async () => {
    let reject!: (error: unknown) => void;
    api.send.mockImplementation(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    );
    const { wrapper } = await setup();
    await wrapper.get('[data-send]').trigger('click');
    await wrapper.get('[data-send]').trigger('click');
    expect(api.send).toHaveBeenCalledTimes(1);
    reject({
      response: { data: { error_code: 'MAIL_TEMPLATE_DELIVERY_UNAVAILABLE' } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('testUnavailable');
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
