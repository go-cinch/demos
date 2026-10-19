type StorageKind = 'local' | 'session';

function legacyKey(key: string): string | undefined {
  return key.startsWith('cinch-moonwhite-')
    ? key.replace(/^cinch-moonwhite-/, 'cinch-mobile-')
    : undefined;
}

export function readStored<T>(key: string, fallback: T, kind: StorageKind = 'local'): T {
  try {
    const store = kind === 'session' ? sessionStorage : localStorage;
    const previousKey = legacyKey(key);
    const current = store.getItem(key);
    const value = current ?? (previousKey ? store.getItem(previousKey) : null);
    const parsed = value ? (JSON.parse(value) as T) : fallback;
    if (previousKey && value !== null) {
      try {
        // New values win. Retain the old entry if copying it fails.
        if (current === null) store.setItem(key, value);
        store.removeItem(previousKey);
      } catch {
        /* Keep the restored value available in memory when storage is full. */
      }
    }
    return parsed;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown, kind: StorageKind = 'local') {
  try {
    const store = kind === 'session' ? sessionStorage : localStorage;
    const previousKey = legacyKey(key);
    value === undefined ? store.removeItem(key) : store.setItem(key, JSON.stringify(value));
    // Clearing a session or history must also clear its migration source.
    if (previousKey) store.removeItem(previousKey);
  } catch {
    /* Private browsing may disable persistent storage. */
  }
}
// Remove the former plaintext credential entry as soon as the app loads.
export function clearLegacyCredentials() {
  if (typeof location === 'undefined') return;
  writeStored(`go-cinch-remembered:${location.hostname}`, undefined);
}
clearLegacyCredentials();

const accountHistoryKey = () => `LOGIN_ACCOUNT_HISTORY_${location.hostname}`;
function normalizeAccounts(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ].slice(0, 10)
    : [];
}
export function loginAccountHistory(): string[] {
  clearLegacyCredentials();
  const accounts = normalizeAccounts(readStored<unknown>(accountHistoryKey(), []));
  // Rewrite malformed/older data so the entry contains usernames only.
  writeStored(accountHistoryKey(), accounts.length ? accounts : undefined);
  return accounts;
}
export function recordLoginAccount(username: string): string[] {
  const account = username.trim();
  const accounts = normalizeAccounts([account, ...loginAccountHistory()]);
  writeStored(accountHistoryKey(), accounts.length ? accounts : undefined);
  return accounts;
}
export function removeLoginAccount(username: string): string[] {
  const accounts = loginAccountHistory().filter((account) => account !== username);
  writeStored(accountHistoryKey(), accounts.length ? accounts : undefined);
  return accounts;
}
export function clearLoginAccountHistory(): string[] {
  clearLegacyCredentials();
  writeStored(accountHistoryKey(), undefined);
  return [];
}
