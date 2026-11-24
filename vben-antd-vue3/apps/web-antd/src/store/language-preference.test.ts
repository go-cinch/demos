import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  preferences: { app: { locale: 'en-US' } },
  update: vi.fn(),
}));
vi.mock('@vben/locales', () => ({ loadLocaleMessages: mocks.load }));
vi.mock('@vben/preferences', () => ({
  preferences: mocks.preferences,
  preferencesManager: {
    getInitialPreferences: () => ({ app: { locale: 'en-US' } }),
  },
  updatePreferences: mocks.update,
}));
vi.mock('#/api/core/user', () => ({ updateUserLanguageApi: mocks.save }));
vi.mock('#/locales/catalog', () => ({
  resolveCatalogLocale: (locale: string) =>
    ['en-US', 'fr-FR', 'zh-CN'].includes(locale) ? locale : 'en-US',
}));

const day = 86_400_000;
const current = () => true;
async function coordinator() {
  const languageModule = await import('./language-preference');
  return languageModule.createLanguagePreferenceSync();
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
  mocks.preferences.app.locale = 'en-US';
  mocks.update.mockImplementation((value) => {
    mocks.preferences.app.locale = value.app.locale;
  });
  mocks.save.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('account language precedence', () => {
  it('applies a pending locale before the profile request and saves it during sync', async () => {
    const preferences = await coordinator();
    await preferences.select('zh-CN', false, current);
    await preferences.applyPendingSelection(Date.now());
    expect(mocks.preferences.app.locale).toBe('zh-CN');
    expect(mocks.load).toHaveBeenCalledWith('zh-CN');
    expect(mocks.save).not.toHaveBeenCalled();

    await preferences.sync('en-US', current);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith('zh-CN');
  });

  it.each([
    ['zh-CN', day + 1],
    ['disabled', 0],
  ])('leaves the current locale for a pending %s selection aged %i ms', async (locale, age) => {
    const preferences = await coordinator();
    await preferences.select(locale, false, current);
    vi.setSystemTime(Date.now() + age);
    await preferences.applyPendingSelection(Date.now());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('initializes empty metadata from the deployment default even after another account used French', async () => {
    mocks.preferences.app.locale = 'fr-FR';
    const preferences = await coordinator();
    await preferences.sync('', current);
    expect(mocks.save).toHaveBeenCalledWith('en-US');
    expect(mocks.preferences.app.locale).toBe('en-US');
  });
  it('restores saved Chinese over default English without recording a manual selection', async () => {
    const preferences = await coordinator();
    await preferences.sync('zh-CN', current);
    expect(mocks.preferences.app.locale).toBe('zh-CN');
    expect(mocks.load).toHaveBeenCalledWith('zh-CN');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it.each([0, day - 1, day])(
    'overrides account language for a manual choice made %i milliseconds ago, including after reload',
    async (age) => {
      const preferences = await coordinator();
      await preferences.select('en-US', false, current);
      vi.setSystemTime(Date.now() + age);
      vi.resetModules();
      const preferences2 = await coordinator();
      await preferences2.sync('zh-CN', current);
      expect(mocks.save).toHaveBeenCalledWith('en-US');
      expect(sessionStorage.length).toBe(0);
      mocks.save.mockClear();
      const preferences3 = await coordinator();
      await preferences3.sync('zh-CN', current);
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.preferences.app.locale).toBe('zh-CN');
    },
  );
  it('uses the successful login time when onboarding finishes after the one-day boundary', async () => {
    const sync = await coordinator();
    await sync.select('en-US', false, current);
    const acceptedAt = Date.now() + day - 1;
    vi.setSystemTime(Date.now() + day + 60_000);
    await sync.sync('zh-CN', current, acceptedAt);
    expect(mocks.save).toHaveBeenCalledWith('en-US');
  });

  it('expires the manual override after one day', async () => {
    const sync = await coordinator();
    await sync.select('en-US', false, current);
    vi.setSystemTime(Date.now() + day + 1);
    await sync.sync('zh-CN', current);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preferences.app.locale).toBe('zh-CN');
    expect(sessionStorage.length).toBe(0);
  });
  it('retains a pending choice after a failed write and consumes it only on success', async () => {
    const sync = await coordinator();
    await sync.select('en-US', false, current);
    mocks.save.mockRejectedValueOnce(new Error('offline'));
    await expect(sync.sync('zh-CN', current)).rejects.toThrow('offline');
    expect(sessionStorage.length).toBe(1);
    await sync.sync('zh-CN', current);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not apply or consume a previous session response after logout', async () => {
    const sync = await coordinator();
    await sync.select('zh-CN', false, current);
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let active = true;
    const pending = sync.sync('en-US', () => active);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled());
    active = false;
    finish();
    await pending;
    expect(mocks.update).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(1);
  });
  it('saves logged-in selections asynchronously in order without creating an anonymous override', async () => {
    const sync = await coordinator();
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const first = sync.select('zh-CN', true, current);
    const second = sync.select('en-US', true, current);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([first, second]);
    expect(mocks.save.mock.calls.map(([language]) => language)).toEqual([
      'zh-CN',
      'en-US',
    ]);
    expect(sessionStorage.length).toBe(0);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('ignores a pending choice that has been disabled', async () => {
    const sync = await coordinator();
    await sync.select('removed', false, current);
    await sync.sync('zh-CN', current);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preferences.app.locale).toBe('zh-CN');
  });
});
