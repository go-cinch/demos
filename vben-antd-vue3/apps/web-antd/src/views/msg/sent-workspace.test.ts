import type { MsgPreview } from '#/api/msg';

import { shallowMount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import SentWorkspace from './sent-workspace.vue';

vi.mock('./message-recipients.vue', () => ({
  default: { props: ['recipients'], template: '<div />' },
}));

vi.mock('@vben/stores', () => ({ useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }) }));
vi.mock('@vben/utils', () => ({ formatDateTime: (value: unknown) => String(value ?? '') }));
vi.mock('#/locales', () => ({ $t: (key: string, params?: { count: number }) => params ? `${key}:${params.count}` : key }));

describe('sent detail projection', () => {
  it('counts selected recipient records without requiring a duplicate ID projection', async () => {
    const selected: MsgPreview = {
      id: 7, title: 'Selected message', scope: 'targeted',
      recipients: [{ id: 1, username: 'reader', code: 'READER01' }, { id: 2, username: 'writer', code: 'WRITER02' }],
    };
    const wrapper = shallowMount(SentWorkspace, {
      props: {
        bordered: false, busy: false, canDelete: true, checkedKeys: [], density: 'middle',
        detailError: false, detailLoading: false, loading: false, page: 1,
        rows: [selected], selected, selectedId: 7, size: 20, sticky: false,
        striped: false, total: 1, visible: [],
      },
    });
    expect(wrapper.text()).toContain('msg.recipientCount:2');
    await wrapper.setProps({ selected: { ...selected, recipients: [], recipient_ids: [1] } });
    expect(wrapper.text()).toContain('msg.recipientCount:0');
    await wrapper.setProps({ selected: { ...selected, recipients: undefined, recipient_ids: [1] } });
    expect(wrapper.text()).toContain('msg.recipientCount:1');
    wrapper.unmount();
  });
});
