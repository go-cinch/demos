const historyKey = () => `LOGIN_ACCOUNT_HISTORY_${window.location.hostname}`;

function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ].slice(0, 10);
}

export function clearLegacyLoginCredentials() {
  if (typeof window === 'undefined') return;
  const hostname = window.location.hostname;
  for (const key of [
    `REMEMBER_ME_ACCOUNT_${hostname}`,
    `REMEMBER_ME_CREDENTIALS_${hostname}`,
    `go-cinch-remembered-credentials:${hostname}`,
    'go-cinch-remembered-credentials'
  ]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Browser storage is optional and must never interrupt authentication.
    }
  }
}

export function writeLoginAccountHistory(value: unknown): string[] {
  const accounts = normalizeHistory(value);
  if (typeof window === 'undefined') return accounts;
  clearLegacyLoginCredentials();
  try {
    if (accounts.length) window.localStorage.setItem(historyKey(), JSON.stringify(accounts));
    else window.localStorage.removeItem(historyKey());
  } catch {
    // Keep the current form usable when storage is blocked or full.
  }
  return accounts;
}

export function readLoginAccountHistory(): string[] {
  if (typeof window === 'undefined') return [];
  clearLegacyLoginCredentials();
  try {
    return writeLoginAccountHistory(JSON.parse(window.localStorage.getItem(historyKey()) || '[]'));
  } catch {
    return writeLoginAccountHistory([]);
  }
}

export function recordLoginAccount(username: string) {
  const account = username.trim();
  if (account) writeLoginAccountHistory([account, ...readLoginAccountHistory()]);
}
