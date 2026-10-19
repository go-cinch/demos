import { describe, expect, it, vi } from "vitest";
import { MessageFeed } from "./message-feed";
import type { Msg, MsgPage } from "./msg";
const row = (id: number, read_at: number | null = null): Msg => ({
  id,
  title: `Message ${id}`,
  content: "Content",
  type: "notice",
  scope: "all",
  sender_id: null,
  published_at: id,
  expired_at: null,
  read_at,
});
const page = (ids: number[], total: number): MsgPage => ({
  items: ids.map((id) => row(id)),
  t: total,
  p: 1,
  s: 2,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("message feed", () => {
  it("appends the next page once, deduplicates overlapping rows, and stops at the end", async () => {
    const pending = deferred<MsgPage>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([5, 4], 5))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(page([1], 5));
    const feed = new MessageFeed(fetch, 2);
    await feed.load();
    const request = feed.loadMore();
    await feed.loadMore();
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([1, 2]);
    pending.resolve(page([4, 3], 5));
    await request;
    expect(feed.snapshot().rows.map((row) => row.id)).toEqual([5, 4, 3]);
    await feed.loadMore();
    await feed.loadMore();
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    expect(feed.snapshot().hasMore).toBe(false);
  });
  it("keeps existing rows on a next-page failure and retries the same page", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([4, 3], 4))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(page([2, 1], 4));
    const feed = new MessageFeed(fetch, 2);
    await feed.load();
    await feed.loadMore();
    expect(feed.snapshot().rows.map((row) => row.id)).toEqual([4, 3]);
    expect(feed.snapshot().moreError).toBe("Offline");
    expect(feed.snapshot().loadingMore).toBe(false);
    await feed.loadMore();
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([1, 2, 2]);
    expect(feed.snapshot().rows).toHaveLength(4);
    expect(feed.snapshot().moreError).toBe("");
  });
  it("refreshes all loaded pages without hiding messages or losing updated read states", async () => {
    const refreshed = { ...page([4, 3], 4), items: [row(4, 100), row(3)] };
    const pending = deferred<MsgPage>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([4, 3], 4))
      .mockResolvedValueOnce(page([2, 1], 4))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(page([2, 1], 4));
    const feed = new MessageFeed(fetch, 2);
    await feed.load();
    await feed.loadMore();
    const refresh = feed.load();
    expect(feed.snapshot().loading).toBe(false);
    expect(feed.snapshot().rows).toHaveLength(4);
    pending.resolve(refreshed);
    await refresh;
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([1, 2, 1, 2]);
    expect(feed.snapshot().rows[0].read_at).toBe(100);
    expect(feed.snapshot().rows).toHaveLength(4);
  });
  it("ignores late next-page responses after a refresh or a filter change", async () => {
    const pending = deferred<MsgPage>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([4, 3], 4))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(page([6, 5], 2));
    const feed = new MessageFeed(fetch, 2);
    await feed.load();
    const more = feed.loadMore();
    await feed.load();
    pending.resolve(page([2, 1], 4));
    await more;
    expect(feed.snapshot().rows.map((row) => row.id)).toEqual([6, 5]);
    const initial = deferred<MsgPage>();
    const old = new MessageFeed(() => initial.promise, 2);
    const request = old.load();
    old.dispose();
    initial.resolve(page([4, 3], 4));
    await request;
    expect(old.snapshot().rows).toEqual([]);
  });
  it("handles an empty inbox and initial-load errors without advancing a page", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(page([], 0));
    const feed = new MessageFeed(fetch, 2);
    await feed.load();
    expect(feed.snapshot().error).toBe("Offline");
    await feed.loadMore();
    expect(fetch).toHaveBeenCalledTimes(1);
    await feed.load();
    expect(feed.snapshot().error).toBe("");
    expect(feed.snapshot().hasMore).toBe(false);
    expect(feed.snapshot().loading).toBe(false);
  });
});
