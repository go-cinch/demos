import { flushPromises, mount } from '@vue/test-utils';

import { Select } from 'ant-design-vue';
import { expect, it, vi } from 'vitest';

import { required } from '../../../../../scripts/test-utils/required';
import MessageTable from './message-table.vue';

const send = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }));
vi.mock('@vben/icons', async (original) => ({
  ...(await original<typeof import('@vben/icons')>()),
  IconifyIcon: { render: () => null },
}));
vi.mock('#/api/msg', () => ({ msgApi: { send }, msgChanged: vi.fn() }));
vi.mock('#/api', () => ({}));
vi.mock('#/api/system', () => ({}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasButton: () => true, hasPage: () => false }),
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({}),
  useTimezoneStore: () => ({ timezone: 'UTC' }),
}));
vi.mock('#/composables/use-default-page-size', async () => {
  const { ref } = await import('vue');
  return { useDefaultPageSize: () => ref(10) };
});

it('requires an explicit audience for each new message', async () => {
  const wrapper = mount(MessageTable, {
    props: { sent: true },
    global: {
      stubs: {
        ManagementSearch: true,
        ManagementToolbar: true,
        ManagementViewSwitch: true,
        AssociationEditor: true,
        ManagementDrawer: {
          props: ['open'],
          template:
            '<section v-if="open" role="dialog"><slot /><footer><slot name="footer" /></footer></section>',
        },
      },
    },
  });
  try {
    const compose = () =>
      required(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'msg.send'),
      ).trigger('click');
    await compose();
    const dialog = wrapper.get('[role="dialog"]');
    const select = required(
      wrapper
        .findAllComponents(Select)
        .find((item) => item.props('id') === 'msg-scope'),
    );
    expect(select.props('value')).toBeUndefined();
    expect(dialog.text()).not.toContain('msg.broadcastHint');
    await dialog.get('input[aria-label="msg.title"]').setValue('Title');
    await dialog.get('textarea').setValue('Body');
    const submit = dialog.get('footer button:last-child');
    await submit.trigger('click');
    expect(dialog.get('.ant-form-item-explain-error').text()).toBe(
      'msg.chooseAudience',
    );
    expect(send).not.toHaveBeenCalled();
    select.vm.$emit('update:value', 'targeted');
    await submit.trigger('click');
    expect(send).not.toHaveBeenCalled();
    expect(dialog.text()).toContain('msg.recipientError');
    select.vm.$emit('update:value', 'all');
    await flushPromises();
    expect(dialog.text()).toContain('msg.broadcastHint');
    await submit.trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: 'Title',
        scope: 'all',
        recipient_ids: [],
      }),
      expect.any(String),
      expect.anything(),
    );
    await compose();
    expect(wrapper.get('[role="dialog"]').text()).toContain(
      'msg.chooseAudience',
    );
    expect(wrapper.get('[role="dialog"]').text()).not.toContain(
      'msg.broadcastHint',
    );
  } finally {
    wrapper.unmount();
  }
});
