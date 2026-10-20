import { describe, expect, it, vi } from 'vitest';

import { MessageStatusRequest } from './message-status-request';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('message status request coordination', () => {
  it('shares in-flight requests per user but never caches a settled count', async () => {
    const requests = new MessageStatusRequest<number>();
    const pending = deferred<number>();
    const load = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(9);
    const first = requests.get(1, load);
    expect(requests.get(1, load)).toBe(first);
    await expect(requests.get(2, load)).resolves.toBe(9);
    pending.resolve(3);
    await expect(first).resolves.toBe(3);
    await expect(requests.get(1, load)).resolves.toBe(9);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it.each(['resolve', 'reject'] as const)(
    'retries a stale %s after a completed mutation for every waiter',
    async (settle) => {
      const requests = new MessageStatusRequest<number>();
      const pending = deferred<number>();
      const load = vi
        .fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(2);
      const first = requests.get(1, load);
      requests.invalidate();
      requests.invalidate();
      const second = requests.get(1, load);
      if (settle === 'resolve') pending.resolve(99);
      else pending.reject(new Error('stale failure'));
      await expect(Promise.all([first, second])).resolves.toEqual([2, 2]);
      expect(load).toHaveBeenCalledTimes(2);
    },
  );

  it('releases a failed request so a later caller can retry', async () => {
    const requests = new MessageStatusRequest<number>();
    const failure = new Error('offline');
    const load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(0);
    await expect(requests.get(1, load)).rejects.toBe(failure);
    await expect(requests.get(1, load)).resolves.toBe(0);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
