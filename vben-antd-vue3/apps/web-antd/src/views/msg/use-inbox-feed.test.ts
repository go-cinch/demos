import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from 'ant-design-vue';

import { useInboxFeed } from './use-inbox-feed';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(),
  get: vi.fn(),
  read: vi.fn(),
  readAll: vi.fn(),
  remove: vi.fn(),
}));
const state = vi.hoisted(() => ({
  user: {} as { userInfo: { userId: number } },
}));
vi.mock('#/api/msg', () => ({
  msgApi: api,
  msgPreviewFields: 'id,title,summary,type,published_at,read_at',
  msgChanged: () => window.dispatchEvent(new Event('cinch-msg-changed')),
}));
vi.mock('#/api/message-attention', () => ({ visitMessages: vi.fn() }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/stores', () => ({ useUserStore: () => state.user }));
vi.mock('@vben/preferences', () => ({
  preferences: { app: { locale: 'en-US' } },
}));
vi.mock('ant-design-vue', () => ({ Modal: { confirm: vi.fn() } }));
const row = (id: number, read_at: null | number = null) => ({
  id,
  title: `Message ${id}`,
  content: 'Body',
  type: 'notice',
  scope: 'all',
  sender_id: 1,
  published_at: id,
  expired_at: null,
  read_at,
});
const page = (ids: number[], total: number) => ({
  items: ids.map((id) => row(id)),
  t: total,
  p: 1,
  s: 10,
});
let feed: ReturnType<typeof useInboxFeed>;
let wrapper: ReturnType<typeof mount>;
const messageId = ref<number>();
function start(id?: number) {
  messageId.value = id;
  wrapper = mount(
    defineComponent({
      setup() {
        feed = useInboxFeed(messageId);
        return () => null;
      },
    }),
  );
  return flushPromises();
}
beforeEach(() => {
  vi.resetAllMocks();
  state.user = reactive({ userInfo: { userId: 1 } });
  api.count.mockResolvedValue({
    user_id: 1,
    count: 12,
    latest_unread_at: 12,
    observed_at: 100,
  });
  api.read.mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});
describe('inbox feed requests', () => {
  it('discards a stale append after a filter change and allows retry without losing rows', async () => {
    api.list.mockResolvedValueOnce(page([12, 11, 10, 9, 8, 7, 6, 5, 4, 3], 12));
    await start();
    let complete!: (value: unknown) => void;
    api.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = feed.more();
    api.list.mockResolvedValueOnce(page([20], 1));
    feed.filter.value = 'system';
    await flushPromises();
    complete(page([2, 1], 12));
    await pending;
    expect(feed.rows.value.map((item) => item.id)).toEqual([20]);
    expect(feed.loadingMore.value).toBe(false);
    api.list.mockResolvedValueOnce(page([12, 11, 10, 9, 8, 7, 6, 5, 4, 3], 12));
    feed.filter.value = 'all';
    await flushPromises();
    api.list.mockRejectedValueOnce(new Error('offline'));
    await feed.more();
    expect(feed.rows.value).toHaveLength(10);
    expect(feed.moreError.value).toBe(true);
    api.list.mockResolvedValueOnce(page([3, 2, 1], 12));
    await feed.more();
    expect(feed.rows.value).toHaveLength(12);
    expect(new Set(feed.rows.value.map((item) => item.id)).size).toBe(12);
  });
  it('rebuilds the prefix after a filtered read so continuation cannot skip a message', async () => {
    api.list.mockResolvedValue(page([12, 11, 10, 9, 8, 7, 6, 5, 4, 3], 12));
    await start();
    feed.filter.value = 'unread';
    await flushPromises();
    api.get.mockResolvedValueOnce(row(12));
    await feed.toggle(feed.rows.value[0]!);
    expect(feed.expanded.value).toContain(12);
    expect(feed.rows.value[0]!.read_at).not.toBeNull();
    api.list.mockResolvedValueOnce(page([11, 10, 9, 8, 7, 6, 5, 4, 3, 2], 11));
    api.list.mockResolvedValueOnce(page([1], 11));
    await feed.more();
    expect(feed.rows.value.map((item) => item.id)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(feed.hasMore.value).toBe(false);
  });
  it('never marks a message read when its detail request completes after the feed closes', async () => {
    api.list.mockResolvedValueOnce(page([1], 1));
    await start();
    let complete!: (value: unknown) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = feed.toggle(feed.rows.value[0]!);
    wrapper.unmount();
    complete(row(1));
    await pending;
    expect(api.read).not.toHaveBeenCalled();
  });
  it('rebases when messages expire or are deleted elsewhere between loaded pages', async () => {
    api.list.mockResolvedValueOnce(page([12, 11, 10, 9, 8, 7, 6, 5, 4, 3], 12));
    await start();
    api.list.mockResolvedValueOnce(page([1], 11));
    api.list.mockResolvedValueOnce(page([11, 10, 9, 8, 7, 6, 5, 4, 3, 2], 11));
    api.list.mockResolvedValueOnce(page([1], 11));
    await feed.more();
    expect(feed.rows.value.map((item) => item.id)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(feed.hasMore.value).toBe(false);
  });
});

describe('message ID navigation', () => {
  it('loads just the targeted row, expands its full body and marks it read once', async () => {
    api.list.mockResolvedValue(page([42], 1));
    api.get.mockResolvedValue(row(42));
    await start(42);
    expect(api.list).toHaveBeenCalledWith(false, {
      id: 42,
      f: 'id,title,summary,type,published_at,read_at',
      p: 1,
      s: 10,
    });
    expect(api.get).toHaveBeenCalledExactlyOnceWith(42, false);
    expect(api.read).toHaveBeenCalledExactlyOnceWith(42);
    expect(feed.expanded.value).toEqual([42]);
    expect(feed.rows.value[0]?.content).toBe('Body');
    await feed.refresh();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(feed.expanded.value).toEqual([42]);
  });
  it('clearing an ID discards its late list response and restores the full feed', async () => {
    let complete!: (value: unknown) => void;
    api.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await start(42);
    api.list.mockResolvedValueOnce(page([99, 42], 2));
    messageId.value = undefined;
    await flushPromises();
    complete(page([42], 1));
    await flushPromises();
    expect(feed.rows.value.map((item) => item.id)).toEqual([99, 42]);
    expect(feed.expanded.value).toEqual([]);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.read).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenLastCalledWith(false, {
      f: 'id,title,summary,type,published_at,read_at',
      p: 1,
      s: 10,
    });
  });
  it('keeps an unavailable ID as an empty filter without requesting or reading its detail', async () => {
    api.list.mockResolvedValueOnce(page([], 0));
    await start(42);
    expect(messageId.value).toBe(42);
    expect(feed.total.value).toBe(0);
    expect(feed.error.value).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.read).not.toHaveBeenCalled();
  });
});

describe('inbox actions and lifecycle', () => {
  it('does not show a failed unread-count request as zero unread messages', async () => {
    api.list.mockResolvedValue(page([1], 1));
    api.count.mockRejectedValue(new Error('offline'));
    await start();
    expect(feed.rows.value).toHaveLength(1);
    expect(feed.error.value).toBe(false);
    expect(feed.unread.value).toBeUndefined();
  });

  it('never acknowledges a message whose detail failed and permits detail retry', async () => {
    api.list.mockResolvedValue(page([1], 1));
    api.get
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(row(1));
    await start();
    await feed.toggle(feed.rows.value[0]!);
    expect(feed.detailError.value).toBe(1);
    expect(feed.expanded.value).toEqual([]);
    expect(api.read).not.toHaveBeenCalled();
    await feed.toggle(feed.rows.value[0]!);
    expect(feed.detailError.value).toBeUndefined();
    expect(feed.expanded.value).toEqual([1]);
    expect(api.read).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('does not mark an already-read message again', async () => {
    api.list.mockResolvedValue(page([1], 1));
    api.get.mockResolvedValue(row(1, 123));
    await start();
    await feed.toggle(feed.rows.value[0]!);
    expect(api.read).not.toHaveBeenCalled();
    expect(feed.expanded.value).toEqual([1]);
  });

  it('retries only the unfinished portion of a partially failed bulk deletion', async () => {
    api.list.mockResolvedValue(page([1, 2], 2));
    api.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    await start();
    feed.check(1, true);
    feed.check(2, true);
    feed.confirmAction(false, [1, 2], true);
    const options = vi.mocked(Modal.confirm).mock.calls[0]![0];
    const onOk = options.onOk!;
    await expect(onOk()).rejects.toThrow('offline');
    expect(feed.selected.value).toEqual([2]);
    expect(feed.busy.value).toBe(false);
    await onOk();
    expect(api.remove.mock.calls).toEqual([
      [1, false],
      [2, false],
      [2, false],
    ]);
    expect(feed.selected.value).toEqual([]);
  });

  it('discards a late count from a previous account and clears its search history', async () => {
    api.list.mockResolvedValue(page([1], 1));
    let finish!: (value: unknown) => void;
    api.count.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await start();
    feed.draft.value = 'private';
    feed.search();
    await flushPromises();
    api.count.mockResolvedValue({
      user_id: 2,
      count: 2,
      latest_unread_at: 20,
      observed_at: 100,
    });
    state.user.userInfo.userId = 2;
    await flushPromises();
    finish({ user_id: 1, count: 99, latest_unread_at: 99, observed_at: 100 });
    await flushPromises();
    expect(feed.unread.value).toBe(2);
    expect(feed.query.value).toBe('');
    expect(feed.draft.value).toBe('');
    expect(feed.options.value).toEqual([]);
    expect(api.count).toHaveBeenLastCalledWith(2);
  });

  it('cancels scheduled search, suggestions and polling when unmounted', async () => {
    vi.useFakeTimers();
    api.list.mockResolvedValue(page([1], 1));
    await start();
    feed.draft.value = 'draft';
    feed.suggest('draft');
    feed.scheduleSearch();
    wrapper.unmount();
    const calls = api.list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('cinch-msg-changed'));
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(api.list).toHaveBeenCalledTimes(calls);
  });
});
