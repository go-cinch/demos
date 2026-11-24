import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PreferenceManager } from '../src/preferences';

describe('explicit user preference changes', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  it('emits only deliberate edits and uses configured defaults for reset while preserving global language and timezone', async () => {
    const manager = new PreferenceManager();
    const listener = vi.fn();
    manager.onUserPreferencesChange(listener);
    manager.setPreferenceDefaults({ theme: { mode: 'auto', radius: '0.75' } });
    manager.updatePreferences({
      app: { locale: 'zh-CN', timezone: 'America/New_York' },
      theme: { mode: 'light' },
    });
    expect(listener).not.toHaveBeenCalled();
    manager.updateUserPreferences({ theme: { radius: '0.5' } });
    expect(listener).toHaveBeenLastCalledWith({
      preferences: { theme: { radius: '0.5' } },
    });
    await manager.resetUserPreferences();
    expect(listener).toHaveBeenLastCalledWith({ reset: true });
    expect(manager.getPreferences().theme).toMatchObject({
      mode: 'auto',
      radius: '0.75',
    });
    expect(manager.getPreferences().app.locale).toBe('zh-CN');
    expect(manager.getPreferences().app.timezone).toBe('America/New_York');
    listener.mockClear();
    await manager.clearCache();
    expect(listener).not.toHaveBeenCalled();
  });
});
