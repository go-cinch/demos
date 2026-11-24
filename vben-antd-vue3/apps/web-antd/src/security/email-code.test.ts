import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import { userCache } from '@vben/utils/cache';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emailBrowserUUID, useEmailCode } from './email-code';

describe('server email countdown', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
  });
  afterEach(() => vi.useRealTimers());
  it('retains one UUID across page instances without retaining codes or proofs', () => {
    const first = emailBrowserUUID();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(emailBrowserUUID()).toBe(first);
    expect(localStorage.length).toBe(1);
  });
  it.each(['device', 'unscoped'])(
    'retains a browser UUID from %s storage after upgrading',
    (scope) => {
      const cache = userCache.device();
      const legacy = 'cinch-email-browser-uuid';
      const oldKey = scope === 'device' ? cache.key(legacy) : legacy;
      const uuid = 'bcd7462e-fc99-4d7c-b45b-b097d31a6689';
      localStorage.setItem(oldKey, uuid);
      expect(emailBrowserUUID()).toBe(uuid);
      expect(cache.getItem('email-browser-uuid')).toBe(uuid);
      expect(localStorage.getItem(oldKey)).toBeNull();
    },
  );
  it('uses server time rather than the browser wall clock and restores from a fresh status', async () => {
    let countdown!: ReturnType<typeof useEmailCode>;
    const wrapper = mount(
      defineComponent({
        setup() {
          countdown = useEmailCode();
          return () => null;
        },
      }),
    );
    countdown.accept({
      server_time: 1000,
      retry_at: 61_000,
      expired_at: 301_000,
      verification_id: 'context',
    });
    expect(countdown.remaining.value).toBe(60);
    await vi.advanceTimersByTimeAsync(22_000);
    expect(countdown.remaining.value).toBe(38);
    countdown.clearVerification();
    expect(countdown.state.value?.verification_id).toBeUndefined();
    expect(countdown.remaining.value).toBe(38);
    countdown.accept({
      server_time: 43_000,
      retry_at: 61_000,
      expired_at: 301_000,
      verification_id: 'context',
    });
    expect(countdown.remaining.value).toBe(18);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(countdown.remaining.value).toBe(0);
    countdown.acceptError({
      response: { data: { server_time: 62_000, retry_at: 122_000 } },
    });
    expect(countdown.remaining.value).toBe(60);
    expect(countdown.expired.value).toBe(true);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
