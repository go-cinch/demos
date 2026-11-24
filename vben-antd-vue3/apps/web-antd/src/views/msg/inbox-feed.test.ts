import { flushPromises, mount } from '@vue/test-utils';

import { expect, it, vi } from 'vitest';

import { required } from '../../../../../scripts/test-utils/required';
import InboxFeed from './inbox-feed.vue';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  read: vi.fn(),
  count: vi.fn(),
}));
vi.mock('#/api/msg', () => ({
  msgApi: api,
  msgChanged: vi.fn(),
  msgPreviewFields: 'id,title,summary,type,published_at,read_at',
}));
vi.mock('#/api/message-attention', () => ({ visitMessages: vi.fn() }));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasButton: () => true }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/icons', async (original) => ({
  ...(await original<typeof import('@vben/icons')>()),
  IconifyIcon: { render: () => null },
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { userId: 7 } }),
  useTimezoneStore: () => ({ timezone: 'UTC' }),
}));

it('removes the withdrawn body in place and leaves a same-title republication unread', async () => {
  vi.useFakeTimers();
  const original = {
    id: 101,
    title: 'Meeting',
    type: 'notice',
    published_at: 1000,
    read_at: null,
  };
  const other = { ...original, id: 100, title: 'Other' };
  const reissued = { ...original, id: 102 };
  let messages = [original, other];
  let offline = false;
  api.list.mockImplementation(async (_sent, query) => {
    if (offline) throw new Error('offline');
    const items = query.id
      ? messages.filter((row) => row.id === query.id)
      : messages;
    return { items, t: items.length, p: 1, s: query.s };
  });
  api.get.mockResolvedValue({ ...original, content: 'Original full text' });
  api.count.mockResolvedValue({ count: 1, latest_unread_at: 1000 });
  const wrapper = mount(InboxFeed, {
    global: { stubs: { MessageTypeIcon: true, SearchAutocomplete: true } },
  });
  try {
    await flushPromises();
    await required(
      wrapper
        .findAll('.inbox-filters button')
        .find((button) => button.text() === 'msg.unread'),
    ).trigger('click');
    await flushPromises();
    const oldRow = wrapper.get('[data-message-id="101"]');
    await oldRow.get('button[aria-expanded="false"]').trigger('click');
    await flushPromises();
    expect(oldRow.text()).toContain('Original full text');
    const viewport = wrapper.get<HTMLElement>(
      '[data-testid="inbox-scroll"]',
    ).element;
    viewport.scrollTop = 80;
    messages = [reissued, other];

    offline = true;
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();
    expect(oldRow.text()).toContain('Original full text');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(api.list).toHaveBeenLastCalledWith(
      false,
      { id: 101, f: 'id', p: 1, s: 1 },
      { suppressErrorMessage: true },
    );

    offline = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe(
      'msg.messageUnavailable',
    );
    expect(wrapper.text()).not.toContain('Original full text');
    expect(wrapper.find('[data-message-id="101"]').exists()).toBe(false);
    expect(wrapper.get('[data-message-id="100"]').text()).toContain('Other');
    expect(viewport.scrollTop).toBe(80);

    await wrapper.get('button[aria-label="msg.refresh"]').trigger('click');
    await flushPromises();
    const newRow = wrapper.get('[data-message-id="102"]');
    expect(newRow.text()).toContain('Meeting');
    expect(newRow.get('[data-read="false"]').text()).toBe('msg.unread');
    expect(api.read).toHaveBeenCalledExactlyOnceWith(101);
  } finally {
    wrapper.unmount();
    vi.useRealTimers();
  }
});
