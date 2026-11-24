import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  format: vi.fn(),
  update: vi.fn(),
  preferences: { app: { timezone: '' } },
}));
vi.mock('@vben/preferences', () => ({
  preferences: mocks.preferences,
  updatePreferences: mocks.update,
}));
vi.mock('@vben/utils', () => ({ setCurrentTimezone: mocks.format }));
vi.mock('#/api/core/user', () => ({ updateUserTimezoneApi: mocks.save }));
const day = 86_400_000;
const current = () => true;
const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const savedZone =
  systemZone === 'America/New_York' ? 'Asia/Tokyo' : 'America/New_York';
async function module() {
  return import('./timezone-preference');
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
  mocks.preferences.app.timezone = '';
  mocks.save.mockResolvedValue(undefined);
  mocks.update.mockImplementation((value) => {
    mocks.preferences.app.timezone = value.app.timezone;
  });
});
afterEach(() => vi.useRealTimers());

describe('global account timezone', () => {
  it('starts from the system zone without treating a previous account cache as a manual choice', async () => {
    mocks.preferences.app.timezone = 'Pacific/Honolulu';
    const timezoneModule = await module();
    timezoneModule.initializeTimezonePreference();
    expect(mocks.preferences.app.timezone).toBe(systemZone);
    expect(mocks.format).toHaveBeenLastCalledWith(systemZone);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it('initializes empty metadata from the current system timezone', async () => {
    const api = await module();
    api.initializeTimezonePreference();
    await api.createTimezonePreferenceSync().sync('', current);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(systemZone);
  });
  it('resolves an empty runtime timezone after clearing caches into a concrete system timezone', async () => {
    const api = await module();
    await api.createTimezonePreferenceSync().sync('', current);
    expect(mocks.save).toHaveBeenCalledWith(systemZone);
    expect(mocks.preferences.app.timezone).toBe(systemZone);
    expect(mocks.format).toHaveBeenLastCalledWith(systemZone);
  });

  it('restores the account timezone over the system default and updates date formatting without writing a manual choice', async () => {
    const api = await module();
    api.initializeTimezonePreference();
    await api.createTimezonePreferenceSync().sync(savedZone, current);
    expect(mocks.preferences.app.timezone).toBe(savedZone);
    expect(mocks.format).toHaveBeenLastCalledWith(savedZone);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  it.each([0, day - 1, day])(
    'applies an anonymous manual choice made %i milliseconds before login, including after reload',
    async (age) => {
      const timezoneModule = await module();
      const sync = timezoneModule.createTimezonePreferenceSync();
      await sync.select('Asia/Tokyo', false, current);
      localStorage.setItem(
        'cinch-pending-language',
        JSON.stringify({ language: 'zh-CN', selectedAt: Date.now() }),
      );
      vi.setSystemTime(Date.now() + age);
      vi.resetModules();
      const reloaded = await module();
      reloaded.initializeTimezonePreference();
      await reloaded.createTimezonePreferenceSync().sync(savedZone, current);
      expect(mocks.save).toHaveBeenCalledExactlyOnceWith('Asia/Tokyo');
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.getItem('cinch-pending-language')).not.toBeNull();
    },
  );
  it('expires manual choices after 24 hours and uses the account timezone', async () => {
    const timezoneModule = await module();
    const sync = timezoneModule.createTimezonePreferenceSync();
    await sync.select('Asia/Tokyo', false, current);
    vi.setSystemTime(Date.now() + day + 1);
    await sync.sync(savedZone, current);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preferences.app.timezone).toBe(savedZone);
    expect(sessionStorage.length).toBe(0);
  });
  it('measures expiry at successful login even if onboarding finishes after the deadline', async () => {
    const timezoneModule = await module();
    const sync = timezoneModule.createTimezonePreferenceSync();
    await sync.select('Asia/Tokyo', false, current);
    const acceptedAt = Date.now() + day - 1;
    vi.setSystemTime(acceptedAt + 60_000);
    await sync.sync(savedZone, current, acceptedAt);
    expect(mocks.save).toHaveBeenCalledWith('Asia/Tokyo');
  });
  it('keeps the local selection while saving asynchronously and orders rapid signed-in switches', async () => {
    const timezoneModule = await module();
    const sync = timezoneModule.createTimezonePreferenceSync();
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    mocks.preferences.app.timezone = 'Asia/Tokyo';
    const first = sync.select('Asia/Tokyo', true, current);
    mocks.preferences.app.timezone = 'Europe/London';
    const second = sync.select('Europe/London', true, current);
    expect(mocks.preferences.app.timezone).toBe('Europe/London');
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([first, second]);
    expect(mocks.save.mock.calls).toEqual([['Asia/Tokyo'], ['Europe/London']]);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not restore an older info snapshot over a manual timezone write that was still in flight', async () => {
    const timezoneModule = await module();
    const sync = timezoneModule.createTimezonePreferenceSync();
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    mocks.preferences.app.timezone = 'Asia/Tokyo';
    const saving = sync.select('Asia/Tokyo', true, current);
    const restoring = sync.sync('America/New_York', current);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([saving, restoring]);
    expect(mocks.preferences.app.timezone).toBe('Asia/Tokyo');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('retains anonymous choices after a save failure and consumes them only after successful persistence', async () => {
    const timezoneModule = await module();
    const sync = timezoneModule.createTimezonePreferenceSync();
    await sync.select('Asia/Tokyo', false, current);
    mocks.save.mockRejectedValueOnce(new Error('offline'));
    await expect(sync.sync(savedZone, current)).rejects.toThrow('offline');
    expect(sessionStorage.length).toBe(1);
    await sync.sync(savedZone, current);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not apply a stale account response after logout', async () => {
    const timezoneModule = await module();
    const sync = timezoneModule.createTimezonePreferenceSync();
    await sync.select('Asia/Tokyo', false, current);
    let finish!: () => void;
    let active = true;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const response = sync.sync(savedZone, () => active);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    active = false;
    finish();
    await response;
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not import a legacy pending timezone with unknown account ownership', async () => {
    localStorage.setItem(
      'cinch-pending-ui-preferences:vben_pc',
      JSON.stringify({
        'app.timezone': { value: 'Asia/Tokyo', changed_at: Date.now() },
      }),
    );
    localStorage.setItem(
      'cinch-pending-timezone',
      JSON.stringify({
        timezone: 'Asia/Tokyo',
        selectedAt: Date.now(),
      }),
    );
    const api = await module();
    api.initializeTimezonePreference();
    await api.createTimezonePreferenceSync().sync(savedZone, current);
    expect(mocks.preferences.app.timezone).toBe(savedZone);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['', 'Local', '+01:00', 'Invalid/Timezone', 'Asia/Tokyo '])(
    'rejects unsupported timezone %s',
    async (value) => {
      const timezoneModule = await module();
      expect(timezoneModule.isValidTimezone(value)).toBe(false);
    },
  );
});
