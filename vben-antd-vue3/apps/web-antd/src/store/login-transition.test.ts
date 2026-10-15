import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  playLoginTransition,
  registerLoginTransition,
} from './login-transition';

describe('login transition lifecycle', () => {
  let unregister: (() => void) | undefined;
  afterEach(() => {
    unregister?.();
    vi.useRealTimers();
  });

  it('continues immediately when no illustration is mounted', async () => {
    await expect(playLoginTransition()).resolves.toBeUndefined();
  });

  it('does not remove a new illustration when the previous one unmounts', async () => {
    const old = vi.fn();
    const removeOld = registerLoginTransition(old);
    const current = vi.fn();
    unregister = registerLoginTransition(current);
    removeOld();
    await playLoginTransition();
    expect(current).toHaveBeenCalledOnce();
    expect(old).not.toHaveBeenCalled();
  });

  it('contains animation errors without rejecting sign-in', async () => {
    unregister = registerLoginTransition(() => {
      throw new Error('animation failed');
    });
    await expect(playLoginTransition()).resolves.toBeUndefined();
  });

  it('bounds a stalled animation so navigation cannot hang', async () => {
    vi.useFakeTimers();
    unregister = registerLoginTransition(() => new Promise<void>(() => {}));
    const complete = vi.fn();
    const waiting = playLoginTransition().then(complete);
    await vi.advanceTimersByTimeAsync(2199);
    expect(complete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(complete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
