import { beforeEach, describe, expect, it, vi } from 'vitest';

import { msgApi, msgChanged, msgPreviewFields, msgSentDetailFields } from './msg';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('#/api/request', () => ({ authRequestClient: client }));
beforeEach(() => vi.resetAllMocks());

describe('message service contract', () => {
  it.each([false, true])(
    'routes list, details and deletion for sent=%s',
    async (sent) => {
      const path = sent ? 'sent' : 'inbox';
      const params = {
        p: 2,
        s: 10,
        read: false,
        q: 'notice',
        f: msgPreviewFields,
      };
      client.get.mockResolvedValue({ items: [], t: 0, p: 2, s: 10 });
      await msgApi.list(sent, params);
      expect(client.get).toHaveBeenLastCalledWith(`/msg/${path}`, { params });
      await msgApi.get(7, sent);
      if (sent) {
        expect(client.get).toHaveBeenLastCalledWith('/msg/sent/7', { params: { f: msgSentDetailFields } });
        expect(msgSentDetailFields.split(',')).toContain('recipients');
        expect(msgSentDetailFields.split(',')).not.toContain('recipient_ids');
      } else {
        expect(client.get).toHaveBeenLastCalledWith('/msg/inbox/7');
      }
      await msgApi.remove(7, sent);
      expect(client.delete).toHaveBeenCalledExactlyOnceWith(`/msg/${path}/7`);
    },
  );

  it('sends idempotency, recipient lookup and compact summary fields', async () => {
    const body = {
      title: 'Notice',
      content: 'Body',
      type: 'notice' as const,
      scope: 'targeted' as const,
      recipient_ids: [7],
      expired_at: null,
    };
    client.post.mockResolvedValue({ id: 8 });
    await expect(msgApi.send(body, 'publish-once')).resolves.toEqual({ id: 8 });
    expect(client.post).toHaveBeenCalledWith('/msg', body, {
      headers: { 'x-idempotent': 'publish-once' },
    });
    await msgApi.users('reader');
    expect(client.get).toHaveBeenLastCalledWith('/msg/recipient-option', {
      params: { q: 'reader' },
    });
    await msgApi.sentSummary();
    expect(client.get).toHaveBeenLastCalledWith('/msg/sent/summary', {
      params: { f: 'total,counts' },
    });
  });

  it.each(['read', 'readAll', 'remove', 'send'] as const)(
    'invalidates in-flight unread status after %s succeeds',
    async (mutation) => {
      let finish!: (value: unknown) => void;
      client.get
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValue({ user_id: 1, count: 1 });
      const first = msgApi.count(1);
      expect(msgApi.count(1)).toBe(first);
      if (mutation === 'read') await msgApi.read(7);
      if (mutation === 'readAll') await msgApi.readAll();
      if (mutation === 'remove') await msgApi.remove(7, false);
      if (mutation === 'send')
        await msgApi.send(
          {
            title: 'Hi',
            content: 'Body',
            type: 'notice',
            scope: 'all',
            expired_at: null,
          },
          'key',
        );
      finish({ user_id: 1, count: 99 });
      await expect(first).resolves.toEqual({ user_id: 1, count: 1 });
      expect(client.get).toHaveBeenCalledTimes(2);
      expect(client.get).toHaveBeenLastCalledWith('/msg/unread-count');
      if (mutation === 'read')
        expect(client.request).toHaveBeenCalledWith('/msg/inbox/7', {
          method: 'PATCH',
          data: { read: true },
        });
      if (mutation === 'readAll')
        expect(client.post).toHaveBeenCalledWith('/msg/inbox/read-all');
    },
  );

  it('preserves the in-flight snapshot when a write fails', async () => {
    let finish!: (value: unknown) => void;
    client.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = msgApi.count(1);
    client.request.mockRejectedValue(new Error('denied'));
    await expect(msgApi.read(7)).rejects.toThrow('denied');
    finish({ count: 5 });
    await expect(first).resolves.toEqual({ count: 5 });
    expect(client.get).toHaveBeenCalledOnce();
  });

  it('emits the shared change event', () => {
    const listener = vi.fn();
    window.addEventListener('go-cinch-msg-changed', listener);
    try {
      msgChanged();
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('go-cinch-msg-changed', listener);
    }
  });
});
