const historyKey = () => `LOGIN_ACCOUNT_HISTORY_${location.hostname}`;

function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

export function clearLegacyLoginCredentials(): void {
  for (const prefix of [
    'REMEMBER_ME_CREDENTIALS_',
    'REMEMBER_ME_USERNAME_',
    'REMEMBER_ME_ACCOUNT_',
  ]) {
    try {
      localStorage.removeItem(`${prefix}${location.hostname}`);
    } catch {
      // Browser storage may be unavailable; login must remain usable.
    }
  }
}

export function readLoginAccountHistory(): string[] {
  clearLegacyLoginCredentials();
  try {
    const accounts = normalizeHistory(
      JSON.parse(localStorage.getItem(historyKey()) || '[]'),
    );
    writeHistory(accounts);
    return accounts;
  } catch {
    writeHistory([]);
    return [];
  }
}

function writeHistory(accounts: string[]): void {
  try {
    if (accounts.length)
      localStorage.setItem(historyKey(), JSON.stringify(accounts));
    else localStorage.removeItem(historyKey());
  } catch {
    // Optional history must not interrupt authentication.
  }
}

export function recordLoginAccount(username: string): void {
  const account = username.trim();
  if (account)
    writeHistory(normalizeHistory([account, ...readLoginAccountHistory()]));
}

export function removeLoginAccount(username: string): void {
  writeHistory(
    readLoginAccountHistory().filter((account) => account !== username),
  );
}

export function clearLoginAccountHistory(): void {
  writeHistory([]);
}
