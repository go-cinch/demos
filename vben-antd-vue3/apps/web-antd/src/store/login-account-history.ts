import { removeLegacyCache, userCache } from '@vben/utils/cache';
const historyKey = 'login-accounts';
function historyCache() {
  const cache = userCache.anonymous();
  cache.migrate(
    historyKey,
    `LOGIN_ACCOUNT_HISTORY_${location.hostname}`,
    undefined,
    (raw) => {
      try {
        return JSON.stringify(normalizeHistory(JSON.parse(raw)));
      } catch {
        return '[]';
      }
    },
  );
  return cache;
}

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
    removeLegacyCache(`${prefix}${location.hostname}`);
  }
}

export function readLoginAccountHistory(): string[] {
  clearLegacyLoginCredentials();
  return normalizeHistory(historyCache().get(historyKey));
}

function writeHistory(accounts: string[]): void {
  const cache = historyCache();
  if (accounts.length > 0) cache.set(historyKey, accounts);
  else cache.removeItem(historyKey);
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
