import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('registration-to-login credentials', () => {
  it('hands the successful registration to login once without persisting it', async () => {
    const write = vi.fn(() => {
      throw new Error('credentials must stay in memory');
    });
    vi.stubGlobal('localStorage', { setItem: write });
    vi.stubGlobal('sessionStorage', { setItem: write });
    vi.stubGlobal('history', { pushState: write, replaceState: write });
    const handoff = await import('./registration-login');
    expect(handoff.consumeRegistrationLogin()).toBeUndefined();
    handoff.setRegistrationLogin('abc123', 'new-account-password');
    expect(handoff.consumeRegistrationLogin()).toEqual({
      username: 'abc123',
      password: 'new-account-password',
    });
    expect(handoff.consumeRegistrationLogin()).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });

  it('loses unconsumed credentials when the app reloads', async () => {
    const handoff = await import('./registration-login');
    handoff.setRegistrationLogin('abc123', 'new-account-password');
    vi.resetModules();
    const reloaded = await import('./registration-login');
    expect(reloaded.consumeRegistrationLogin()).toBeUndefined();
  });
});
