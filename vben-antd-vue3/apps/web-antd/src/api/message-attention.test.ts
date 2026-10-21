import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageAttention, visitMessages } from './message-attention';

const status = (overrides = {}) => ({
  user_id: 1,
  count: 3,
  latest_unread_at: 900,
  observed_at: 1000,
  ...overrides,
});
let stored: Map<string, unknown>;
let attention: MessageAttention;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  stored = new Map();
  attention = new MessageAttention(
    {
      read: (key) => stored.get(key),
      write: (key, value) => stored.set(key, value),
    },
    'test',
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('message entry acknowledgement', () => {
  it('hides the entry count after visiting without changing the server unread count', () => {
    const snapshot = status();
    attention.update(snapshot);
    expect(attention.count(1)).toBe(3);
    attention.visit(1);
    expect(attention.count(1)).toBe(0);
    expect(snapshot.count).toBe(3);
    attention.update(
      status({ count: 4, latest_unread_at: 1001, observed_at: 1100 }),
    );
    expect(attention.count(1)).toBe(4);
  });

  it('isolates accounts and entry names and ignores out-of-order responses', () => {
    attention.update(status());
    attention.update(status({ user_id: 2 }));
    attention.visit(1);
    expect(attention.hasNew(1)).toBe(false);
    expect(attention.hasNew(1, 'bell')).toBe(true);
    expect(attention.hasNew(2)).toBe(true);
    attention.update(
      status({ count: 20, latest_unread_at: 5000, observed_at: 999 }),
    );
    expect(attention.hasNew(1)).toBe(false);
    expect(attention.hasNew(undefined)).toBe(false);
    expect(attention.hasNew(0)).toBe(false);
  });

  it('anchors a visit before the first response to its actual time', () => {
    attention.visit(1);
    vi.setSystemTime(10_200);
    attention.update(status({ observed_at: 1200, latest_unread_at: 1100 }));
    expect(attention.hasNew(1)).toBe(true);
    expect(stored.get('test:1:inbox')).toEqual({
      visited_at: 10_000,
      server_at: 1000,
    });
    attention.update(status({ observed_at: 1300, latest_unread_at: 1000 }));
    expect(attention.hasNew(1)).toBe(false);
  });

  it('uses elapsed local time against server time and never moves acknowledgement backwards', () => {
    attention.update(status());
    vi.setSystemTime(10_500);
    attention.visit(1);
    expect(stored.get('test:1:inbox')).toEqual({
      visited_at: 10_500,
      server_at: 1500,
    });
    vi.setSystemTime(9_000);
    attention.visit(1);
    expect(stored.get('test:1:inbox')).toEqual({
      visited_at: 9_000,
      server_at: 1500,
    });
    attention.update(status({ latest_unread_at: 1500, observed_at: 1600 }));
    expect(attention.hasNew(1)).toBe(false);
  });

  it('retains acknowledgement for the session when browser storage throws', () => {
    attention = new MessageAttention(
      {
        read: () => {
          throw new Error('blocked');
        },
        write: () => {
          throw new Error('quota');
        },
      },
      'test',
    );
    attention.update(status());
    attention.visit(1);
    expect(attention.hasNew(1)).toBe(false);
    attention.update(status({ observed_at: 1100, latest_unread_at: 1050 }));
    expect(attention.hasNew(1)).toBe(true);
  });

  it.each([{ count: 0 }, { count: -1 }, { latest_unread_at: null }])(
    'does not signal an empty status: %j',
    (value) => {
      attention.update(status(value));
      expect(attention.hasNew(1)).toBe(false);
      expect(attention.count(1)).toBe(0);
    },
  );

  it('notifies mounted entry indicators when messages are visited', () => {
    const listener = vi.fn();
    window.addEventListener('go-cinch-msg-seen', listener);
    try {
      visitMessages(undefined);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('go-cinch-msg-seen', listener);
    }
  });
});
