export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown) {
  try {
    value === undefined
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, JSON.stringify(value));
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
