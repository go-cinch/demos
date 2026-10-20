import { afterEach, describe, expect, it, vi } from 'vitest';

import { canCloseTabPaths, registerTabCloseGuard } from './tab-close-guards';

const cleanup: (() => void)[] = [];
const register = (path: string, guard: () => boolean | Promise<boolean>) => {
  const dispose = registerTabCloseGuard(path, guard);
  cleanup.push(dispose);
  return dispose;
};
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
});

describe('tab close guards', () => {
  it('deduplicates paths and permits unguarded tabs', async () => {
    const guard = vi.fn(() => true);
    register('/editor', guard);
    await expect(
      canCloseTabPaths(['/editor', '/editor', '/home']),
    ).resolves.toBe(true);
    expect(guard).toHaveBeenCalledOnce();
  });
  it('waits for a pending decision before prompting another tab and stops on cancellation', async () => {
    let decide!: (allowed: boolean) => void;
    register(
      '/first',
      () =>
        new Promise((resolve) => {
          decide = resolve;
        }),
    );
    const next = vi.fn(() => true);
    register('/second', next);
    const pending = canCloseTabPaths(['/first', '/second']);
    expect(next).not.toHaveBeenCalled();
    decide(false);
    await expect(pending).resolves.toBe(false);
    expect(next).not.toHaveBeenCalled();
  });
  it('does not unregister a replacement guard when an older component unmounts', async () => {
    const old = register('/editor', () => true);
    const current = register('/editor', () => false);
    old();
    await expect(canCloseTabPaths(['/editor'])).resolves.toBe(false);
    current();
    await expect(canCloseTabPaths(['/editor'])).resolves.toBe(true);
  });
  it('propagates guard errors so callers cannot silently discard the draft', async () => {
    register('/editor', async () => {
      throw new Error('cannot save');
    });
    await expect(canCloseTabPaths(['/editor'])).rejects.toThrow('cannot save');
  });
});
