import { beforeEach, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('#/api/core/auth', () => ({ getSystemPropertiesApi: request }));

async function newDocument() {
  vi.resetModules();
  const { loadSystemProperties } = await import('./system-properties');
  return loadSystemProperties;
}

beforeEach(() => {
  localStorage.clear();
  request.mockReset();
});

it('shares concurrent reads, refreshes once per document and discards an older result', async () => {
  request.mockResolvedValueOnce({ email_enabled: true });
  const first = await newDocument();
  const pending = first();
  expect(first()).toBe(pending);
  expect(await pending).toEqual({
    registration_enabled: false,
    email_enabled: true,
    totp_enabled: false,
  });
  expect(first()).toBe(pending);
  expect(request).toHaveBeenCalledTimes(1);

  request.mockResolvedValueOnce({
    registration_enabled: true,
    email_enabled: false,
    totp_enabled: true,
  });
  const refreshed = await newDocument();
  expect(await refreshed()).toEqual({
    registration_enabled: true,
    email_enabled: false,
    totp_enabled: true,
  });

  request.mockRejectedValueOnce(new Error('offline'));
  const offline = await newDocument();
  expect(await offline()).toBeUndefined();
  expect(await offline()).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(3);
});

it('keeps password login available after a failed first request without retrying on navigation', async () => {
  localStorage.setItem(
    'cinch-system-properties:/api/auth',
    JSON.stringify({ email_enabled: true }),
  );
  request.mockRejectedValue(new Error('offline'));
  const load = await newDocument();
  expect(await load()).toBeUndefined();
  expect(await load()).toBeUndefined();
  expect(request).toHaveBeenCalledOnce();
});

it.each(['offline', 'disabled'])(
  'recovers the profile flags at login after an %s snapshot',
  async (initial) => {
    if (initial === 'offline')
      request.mockRejectedValueOnce(new Error('offline'));
    else
      request.mockResolvedValueOnce({
        email_enabled: false,
        totp_enabled: false,
      });
    const load = await newDocument();
    await load();
    const { emailEnabled, totpEnabled } = await import('./system-properties');
    expect(emailEnabled.value).toBe(false);
    expect(totpEnabled.value).toBe(false);

    let resolve!: (value: unknown) => void;
    request.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const login = load({ fresh: true });
    expect(load({ fresh: true })).toBe(login);
    expect(load()).toBe(login);
    resolve({ email_enabled: true, totp_enabled: true });
    await login;

    expect(emailEnabled.value).toBe(true);
    expect(totpEnabled.value).toBe(true);
    expect(load()).toBe(login);
    expect(request).toHaveBeenCalledTimes(2);
  },
);

it.each(['offline', 'invalid', 'disabled'])(
  'clears previously enabled flags when revalidation is %s',
  async (result) => {
    request.mockResolvedValueOnce({ email_enabled: true, totp_enabled: true });
    const load = await newDocument();
    await load();
    if (result === 'offline')
      request.mockRejectedValueOnce(new Error('offline'));
    else
      request.mockResolvedValueOnce(
        result === 'invalid'
          ? {}
          : { email_enabled: false, totp_enabled: false },
      );
    await load({ fresh: true });
    const { emailEnabled, totpEnabled } = await import('./system-properties');
    expect(emailEnabled.value).toBe(false);
    expect(totpEnabled.value).toBe(false);
  },
);

it.each([{}, { email_enabled: 'true' }, null])(
  'treats an invalid response as disabled',
  async (response) => {
    request.mockResolvedValueOnce(response);
    const load = await newDocument();
    expect(await load()).toBeUndefined();
    const { emailEnabled, totpEnabled } = await import('./system-properties');
    expect(emailEnabled.value).toBe(false);
    expect(totpEnabled.value).toBe(false);
  },
);

it.each([
  [{ email_enabled: false, totp_enabled: true }, false, true],
  [{ email_enabled: true, totp_enabled: true }, true, true],
  [{ email_enabled: true, totp_enabled: 'false' }, true, false],
  [{ totp_enabled: true }, false, true],
] as const)(
  'reads the two deployment flags independently',
  async (response, email, mfa) => {
    request.mockResolvedValueOnce(response);
    const load = await newDocument();
    await load();
    const { emailEnabled, totpEnabled } = await import('./system-properties');
    expect(emailEnabled.value).toBe(email);
    expect(totpEnabled.value).toBe(mfa);
  },
);

it('uses enabled developer-configured language names from public options', async () => {
  request.mockResolvedValue({
    email_enabled: false,
    totp_enabled: false,
    default_locale: 'fr-FR',
    locales: [
      { tag: 'fr-FR', name: 'Français personnalisé', enabled: true },
      { tag: 'zh-CN', name: '中文', enabled: true },
      { tag: 'en-US', name: 'English', enabled: false },
    ],
  });
  const load = await newDocument();
  const options = await load();
  expect(options?.default_locale).toBe('fr-FR');
  const constants = await import('@vben/constants');
  expect(constants.getSupportLanguages()).toEqual([
    { label: 'Français personnalisé', value: 'fr-FR' },
    { label: '中文', value: 'zh-CN' },
  ]);
});
