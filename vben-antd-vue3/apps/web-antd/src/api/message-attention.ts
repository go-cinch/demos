import { userCache } from '@vben/utils/cache';

import { messageSeenEvent } from '#/api/message-events';
export interface MessageStatus {
  user_id: number;
  count: number;
  latest_unread_at: null | number;
  observed_at: number;
}
interface Visit {
  visited_at: number;
  server_at: null | number;
}
interface Storage {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
}
/** A visit acknowledges the entry indicator only; it never marks messages read. */
export class MessageAttention {
  private memory = new Map<string, Visit>();
  private prefix: string;
  private snapshots = new Map<
    number,
    { status: MessageStatus; received: number }
  >();
  private storage: Storage;
  constructor(storage: Storage, prefix: string) {
    this.storage = storage;
    this.prefix = prefix;
  }
  count(user: number | undefined) {
    return user && this.hasNew(user)
      ? this.snapshots.get(user)?.status.count || 0
      : 0;
  }
  hasNew(user: number | undefined, entry = 'inbox'): boolean {
    if (!user) return false;
    const snapshot = this.snapshots.get(user);
    if (
      !snapshot ||
      snapshot.status.count <= 0 ||
      snapshot.status.latest_unread_at === null
    )
      return false;
    const key = this.key(user, entry);
    const visit = this.read(key);
    if (!visit) return true;
    if (visit.server_at === null) {
      // The entry can be opened before its first status response. Anchor the
      // actual visit, not response arrival, to avoid swallowing later messages.
      visit.server_at =
        snapshot.status.observed_at -
        Math.max(0, snapshot.received - visit.visited_at);
      this.write(key, visit);
    }
    return snapshot.status.latest_unread_at > visit.server_at;
  }
  reset() {
    this.snapshots.clear();
    this.memory.clear();
  }
  update(status: MessageStatus) {
    const previous = this.snapshots.get(status.user_id);
    if (!previous || previous.status.observed_at <= status.observed_at)
      this.snapshots.set(status.user_id, { status, received: Date.now() });
  }
  visit(user: number | undefined, entry = 'inbox') {
    if (!user) return;
    const now = Date.now();
    const snapshot = this.snapshots.get(user);
    const serverAt = snapshot
      ? snapshot.status.observed_at + Math.max(0, now - snapshot.received)
      : null;
    const key = this.key(user, entry);
    const previous = this.read(key);
    this.write(key, {
      visited_at: now,
      server_at:
        serverAt === null ? null : Math.max(serverAt, previous?.server_at || 0),
    });
  }
  private key(user: number, entry: string) {
    return `${this.prefix}:${user}:${entry}`;
  }
  private read(key: string): undefined | Visit {
    try {
      const value = this.storage.read(key) as undefined | Visit;
      if (
        value &&
        Number.isFinite(value.visited_at) &&
        (value.server_at === null || Number.isFinite(value.server_at))
      )
        return value;
    } catch {
      /* Storage may be disabled; retain this session's acknowledgement. */
    }
    return this.memory.get(key);
  }
  private write(key: string, value: Visit) {
    this.memory.set(key, value);
    try {
      this.storage.write(key, value);
    } catch {
      /* In-memory fallback. */
    }
  }
}

const legacyPrefix = `go-cinch-message-visit:${import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth'}`;
export const messageAttention = new MessageAttention(
  {
    read: (key) => {
      const cache = userCache.current();
      cache.migrate(key, key.replace('message-visit', legacyPrefix));
      return cache.get(key);
    },
    write: (key, value) => userCache.current().set(key, value),
  },
  'message-visit',
);
userCache.onChange(() => messageAttention.reset());
export function visitMessages(user: number | undefined) {
  messageAttention.visit(user);
  window.dispatchEvent(new Event(messageSeenEvent));
}
